export interface Message { role: 'system' | 'user' | 'assistant'; content: string }
export interface LlmConfig { baseUrl: string; apiKey?: string; model: string; kind: 'openai' | 'anthropic' | 'ollama'; native?: boolean }
export interface Completion { text: string; inputTokens: number; outputTokens: number; toolCall?: { name: string; args: Record<string, unknown> } }

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
  fn('write_file', 'Create or overwrite a file.', { path: str, content: str }, ['path', 'content']),
  fn('finish', 'Finish after tests pass and the diff is reviewed.', { summary: str }, ['summary']),
]

/** Provider-agnostic chat completion. Text-in/text-out: tool calls are parsed from the reply (works on every model). */
export async function complete(cfg: LlmConfig, messages: Message[], userSignal?: AbortSignal): Promise<Completion> {
  // Never hang: every model call has a hard timeout in addition to the user's Stop button.
  const timeout = AbortSignal.timeout(180_000)
  const signal = userSignal ? AbortSignal.any([userSignal, timeout]) : timeout
  try { return await completeInner(cfg, messages, signal) } catch (e) {
    if (timeout.aborted && !userSignal?.aborted) throw new Error('The model did not respond within 3 minutes. Check that the provider is reachable and the model is loaded.')
    throw e
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Operation cancelled'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('Operation cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function parseRetryDelayMs(res: Response, body: string, attempt: number): number {
  const retryHeader = res.headers.get('retry-after')
  if (retryHeader) {
    const s = parseFloat(retryHeader)
    if (!isNaN(s) && s > 0) return Math.ceil(s * 1000) + 1500
  }
  const match = body.match(/try again in ([\d.]+)s/i)
  if (match) {
    const s = parseFloat(match[1])
    if (!isNaN(s) && s > 0) return Math.ceil(s * 1000) + 1500
  }
  return Math.min(30000, 6000 * Math.pow(2, attempt))
}

async function completeInner(cfg: LlmConfig, messages: Message[], signal: AbortSignal): Promise<Completion> {
  const base = cfg.baseUrl.replace(/\/$/, '')
  const maxRetries = 3

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (cfg.kind === 'anthropic') {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
      const res = await fetch(`${base}/messages`, {
        method: 'POST', signal,
        headers: { 'x-api-key': cfg.apiKey ?? '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, max_tokens: 4096, system, messages: messages.filter((m) => m.role !== 'system') }),
      })
      if (!res.ok) {
        const body = await res.text()
        if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
          const delay = parseRetryDelayMs(res, body, attempt)
          console.warn(`[Anthropic ${res.status}] Retrying in ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 1}/${maxRetries})...`)
          await sleep(delay, signal)
          continue
        }
        throw new Error(`Anthropic ${res.status}: ${body}`)
      }
      const d = (await res.json()) as { content: { text: string }[]; usage: { input_tokens: number; output_tokens: number } }
      return { text: d.content.map((c) => c.text).join(''), inputTokens: d.usage.input_tokens, outputTokens: d.usage.output_tokens }
    }

    const url = cfg.kind === 'ollama' ? `${base}/v1/chat/completions` : `${base}/chat/completions`
    const res = await fetch(url, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify({
        model: cfg.model, messages, temperature: 0.1,
        ...(cfg.native ? { tools: NATIVE_TOOLS, tool_choice: 'auto' } : {}),
        ...(cfg.model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'medium' } : {}),
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      if (res.status === 400 && /tool_use_failed|failed_generation/.test(body)) {
        let gen = body
        try { gen = (JSON.parse(body) as { error?: { failed_generation?: string } }).error?.failed_generation ?? body } catch { /* raw body */ }
        throw new ToolCallRejected(gen)
      }
      if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
        const delay = parseRetryDelayMs(res, body, attempt)
        console.warn(`[LLM ${res.status}] Rate limit hit. Retrying in ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 1}/${maxRetries})...`)
        await sleep(delay, signal)
        continue
      }
      throw new Error(`LLM ${res.status}: ${body}`)
    }

    const d = (await res.json()) as { choices: { message: { content: string | null; tool_calls?: { function: { name: string; arguments: string } }[] } }[]; usage?: { prompt_tokens: number; completion_tokens: number } }
    const m = d.choices[0].message
    const usage = { inputTokens: d.usage?.prompt_tokens ?? 0, outputTokens: d.usage?.completion_tokens ?? 0 }
    const tc = m.tool_calls?.[0]
    if (tc) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.function.arguments || '{}') } catch { /* leave empty; agent will ask again */ }
      return { text: m.content ?? '', ...usage, toolCall: { name: tc.function.name, args } }
    }
    return { text: m.content ?? '', ...usage }
  }

  throw new Error('LLM request failed after max retries.')
}
