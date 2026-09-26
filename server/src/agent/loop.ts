import { complete, ToolCallRejected, type LlmConfig, type Message } from '../llm/client.js'
import { execute, parseToolCall, TOOL_DOCS, type ToolCall } from '../tools/index.js'
import { repoMap, detectTestCommand } from '../repo/info.js'
import { currentDiff } from '../git.js'
import { SYSTEM_PROMPT } from './prompt.js'

export type AgentEvent =
  | { type: 'status'; data: string }
  | { type: 'assistant'; data: string }
  | { type: 'tool'; data: { call: ToolCall; out: string } }
  | { type: 'usage'; data: { inputTokens: number; outputTokens: number; steps: number } }

export interface RunOptions {
  root: string
  llm: LlmConfig
  issue: { number?: number; title: string; body: string }
  notes?: string
  testCommand?: string
  maxSteps?: number
  onEvent: (e: AgentEvent) => void
  signal?: AbortSignal
}

export interface RunResult { finished: boolean; summary: string; inputTokens: number; outputTokens: number; steps: number }

const KEEP_RECENT = 8
const isTestCmd = (c: ToolCall, t?: string) => c.tool === 'bash' && /test|pytest|jest|vitest|cargo|go test|mvn|gradle|rspec|tsc|lint/.test(c.args.command ?? (t ?? '\0'))

/** Shrinks old tool outputs so long runs stay inside the context window. */
function compact(messages: Message[]): Message[] {
  const cut = messages.length - KEEP_RECENT
  return messages.map((m, i) => (i > 1 && i < cut && m.role === 'user' && m.content.length > 700 ? { ...m, content: m.content.slice(0, 350) + '\n…[older output trimmed]…\n' + m.content.slice(-250) } : m))
}

export async function runAgent(o: RunOptions): Promise<RunResult> {
  const testCmd = o.testCommand || (await detectTestCommand(o.root)) || 'unknown (find it in the repo)'
  const map = await repoMap(o.root)
  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `# Issue${o.issue.number ? ` #${o.issue.number}` : ''}: ${o.issue.title}\n\n${o.issue.body || '(no description)'}\n\n${o.notes ? `# Guidance from the user\n${o.notes}\n\n` : ''}# Test command\n${testCmd}\n\n# Repository files\n${map}\n\nBegin with step 1. Reply with one tool call.`,
    },
  ]
  let inT = 0, outT = 0, ranTests = false, reviewed = false, badFormat = 0
  const seen = new Map<string, number>()
  const max = o.maxSteps ?? 45

  for (let step = 1; step <= max; step++) {
    if (o.signal?.aborted) return { finished: false, summary: 'Cancelled', inputTokens: inT, outputTokens: outT, steps: step - 1 }
    o.onEvent({ type: 'status', data: `Step ${step}/${max}` })
    let r
    try {
      r = await complete(o.llm, compact(messages), o.signal)
    } catch (e) {
      if (!(e instanceof ToolCallRejected)) throw e
      // The model tried a tool we don't offer (e.g. gpt-oss "repo_browser.*"). Correct it and retry.
      if (++badFormat >= 4) return { finished: false, summary: 'Model repeatedly called tools that do not exist', inputTokens: inT, outputTokens: outT, steps: step }
      o.onEvent({ type: 'status', data: 'Model used an unknown tool; retrying' })
      messages.push({ role: 'user', content: `That tool does not exist (you tried: ${e.failedGeneration.slice(0, 160)}). Use ONLY these tools: bash, search, read_file, replace, write_file, finish. To list files use bash with "git ls-files | head -100".` })
      continue
    }
    inT += r.inputTokens; outT += r.outputTokens
    o.onEvent({ type: 'usage', data: { inputTokens: inT, outputTokens: outT, steps: step } })
    o.onEvent({ type: 'assistant', data: r.text })
    // Native function call → normalise into the same JSON-block form the history uses.
    const nativeCall: ToolCall | null = r.toolCall ? { tool: r.toolCall.name, args: Object.fromEntries(Object.entries(r.toolCall.args).map(([k, v]) => [k, typeof v === 'string' ? v : String(v)])) } : null
    messages.push({ role: 'assistant', content: nativeCall ? `${r.text}\n\`\`\`json\n${JSON.stringify(nativeCall)}\n\`\`\`` : r.text })

    const call = nativeCall ?? parseToolCall(r.text)
    if (!call) {
      if (++badFormat >= 4) return { finished: false, summary: 'Model repeatedly failed to produce valid tool calls', inputTokens: inT, outputTokens: outT, steps: step }
      messages.push({ role: 'user', content: `Invalid format. Reply with exactly ONE tool call as valid JSON inside a \`\`\`json block, nothing else. Example:\n\`\`\`json\n{"tool":"search","args":{"pattern":"function sum"}}\n\`\`\`\n${TOOL_DOCS}` })
      continue
    }
    badFormat = 0

    if (call.tool === 'finish' || call.tool === 'done') {
      if (!ranTests && !reviewed) {
        messages.push({ role: 'user', content: `You have not run any tests or checks yet. Run the test command (${testCmd}) or another verification, then finish.` })
        reviewed = false; ranTests = true
        continue
      }
      if (!reviewed) {
        reviewed = true
        const diff = (await currentDiff(o.root).catch(() => '')).slice(0, 14_000)
        if (!diff.trim()) { messages.push({ role: 'user', content: 'The working tree has NO changes. You cannot finish without a fix. Continue.' }); reviewed = false; continue }
        messages.push({ role: 'user', content: `Final review. Here is your complete diff:\n\n${diff}\n\nCheck it against every requirement and edge case in the issue, plus unrelated or debug changes. If anything is missing or wrong, fix it (and re-run tests). If it is complete and verified, call finish again.` })
        continue
      }
      return { finished: true, summary: call.args.summary ?? '', inputTokens: inT, outputTokens: outT, steps: step }
    }

    const key = JSON.stringify(call)
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    let out = await execute(o.root, call)
    if (isTestCmd(call, testCmd)) ranTests = true
    if (call.tool !== 'read_file' && call.tool !== 'search' && n >= 3) out += '\n[Sakai: you have repeated this exact call 3 times. Change approach.]'
    if (call.tool === 'replace' || call.tool === 'write_file') reviewed = false
    o.onEvent({ type: 'tool', data: { call, out } })
    messages.push({ role: 'user', content: out })
  }
  return { finished: false, summary: 'Step budget exhausted', inputTokens: inT, outputTokens: outT, steps: max }
}
