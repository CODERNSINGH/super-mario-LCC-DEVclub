import { stream as streamLlm, ToolCallRejected, NATIVE_TOOLS, READ_ONLY_TOOLS, type LlmConfig, type Message } from '../llm/client.js'
import { execute, parseProblem, parseToolCall, EDIT_TOOLS, TOOL_DOCS, type ToolCall } from '../tools/index.js'
import { repoMap, detectTestCommand, installDeps } from '../repo/info.js'
import { runShell } from '../tools/shell.js'
import { currentDiff } from '../git.js'
import { compareRuns, describeComparison, parseTestOutput, stripAnsi, type Comparison, type TestRun } from '../repo/testparse.js'
import { extractExpected, extractRepro, judgeRepro, runRepro, traceRepro, type Repro, type Verdict } from '../repo/repro.js'
import { buildSeed, seedFromExecuted } from '../repo/seed.js'
import { CHAT_PROMPT, SYSTEM_PROMPT } from './prompt.js'

export type Mode = 'solve' | 'chat'
export interface AgentEvent { type: string; data: unknown }
export interface RunResult { finished: boolean; summary: string; inputTokens: number; outputTokens: number; steps: number }

export interface SessionState {
  mode: Mode
  root: string
  llm: LlmConfig
  issue?: { number?: number; title: string; body: string }
  notes?: string
  testCommand?: string
  messages: Message[]
  inT: number
  outT: number
  turn: number
  prepared: boolean
  testCmd: string
  hasTests: boolean
  baseline: TestRun | null
  repro: Repro | null
  expected: string | null
  reproBase: string
  reproBaseExit: number
  /** consecutive verifications where the repro output did not change / still differs */
  unchangedStreak: number
  /** the opening user message (issue + baseline + seed), kept so attempts can restart from a clean context */
  opening: string
  lastReproOutput: string
  createdFiles: Set<string>
  editVersion: number
  lastVerify: { comparison: Comparison | null; verdict: Verdict; version: number } | null
  protectedDirty: Set<string>
  deps: { stream: typeof streamLlm }
}

export interface TurnIO {
  emit: (e: AgentEvent) => void
  signal?: AbortSignal
  /** Returns (and removes) user messages queued while the turn runs; the caller emits their 'user' events. */
  drain: () => string[]
  maxSteps: number
}

export function newState(init: { mode: Mode; root: string; llm: LlmConfig; issue?: SessionState['issue']; notes?: string; testCommand?: string; deps?: Partial<SessionState['deps']> }): SessionState {
  return {
    mode: init.mode, root: init.root, llm: init.llm, issue: init.issue, notes: init.notes, testCommand: init.testCommand,
    messages: [{ role: 'system', content: init.mode === 'chat' ? CHAT_PROMPT : SYSTEM_PROMPT }],
    inT: 0, outT: 0, turn: 0, prepared: false, testCmd: '', hasTests: false, baseline: null, repro: null, expected: null, reproBase: '', reproBaseExit: 0, unchangedStreak: 0, opening: '', lastReproOutput: '', createdFiles: new Set(),
    editVersion: 0, lastVerify: null, protectedDirty: new Set(), deps: { stream: init.deps?.stream ?? streamLlm },
  }
}

const KEEP_RECENT = 10
const PROTECTED = /(^|\/)(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.lock|poetry\.lock|go\.sum)$/

/** Shrinks old tool outputs so long runs stay inside the context window (keeps the system + first message intact). */
function compact(messages: Message[]): Message[] {
  const cut = messages.length - KEEP_RECENT
  return messages.map((m, i) => (i > 1 && i < cut && m.role === 'user' && m.content.length > 700 ? { ...m, content: m.content.slice(0, 350) + '\n…[older output trimmed]…\n' + m.content.slice(-250) } : m))
}

