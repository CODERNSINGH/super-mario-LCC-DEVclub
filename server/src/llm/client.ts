import { StreamFilter } from './filter.js'

export interface Message { role: 'system' | 'user' | 'assistant'; content: string }
export interface LlmConfig { baseUrl: string; apiKey?: string; model: string; kind: 'openai' | 'anthropic' | 'ollama'; native?: boolean }
export interface Completion {
  /** Raw model text including any tool-call JSON (used for parsing). */
  text: string
  /** Text meant for the user: no reasoning blocks, no tool-call JSON. */
  visible: string
  thinking: string
  inputTokens: number
  outputTokens: number
  toolCall?: { name: string; args: Record<string, unknown> }
}
export interface StreamHandlers { onToken?: (d: string) => void; onThinking?: (d: string) => void }

/** Raised when the provider rejects a malformed tool call (e.g. Groq `tool_use_failed`); the agent recovers from it. */
export class ToolCallRejected extends Error {
  constructor(public failedGeneration: string) { super('Provider rejected the tool call') }
}

const str = { type: 'string' }
const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } })

/** Native function-calling schema; mirrors the text protocol in tools/index.ts. */
export const NATIVE_TOOLS = [
  fn('bash', 'Run a shell command in the repository root.', { command: str }, ['command']),
  fn('search', 'Search the repository with a regex; returns file:line matches.', { pattern: str, path: { type: 'string', description: 'optional sub-directory' } }, ['pattern']),
  fn('read_file', 'Read a numbered line range of a file.', { path: str, start: str, end: str }, ['path']),
  fn('replace', 'Replace exactly one occurrence of old with new in a file.', { path: str, old: str, new: str }, ['path', 'old', 'new']),
  fn('replace_function', 'Rewrite one whole function by name; provide the COMPLETE new function text. Best when the logic must change.', { path: str, name: str, new: str, line: { type: 'string', description: 'only if the name is defined more than once' } }, ['path', 'name', 'new']),
  fn('replace_lines', 'Replace an inclusive line range (numbers from read_file) with new text. Best for multi-line edits.', { path: str, start: str, end: str, new: str }, ['path', 'start', 'end', 'new']),
  fn('write_file', 'Create a NEW file (fails if it already exists).', { path: str, content: str }, ['path', 'content']),
  fn('revert', 'Undo all your changes to one file.', { path: str }, ['path']),
  fn('think', 'Private scratchpad: plan the algorithm or explain the cause before editing. No side effects.', { thought: str }, ['thought']),
  fn('finish', 'Finish after your fix is verified.', { summary: str }, ['summary']),
]
export const READ_ONLY_TOOLS = NATIVE_TOOLS.filter((t) => ['bash', 'search', 'read_file', 'think'].includes(t.function.name))

const chars = (m: Message[]) => m.reduce((n, x) => n + x.content.length, 0)

/** Idle-based timeout: a slow model may take long to start, but a stalled stream is aborted. */
function guard(user?: AbortSignal, firstMs = 120_000, idleMs = 75_000) {
  const ac = new AbortController()
  let timedOut = false
  let t: ReturnType<typeof setTimeout>
  const arm = (ms: number) => { clearTimeout(t); t = setTimeout(() => { timedOut = true; ac.abort() }, ms) }
  arm(firstMs)
  const onAbort = () => ac.abort()
  user?.addEventListener('abort', onAbort)
  return { signal: ac.signal, touch: () => arm(idleMs), done: () => { clearTimeout(t); user?.removeEventListener('abort', onAbort) }, timedOut: () => timedOut }
}

const TIMEOUT_MSG = 'The model stopped responding (no output for 2 minutes). Check that the provider is reachable and the model is loaded.'

function bodyFor(cfg: LlmConfig, messages: Message[], tools: unknown[] | undefined, streaming: boolean, temperature = 0.1) {
  return {
    model: cfg.model, messages, temperature,
    ...(streaming ? { stream: true, stream_options: { include_usage: true } } : {}),
    ...(cfg.native && tools ? { tools, tool_choice: 'auto' } : {}),
    ...(cfg.model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'medium' } : {}),
  }
}

async function rejectIfToolFailure(status: number, body: string): Promise<never> {
  if (status === 400 && /tool_use_failed|failed_generation/.test(body)) {
    let gen = body
    try { gen = (JSON.parse(body) as { error?: { failed_generation?: string } }).error?.failed_generation ?? body } catch { /* raw body */ }
    throw new ToolCallRejected(gen)
  }
  throw new Error(`LLM ${status}: ${body}`)
}

/** Reads an SSE response, calling `onData` with each parsed `data:` JSON payload. */
async function readSse(res: Response, touch: () => void, onData: (json: Record<string, unknown>) => void): Promise<void> {
  if (!res.body) throw new Error('The provider returned no stream')
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    touch()
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try { onData(JSON.parse(payload) as Record<string, unknown>) } catch (e) { if (e instanceof ToolCallRejected) throw e }
    }
  }
}

