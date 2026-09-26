import { complete, ToolCallRejected, type LlmConfig, type Message } from '../llm/client.js'
import { execute, parseProblem, parseToolCall, TOOL_DOCS, type ToolCall } from '../tools/index.js'
import { repoMap, detectTestCommand, installDeps } from '../repo/info.js'
import { runShell } from '../tools/shell.js'
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

  // Prepare the environment like an engineer would: install deps, then run the tests once to see what is failing.
  o.onEvent({ type: 'status', data: 'Preparing environment' })
  const installLog = await installDeps(o.root)
  if (installLog) o.onEvent({ type: 'tool', data: { call: { tool: 'setup', args: { command: installLog.split('\n')[0].slice(2) } }, out: installLog } })
  let baseline = ''
  if (o.testCommand || testCmd !== 'unknown (find it in the repo)') {
    o.onEvent({ type: 'status', data: 'Running baseline tests' })
    const b = await runShell(o.root, `CI=1 ${testCmd}`, 180_000)
    const out = b.output.length > 4500 ? `${b.output.slice(0, 1200)}\n…\n${b.output.slice(-3000)}` : b.output
    baseline = `\n\n# Baseline test run BEFORE any change (exit ${b.code})\n${out}`
    o.onEvent({ type: 'tool', data: { call: { tool: 'baseline', args: { command: testCmd } }, out: `exit ${b.code}\n${out.slice(-1500)}` } })
  }
  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `# Issue${o.issue.number ? ` #${o.issue.number}` : ''}: ${o.issue.title}\n\n${o.issue.body || '(no description)'}\n\n${o.notes ? `# Guidance from the user\n${o.notes}\n\n` : ''}# Test command\n${testCmd}${baseline}\n\n# Repository files\n${map}\n\nDependencies are installed. Use the failing tests above to localize the bug, read the relevant source, then fix it. Reply with one tool call.`,
    },
  ]
  let inT = 0, outT = 0, ranTests = false, reviewed = false, badFormat = 0, totalBad = 0
  const seen = new Map<string, number>()
  const max = o.maxSteps ?? 30

  for (let step = 1; step <= max; step++) {
    if (o.signal?.aborted) return { finished: false, summary: 'Cancelled', inputTokens: inT, outputTokens: outT, steps: step - 1 }
    o.onEvent({ type: 'status', data: `Step ${step}/${max}` })
    let r
    try {
      r = await complete(o.llm, compact(messages), o.signal)
    } catch (e) {
      if (!(e instanceof ToolCallRejected)) throw e
      // The model tried a tool we don't offer (e.g. gpt-oss "repo_browser.*"). Correct it and retry.
      totalBad++
      if (++badFormat >= 4 || totalBad >= 8) return { finished: false, summary: 'Stopped: the model keeps calling tools that do not exist. Use a stronger model (see the model warning).', inputTokens: inT, outputTokens: outT, steps: step }
      o.onEvent({ type: 'status', data: `Invalid tool call (${badFormat}/4) — asking the model to retry` })
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
      totalBad++
      if (++badFormat >= 4 || totalBad >= 8) return { finished: false, summary: 'Stopped: the model cannot produce valid tool calls. Use a stronger model — small local models (≤3B) are not reliable agents.', inputTokens: inT, outputTokens: outT, steps: step }
      o.onEvent({ type: 'status', data: `Invalid tool call (${badFormat}/4) — asking the model to retry` })
      messages.push({ role: 'user', content: `${parseProblem(r.text)} Reply with exactly ONE tool call as valid JSON inside a \`\`\`json block, nothing else. Example:\n\`\`\`json\n{"tool":"search","args":{"pattern":"function sum"}}\n\`\`\`\n${TOOL_DOCS}` })
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
    if (n >= 3) out += `\n[Sakai: you have repeated this exact call ${n} times with the same result. Do something different: read another file, edit, or run the tests.]`
    if (n >= 5) return { finished: false, summary: 'Stopped: the model is stuck repeating the same action. Try a stronger model or add guidance naming the file and the fix.', inputTokens: inT, outputTokens: outT, steps: step }
    if (call.tool === 'replace' || call.tool === 'write_file') reviewed = false
    o.onEvent({ type: 'tool', data: { call, out } })
    messages.push({ role: 'user', content: out })
  }
  return { finished: false, summary: 'Step budget exhausted', inputTokens: inT, outputTokens: outT, steps: max }
}