/** Failure output without runner noise, for showing to the model. */
export function failureExcerpt(output: string, max = 2200): string {
  const lines = stripAnsi(output).split('\n').filter((l) => !/node_modules|internal\/|^\s*at .*\(node:/.test(l))
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return text.length > max ? `${text.slice(0, Math.floor(max * 0.35))}\n…\n${text.slice(-Math.floor(max * 0.65))}` : text
}

async function dirtyProtected(root: string): Promise<Set<string>> {
  const r = await runShell(root, 'git status --porcelain', 15_000)
  return new Set(r.output.split('\n').map((l) => l.slice(3).trim()).filter((p) => PROTECTED.test(p)))
}

/** First-turn preparation for solve mode: install deps, capture baseline tests + repro, build the opening message. */
async function prepare(st: SessionState, io: TurnIO): Promise<void> {
  const issue = st.issue!
  st.testCmd = st.testCommand || (await detectTestCommand(st.root)) || ''
  st.hasTests = !!st.testCmd

  io.emit({ type: 'status', data: 'Preparing environment' })
  const installLog = await installDeps(st.root)
  if (installLog) io.emit({ type: 'tool', data: { call: { tool: 'setup', args: { command: installLog.split('\n')[0].slice(2) } }, out: installLog } })
  st.protectedDirty = await dirtyProtected(st.root)

  let baselineOut = ''
  if (st.hasTests) {
    io.emit({ type: 'status', data: 'Running baseline tests' })
    const b = await runShell(st.root, `CI=1 ${st.testCmd}`, 120_000)
    st.baseline = parseTestOutput(b.output, b.code)
    baselineOut = b.output
    io.emit({ type: 'tool', data: { call: { tool: 'baseline', args: { command: st.testCmd } }, out: `exit ${b.code}\n${failureExcerpt(b.output, 1500)}` } })
  }

  st.repro = extractRepro(issue.body)
  st.expected = extractExpected(issue.body)
  let reproLine = ''
  let executedSeed = { text: '', summary: '' }
  if (st.repro) {
    io.emit({ type: 'status', data: 'Running the issue reproduction' })
    const r = await traceRepro(st.root, st.repro)
    st.reproBase = r.output
    st.reproBaseExit = r.code
    executedSeed = await seedFromExecuted(st.root, r.executed)
    reproLine = `\n# Issue reproduction (from the issue text)\nRunning the issue's snippet currently prints: ${r.output || '(nothing)'}${st.expected ? `\nThe issue says it should print: ${st.expected}` : ''}\n${executedSeed.summary ? `Functions the snippet executes: ${executedSeed.summary}\n` : ''}`
    io.emit({ type: 'tool', data: { call: { tool: 'reproduce', args: { command: 'run snippet from issue' } }, out: `${r.output || '(no output)'}${executedSeed.summary ? `\nexecuted: ${executedSeed.summary}` : ''}` } })
  }

  io.emit({ type: 'status', data: 'Finding relevant code' })
  const seed = executedSeed.text || (await buildSeed(st.root, `${issue.title}\n${issue.body}\n${st.notes ?? ''}`, baselineOut))
  const map = await repoMap(st.root, 120)

  const base = st.baseline
  const baseText = !st.hasTests ? 'No test command detected — verify your fix with the issue reproduction or a small script.'
    : !base || (base.exit === 0 && !base.failing.length) ? `Baseline: all tests pass before any change.`
    : `Baseline (before ANY change): ${base.failing.length} failing test(s):\n${base.failing.slice(0, 8).map((f) => `  - ${f}`).join('\n')}\nThese fail BEFORE your change; some belong to other issues — only the ones about THIS issue are yours.\nFailure details:\n${failureExcerpt(baselineOut)}`

  st.messages.push({
    role: 'user',
    content: `# Issue${issue.number ? ` #${issue.number}` : ''}: ${issue.title}\n\n${issue.body || '(no description)'}\n\n${st.notes ? `# Guidance from the user\n${st.notes}\n\n` : ''}# Tests\nTest command: ${st.testCmd || '(none)'}\n${baseText}\n${reproLine}${seed ? `\n# ${executedSeed.text ? 'Code executed by the issue reproduction — the bug is in here' : 'Likely relevant code (auto-selected)'}\n${seed}\n` : ''}\n# Repository files\n${map}\n\nDependencies are installed. Trace the wrong value: find the FIRST place where it becomes wrong (test a stage with a one-line command such as node -e \"console.log(require('./src/x').fn('input'))\" if unsure), fix that, using \"replace\" for a small change or \"replace_function\" (write the complete new function) when logic must change. Reply with one tool call.`,
  })
  st.opening = st.messages[st.messages.length - 1].content
  st.prepared = true
}

/** Runs tests + the issue repro after an edit and returns the feedback text for the model. */
async function verify(st: SessionState, io: TurnIO): Promise<string> {
  const parts: string[] = []
  let cmp: Comparison | null = null
  let verdict: Verdict = 'unknown'
  if (st.hasTests) {
    io.emit({ type: 'status', data: 'Running tests' })
    const t = await runShell(st.root, `CI=1 ${st.testCmd}`, 90_000)
    const now = parseTestOutput(t.output, t.code)
    cmp = compareRuns(st.baseline ?? { exit: 0, failing: [], failedCount: 0, passedCount: null, unparsed: false }, now)
    parts.push(describeComparison(cmp, now))
    if (cmp.broken.length || (!cmp.comparable && now.exit !== 0)) parts.push(`Failure details:\n${failureExcerpt(t.output, 1600)}`)
  }
  if (st.repro) {
    io.emit({ type: 'status', data: 'Running the issue reproduction' })
    const r = await runRepro(st.root, st.repro)
    st.lastReproOutput = r.output
    verdict = judgeRepro(r.output, st.expected, r.code, st.reproBaseExit)
    if (r.code !== 0 && st.reproBaseExit === 0) parts.push('The issue reproduction now CRASHES (it ran fine before your change). Your edit broke something: read the error below and fix or revert it.')
    parts.push(`Issue reproduction now prints: ${r.output || '(nothing)'}${st.reproBase ? ` (before your change: ${st.reproBase})` : ''}`)
    if (verdict === 'differs' && st.reproBase && r.output === st.reproBase) {
      st.unchangedStreak++
      parts.push('The output is UNCHANGED, so this edit did not affect the bug: your hypothesis about the cause was wrong or incomplete.')
      if (st.unchangedStreak >= 2) parts.push('Stop editing for a moment. Call think and, in 3-4 sentences: (1) trace step by step what the current code does for the issue\'s input, (2) say exactly which step is wrong, (3) state the correct algorithm. Then write the full corrected function with replace_function.')
    } else st.unchangedStreak = 0
    if (verdict === 'match') parts.push(`This MATCHES the expected behaviour in the issue (${st.expected}).`)
    else if (verdict === 'differs') parts.push(`This does NOT match the expected behaviour in the issue (${st.expected}) yet.`)
  }
  st.lastVerify = { comparison: cmp, verdict, version: st.editVersion }

  const broken = !!cmp?.broken.length
  const looksFixed = verdict === 'match' || (!st.repro && !!cmp && (cmp.fixed.length > 0 || cmp.allPass))
  if (broken) parts.push('Something is NEWLY BROKEN: fix it, or use "revert" on the file and try a different change.')
  else if (verdict === 'differs') parts.push('The issue is not fixed yet: re-read the code you changed and correct it.')
  else if (looksFixed) parts.push('Your fix looks complete and nothing is newly broken. Call finish now with a short summary. Tests that still fail were failing before your change and belong to other issues — leave them.')
  return `[Sakai verification after your edit]\n${parts.join('\n')}`
}

/** Server-side review replacing an extra model turn: returns problems that block finishing. */
async function finishProblems(st: SessionState, io: TurnIO, turnStartVersion: number): Promise<string[]> {
  const edited = st.editVersion > turnStartVersion
  if (st.turn > 0 && !edited) return [] // follow-up that changed nothing (an answer)
  const problems: string[] = []
  const diff = await currentDiff(st.root).catch(() => '')
  if (!diff.trim()) return ['The working tree has NO changes, so nothing is fixed yet.']
  const now = await dirtyProtected(st.root)
  const touched = [...now].filter((p) => !st.protectedDirty.has(p))
  if (touched.length) problems.push(`You modified dependency manifests (${touched.join(', ')}). Revert them with "revert" — dependencies must not change.`)
  if (st.lastVerify?.version !== st.editVersion && (st.hasTests || st.repro)) await verify(st, io) // stale: re-check before accepting
  const v = st.lastVerify
  if (v?.comparison?.broken.length) problems.push(`Tests newly broken by your change: ${v.comparison.broken.slice(0, 5).join('; ')}.`)
  if (v?.verdict === 'differs') problems.push(`The issue's reproduction still does not print the expected value (${st.expected}).`)
  return problems
}

export async function runTurn(st: SessionState, io: TurnIO, kind: 'work' | 'followup' | 'chat'): Promise<RunResult> {
  const { messages } = st
  const max = io.maxSteps
  const turnStartVersion = st.editVersion
  const answerAllowed = kind !== 'work'
  const tools = st.mode === 'chat' ? READ_ONLY_TOOLS : NATIVE_TOOLS
  let badFormat = 0, totalBad = 0, bounces = 0
  const seen = new Map<string, number>()
  const reads = new Map<string, number>()
  let step = 0
  // Fresh-restart strategy for stubborn issues: after repeated failed verifications, discard the changes and
  // start over from a clean context with a short lesson about what did not work.
  let attempt = 1, failedVerifies = 0
  const attemptEdits: string[] = []
  const lessons: string[] = []
  const MAX_ATTEMPTS = 3

  const result = (finished: boolean, summary: string): RunResult => ({ finished, summary, inputTokens: st.inT, outputTokens: st.outT, steps: step })

  if (st.mode === 'solve' && !st.prepared) await prepare(st, io)

  for (step = 1; step <= max; step++) {
    if (io.signal?.aborted) return result(false, 'Stopped by user')

    for (const text of io.drain()) {
      messages.push({ role: 'user', content: kind === 'chat' ? text : `[Message from the user while you work]\n${text}\n\nAcknowledge it in one short sentence of plain text, adapt your plan if it changes anything, then continue with a tool call.` })
    }

    io.emit({ type: 'status', data: `Step ${step}/${max}` })
    let r
    try {
      r = await st.deps.stream(st.llm, compact(messages), {
        onToken: (d) => io.emit({ type: 'token', data: d }),
        onThinking: (d) => io.emit({ type: 'thinking', data: d }),
      }, io.signal, tools, Math.min(0.8, 0.1 + 0.2 * st.unchangedStreak + 0.15 * (attempt - 1)))
    } catch (e) {
      if (io.signal?.aborted) return result(false, 'Stopped by user')
      if (!(e instanceof ToolCallRejected)) throw e
      totalBad++
      if (++badFormat >= 4 || totalBad >= 8) return result(false, 'Stopped: the model keeps calling tools that do not exist. Use a stronger model.')
      io.emit({ type: 'status', data: `Invalid tool call (${badFormat}/4) — asking the model to retry` })
      messages.push({ role: 'user', content: `That tool does not exist (you tried: ${e.failedGeneration.slice(0, 160)}). Use ONLY these tools: bash, search, read_file${st.mode === 'solve' ? ', replace, replace_lines, replace_function, write_file, revert, think, finish' : ', think'}. To list files use bash with "git ls-files | head -100".` })
      continue
    }
    st.inT += r.inputTokens; st.outT += r.outputTokens
    io.emit({ type: 'usage', data: { inputTokens: st.inT, outputTokens: st.outT, steps: step } })
    if (r.visible) io.emit({ type: 'assistant', data: r.visible })

    // Native function call → normalise into the same JSON-block form the history uses.
    const nativeCall: ToolCall | null = r.toolCall ? { tool: r.toolCall.name, args: Object.fromEntries(Object.entries(r.toolCall.args).map(([k, v]) => [k, typeof v === 'string' ? v : String(v)])) } : null
    messages.push({ role: 'assistant', content: nativeCall ? `${r.visible}\n\`\`\`json\n${JSON.stringify(nativeCall)}\n\`\`\`` : r.text })

    const call = nativeCall ?? parseToolCall(r.text)
    if (!call) {
      // A prose reply is a valid final answer in chat and in follow-up turns.
      if (answerAllowed && r.visible) return result(true, r.visible.slice(0, 600))
      totalBad++
      if (++badFormat >= 4 || totalBad >= 8) return result(false, 'Stopped: the model cannot produce valid tool calls. Use a stronger model — small local models (≤3B) are not reliable agents.')
      io.emit({ type: 'status', data: `Invalid tool call (${badFormat}/4) — asking the model to retry` })
      messages.push({ role: 'user', content: `${parseProblem(r.text)} Reply with exactly ONE tool call as valid JSON inside a \`\`\`json block, nothing else. Example:\n\`\`\`json\n{"tool":"search","args":{"pattern":"function sum"}}\n\`\`\`\n${TOOL_DOCS}` })
      continue
    }
    badFormat = 0

    if (call.tool === 'finish' || call.tool === 'done') {
      if (st.mode === 'chat') return result(true, r.visible || call.args.summary || '')
      const problems = await finishProblems(st, io, turnStartVersion)
      if (!problems.length) return result(true, call.args.summary ?? '')
      if (++bounces > 3) return result(false, `Could not finish: ${problems.join(' ')}`)
      io.emit({ type: 'status', data: 'Finish rejected — fixing remaining problems' })
      messages.push({ role: 'user', content: `You cannot finish yet:\n- ${problems.join('\n- ')}\nFix this, then call finish again.` })
      continue
    }

    const key = JSON.stringify(call)
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)

    let out: string
    const a = call.args
    const readKey = call.tool === 'read_file' ? `${a.path}:${a.start ?? ''}:${a.end ?? ''}:${st.editVersion}` : ''
    if (readKey && reads.has(readKey) && step - reads.get(readKey)! <= 6) {
      out = '[Sakai: you already read exactly this range a moment ago and the file has not changed; the content is earlier in this conversation. Use it: fix the bug with "replace", or read a different range.]'
    } else {
      out = await execute(st.root, call, { readOnly: st.mode === 'chat' })
      if (readKey) reads.set(readKey, step)
    }
    if (n >= 3) out += `\n[Sakai: you have repeated this exact call ${n} times. Do something different: read another file, edit, or run the tests.]`
    if (n >= 5) return result(false, 'Stopped: the model is stuck repeating the same action. Try a stronger model or add guidance naming the file and the fix.')

    let edit: { path: string; old: string; new: string } | undefined
    if (st.mode === 'solve' && EDIT_TOOLS.includes(call.tool) && out.startsWith('OK')) {
      st.editVersion++
      attemptEdits.push(`${call.tool} ${a.path ?? ''}${a.name ? ' ' + a.name + '()' : ''}`.trim())
      if (call.tool === 'write_file' && a.path) st.createdFiles.add(a.path)
      if (call.tool === 'replace') edit = { path: a.path, old: (a.old ?? '').slice(0, 2000), new: (a.new ?? '').slice(0, 2000) }
      else if (call.tool === 'write_file') edit = { path: a.path, old: '', new: (a.content ?? '').slice(0, 4000) }
      if (st.hasTests || st.repro) out += `\n\n${await verify(st, io)}`
    }
    io.emit({ type: 'tool', data: { call, out, ...(edit ? { edit } : {}) } })
    messages.push({ role: 'user', content: out })

    if (edit || call.tool === 'revert') {
      if (st.lastVerify?.verdict === 'differs' || st.lastVerify?.comparison?.broken.length) failedVerifies++
      else failedVerifies = 0
    }
    if (kind === 'work' && st.mode === 'solve' && failedVerifies >= 4 && attempt < MAX_ATTEMPTS && step <= max - 5) {
      const diff = (await currentDiff(st.root).catch(() => '')).slice(0, 1400)
      lessons.push(`Attempt ${attempt}: edits ${attemptEdits.slice(0, 6).join('; ') || '(none)'}. Afterwards the issue's reproduction printed "${st.lastReproOutput.slice(0, 200)}"${st.expected ? ` but should print "${st.expected}"` : ''}.${diff ? `\nThat attempt's diff (WRONG, do not repeat it):\n${diff}` : ''}`)
      await runShell(st.root, 'git checkout -- .', 30_000)
      for (const f of st.createdFiles) await runShell(st.root, `rm -f -- '${f.replace(/'/g, '')}'`, 10_000)
      st.createdFiles.clear(); st.editVersion++; st.lastVerify = null; st.unchangedStreak = 0
      attempt++; failedVerifies = 0; attemptEdits.length = 0; seen.clear(); reads.clear()
      st.messages.splice(1)
      st.messages.push({ role: 'user', content: `${st.opening}\n\n# Previous attempts FAILED (already reverted)\n${lessons.join('\n\n')}\n\nStart fresh with a DIFFERENT approach. First call think and state the correct algorithm in 2-3 sentences, then write it.` })
      io.emit({ type: 'status', data: `Starting a fresh attempt (${attempt}/${MAX_ATTEMPTS})` })
      io.emit({ type: 'tool', data: { call: { tool: 'restart', args: { command: `attempt ${attempt}` } }, out: 'Reverted the failed changes and restarted from a clean context.' } })
    }
  }
  return result(false, 'Step budget exhausted')
}

/** One-shot solve run (POST /run, eval scripts): a throwaway session with a single work turn. */
export interface RunOptions {
  root: string
  llm: LlmConfig
  issue: { number?: number; title: string; body: string }
  notes?: string
  testCommand?: string
  maxSteps?: number
  onEvent: (e: AgentEvent) => void
  signal?: AbortSignal
  deps?: Partial<SessionState['deps']>
}

export async function runAgent(o: RunOptions): Promise<RunResult> {
  const st = newState({ mode: 'solve', root: o.root, llm: o.llm, issue: o.issue, notes: o.notes, testCommand: o.testCommand, deps: o.deps })
  return runTurn(st, { emit: o.onEvent, signal: o.signal, drain: () => [], maxSteps: o.maxSteps ?? 30 }, 'work')
}

/** Adds the user's text as the opening/follow-up message of a turn (chat gets a repo map on first use). */
export async function pushUserMessage(st: SessionState, text: string, kind: 'followup' | 'chat'): Promise<void> {
  if (kind === 'chat') {
    const first = st.messages.length === 1
    const map = first ? `# Repository files\n${await repoMap(st.root, 120)}\n\n` : ''
    st.messages.push({ role: 'user', content: `${map}${text}` })
    return
  }
  st.messages.push({
    role: 'user',
    content: `[Follow-up from the user]\n${text}\n\nIf this is a question, answer it in plain prose with NO json and NO tool call. If it asks for code changes, make them with the tools (small "replace" edits), let Sakai's verification confirm nothing broke, then call finish. When you are completely done, or if you only needed to explain something, end with plain prose.`,
  })
}