/** Streaming chat completion: OpenAI-compatible (Groq, DeepSeek, Qwen, OpenAI, LM Studio, Ollama /v1) and Anthropic. */
export async function stream(cfg: LlmConfig, messages: Message[], h: StreamHandlers, userSignal?: AbortSignal, tools?: unknown[], temperature = 0.1): Promise<Completion> {
  const g = guard(userSignal)
  const filter = new StreamFilter((s) => h.onToken?.(s), (s) => h.onThinking?.(s))
  let inputTokens = 0, outputTokens = 0
  const tc = { name: '', args: '' }
  let sawTool = false
  const base = cfg.baseUrl.replace(/\/$/, '')
  try {
    if (cfg.kind === 'anthropic') {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
      const res = await fetch(`${base}/messages`, {
        method: 'POST', signal: g.signal,
        headers: { 'x-api-key': cfg.apiKey ?? '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, max_tokens: 4096, stream: true, system, messages: messages.filter((m) => m.role !== 'system') }),
      })
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
      await readSse(res, g.touch, (j) => {
        const type = j.type as string
        if (type === 'message_start') inputTokens = ((j.message as { usage?: { input_tokens?: number } })?.usage?.input_tokens) ?? 0
        else if (type === 'content_block_delta') {
          const d = j.delta as { type: string; text?: string; thinking?: string }
          if (d.type === 'text_delta' && d.text) filter.push(d.text)
          else if (d.type === 'thinking_delta' && d.thinking) filter.pushThinking(d.thinking)
        } else if (type === 'message_delta') outputTokens = ((j.usage as { output_tokens?: number })?.output_tokens) ?? outputTokens
        else if (type === 'error') throw new Error(`Anthropic: ${JSON.stringify(j.error)}`)
      })
    } else {
      const url = cfg.kind === 'ollama' ? `${base}/v1/chat/completions` : `${base}/chat/completions`
      const res = await fetch(url, {
        method: 'POST', signal: g.signal,
        headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify(bodyFor(cfg, messages, tools, true, temperature)),
      })
      if (!res.ok) await rejectIfToolFailure(res.status, await res.text())
      await readSse(res, g.touch, (j) => {
        const err = j.error as { code?: string; message?: string; failed_generation?: string } | undefined
        if (err) {
          if (/tool_use_failed/.test(String(err.code) + String(err.message))) throw new ToolCallRejected(err.failed_generation ?? String(err.message))
          throw new Error(`LLM error: ${JSON.stringify(err)}`)
        }
        const usage = j.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
        if (usage) { inputTokens = usage.prompt_tokens ?? inputTokens; outputTokens = usage.completion_tokens ?? outputTokens }
        const delta = (j.choices as { delta?: Record<string, unknown> }[] | undefined)?.[0]?.delta
        if (!delta) return
        if (typeof delta.content === 'string') filter.push(delta.content)
        for (const key of ['reasoning', 'reasoning_content', 'thinking']) if (typeof delta[key] === 'string') filter.pushThinking(delta[key] as string)
        const calls = delta.tool_calls as { function?: { name?: string; arguments?: string } }[] | undefined
        const first = calls?.[0]?.function
        if (first) { sawTool = true; if (first.name) tc.name = first.name; if (first.arguments) tc.args += first.arguments }
      })
    }
    filter.end()
  } catch (e) {
    if (g.timedOut() && !userSignal?.aborted) throw new Error(TIMEOUT_MSG)
    throw e
  } finally { g.done() }

  let toolCall: Completion['toolCall']
  if (sawTool && tc.name) {
    let args: Record<string, unknown> = {}
    try { args = JSON.parse(tc.args || '{}') } catch { /* leave empty; the agent will ask again */ }
    toolCall = { name: tc.name, args }
  }
  // Providers that omit usage: estimate from character counts.
  if (!inputTokens) inputTokens = Math.ceil(chars(messages) / 4)
  if (!outputTokens) outputTokens = Math.ceil((filter.raw.length + filter.thinking.length + tc.args.length) / 4)
  return { text: filter.raw, visible: filter.visible.trim(), thinking: filter.thinking, inputTokens, outputTokens, toolCall }
}

/** Non-streaming completion (cost-estimate tips etc.). */
export async function complete(cfg: LlmConfig, messages: Message[], userSignal?: AbortSignal): Promise<Completion> {
  const g = guard(userSignal, 120_000, 75_000)
  const base = cfg.baseUrl.replace(/\/$/, '')
  try {
    if (cfg.kind === 'anthropic') {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
      const res = await fetch(`${base}/messages`, {
        method: 'POST', signal: g.signal,
        headers: { 'x-api-key': cfg.apiKey ?? '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, max_tokens: 1024, system, messages: messages.filter((m) => m.role !== 'system') }),
      })
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
      const d = (await res.json()) as { content: { text: string }[]; usage: { input_tokens: number; output_tokens: number } }
      const text = d.content.map((c) => c.text).join('')
      return { text, visible: text, thinking: '', inputTokens: d.usage.input_tokens, outputTokens: d.usage.output_tokens }
    }
    const url = cfg.kind === 'ollama' ? `${base}/v1/chat/completions` : `${base}/chat/completions`
    const res = await fetch(url, { method: 'POST', signal: g.signal, headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) }, body: JSON.stringify(bodyFor({ ...cfg, native: false }, messages, undefined, false)) })
    if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`)
    const d = (await res.json()) as { choices: { message: { content: string | null } }[]; usage?: { prompt_tokens: number; completion_tokens: number } }
    const text = d.choices[0].message.content ?? ''
    return { text, visible: text, thinking: '', inputTokens: d.usage?.prompt_tokens ?? 0, outputTokens: d.usage?.completion_tokens ?? 0 }
  } catch (e) {
    if (g.timedOut() && !userSignal?.aborted) throw new Error(TIMEOUT_MSG)
    throw e
  } finally { g.done() }
}
