import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { Session } from '../src/agent/session.js'
import type { Completion, Message, StreamHandlers } from '../src/llm/client.js'
import type { AgentEvent } from '../src/agent/loop.js'

/** A scripted model: each call pops the next reply; a reply may `wait` on a gate so tests can act mid-turn. */
interface Step { text?: string; call?: { name: string; args: Record<string, unknown> }; gate?: Promise<void>; tokens?: string[] }
function fakeModel(steps: Step[]) {
  const seen: Message[][] = []
  const stream = async (_cfg: unknown, messages: Message[], h: StreamHandlers): Promise<Completion> => {
    seen.push(messages.map((m) => ({ ...m })))
    const s = steps.shift() ?? { text: 'done' }
    for (const t of s.tokens ?? (s.text ? [s.text] : [])) h.onToken?.(t)
    await s.gate
    const text = s.text ?? (s.tokens ?? []).join('')
    return { text, visible: text, thinking: '', inputTokens: 100, outputTokens: 10, toolCall: s.call }
  }
  return { stream, seen }
}

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'sakai-sess-'))
  writeFileSync(join(root, 'a.js'), 'const x = 1\n')
  execSync('git init -q && git add . && git -c user.email=a@b -c user.name=a commit -qm init', { cwd: root })
  return root
}
const types = (ev: AgentEvent[]) => ev.map((e) => e.type)
const LLM = { baseUrl: 'x', model: 'm', kind: 'openai' as const }

test('chat session: streams tokens, answers in prose, stays idle, follow-up continues the conversation', async () => {
  const m = fakeModel([{ tokens: ['The value ', 'is 1.'] }, { text: 'Because of line 1.' }])
  const s = new Session({ root: repo(), llm: LLM, mode: 'chat', deps: { stream: m.stream as never } })
  const ev: AgentEvent[] = []
  s.subscribe((e) => ev.push(e))
  await s.send('what is x?'); await s.idle()
  assert.deepEqual(types(ev).filter((t) => ['user', 'token', 'phase', 'done'].includes(t)), ['user', 'phase', 'token', 'token', 'done', 'phase'])
  assert.equal(s.running, false)
  await s.send('why?'); await s.idle()
  const second = m.seen[1].map((x) => x.content)
  assert.ok(second.some((c) => c.includes('what is x?')) && second.some((c) => c.includes('why?')), 'history is preserved across turns')
  assert.ok(ev.filter((e) => e.type === 'done').length === 2)
})

test('message sent mid-turn is queued and injected before the next model call', async () => {
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  const root = repo()
  const m = fakeModel([
    { text: 'looking', call: { name: 'read_file', args: { path: 'a.js' } }, gate },
    { text: 'ok, adapted', call: { name: 'read_file', args: { path: 'a.js', start: '1', end: '1' } } },
    { text: 'final answer' },
  ])
  const s = new Session({ root, llm: LLM, mode: 'chat', deps: { stream: m.stream as never } })
  const ev: AgentEvent[] = []
  s.subscribe((e) => ev.push(e))
  const first = s.send('explain a.js')
  await first
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(s.running, true)
  const r = await s.send('focus on the constant please')
  assert.equal(r.queued, true)
  assert.ok(!ev.some((e) => e.type === 'user' && e.data === 'focus on the constant please'), 'not injected yet')
  release(); await s.idle()
  assert.ok(ev.some((e) => e.type === 'user' && e.data === 'focus on the constant please'), 'injected event emitted')
  const secondCall = m.seen[1].map((x) => x.content).join('\n')
  assert.match(secondCall, /focus on the constant please/)
  assert.equal(m.seen.length, 3)
})

test('chat mode is read-only: edits and modifying shell commands are refused', async () => {
  const root = repo()
  const m = fakeModel([
    { call: { name: 'replace', args: { path: 'a.js', old: 'x = 1', new: 'x = 2' } } },
    { call: { name: 'bash', args: { command: 'echo hi > a.js' } } },
    { text: 'I cannot edit here.' },
  ])
  const s = new Session({ root, llm: LLM, mode: 'chat', deps: { stream: m.stream as never } })
  const ev: AgentEvent[] = []
  s.subscribe((e) => ev.push(e))
  await s.send('change x to 2'); await s.idle()
  assert.equal(readFileSync(join(root, 'a.js'), 'utf8'), 'const x = 1\n')
  const outs = ev.filter((e) => e.type === 'tool').map((e) => (e.data as { out: string }).out)
  assert.ok(outs.every((o) => o.startsWith('ERROR')))
})

test('stop aborts the running turn and drops queued messages', async () => {
  const never = new Promise<void>(() => undefined)
  const stream = async (_c: unknown, _m: Message[], _h: StreamHandlers, signal?: AbortSignal): Promise<Completion> => {
    await new Promise((_, rej) => signal?.addEventListener('abort', () => rej(new Error('aborted'))))
    await never
    throw new Error('unreachable')
  }
  const s = new Session({ root: repo(), llm: LLM, mode: 'chat', deps: { stream: stream as never } })
  const ev: AgentEvent[] = []
  s.subscribe((e) => ev.push(e))
  await s.send('hello')
  await new Promise((r) => setTimeout(r, 20))
  await s.send('queued one')
  s.stop(); await s.idle()
  assert.equal(s.running, false)
  const done = ev.filter((e) => e.type === 'done').pop()!.data as { summary: string }
  assert.match(done.summary, /Stopped/)
  assert.ok(!ev.some((e) => e.type === 'user' && e.data === 'queued one'))
})

test('new subscribers get a compact replay of everything so far', async () => {
  const m = fakeModel([{ tokens: ['a', 'b', 'c'] }])
  const s = new Session({ root: repo(), llm: LLM, mode: 'chat', deps: { stream: m.stream as never } })
  await s.send('hi'); await s.idle()
  const replay: AgentEvent[] = []
  s.subscribe((e) => replay.push(e))
  assert.equal(replay.filter((e) => e.type === 'token').length, 1)
  assert.equal(replay.find((e) => e.type === 'token')!.data, 'abc')
})

test('solve session: edits a file, verifies via repro, finish is gated, then follow-up chat works', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sakai-solve-'))
  writeFileSync(join(root, 'math.js'), 'module.exports = { mul: (a, b) => (a || 1) * (b || 1) }\n')
  execSync('git init -q && git add . && git -c user.email=a@b -c user.name=a commit -qm init', { cwd: root })
  const issue = { title: 'mul(5,0) returns 5', body: '### Steps to Reproduce\n```js\nconsole.log(require("./math").mul(5, 0))\n```\n\n### Expected Behavior\n`0`\n' }
  const m = fakeModel([
    { text: 'Fixing.', call: { name: 'replace', args: { path: 'math.js', old: '(a || 1) * (b || 1)', new: 'a * b' } } },
    { text: 'done', call: { name: 'finish', args: { summary: 'removed the || 1 fallbacks' } } },
    { text: 'Because 0 is falsy in JS, so `0 || 1` was 1.' },
  ])
  const s = new Session({ root, llm: LLM, mode: 'solve', issue, deps: { stream: m.stream as never } })
  const ev: AgentEvent[] = []
  s.subscribe((e) => ev.push(e))
  s.start(); await s.idle()
  const toolEv = ev.find((e) => e.type === 'tool' && (e.data as { call: { tool: string } }).call.tool === 'replace')!.data as { out: string; edit?: { path: string; old: string; new: string } }
  assert.match(toolEv.out, /MATCHES the expected behaviour/)
  assert.deepEqual(toolEv.edit, { path: 'math.js', old: '(a || 1) * (b || 1)', new: 'a * b' })
  const done = ev.filter((e) => e.type === 'done')[0].data as { finished: boolean }
  assert.equal(done.finished, true)
  assert.equal(s.running, false)
  // follow-up after finishing: same conversation, prose answer
  await s.send('why did it fail?'); await s.idle()
  const last = ev.filter((e) => e.type === 'done').pop()!.data as { finished: boolean; summary: string }
  assert.match(last.summary, /falsy/)
})

test('solve finish is rejected when the reproduction still differs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sakai-solve2-'))
  writeFileSync(join(root, 'math.js'), 'module.exports = { mul: (a, b) => (a || 1) * (b || 1) }\n')
  execSync('git init -q && git add . && git -c user.email=a@b -c user.name=a commit -qm init', { cwd: root })
  const issue = { title: 'mul', body: '### Steps to Reproduce\n```js\nconsole.log(require("./math").mul(5, 0))\n```\n### Expected Behavior\n`0`\n' }
  const m = fakeModel([
    { call: { name: 'replace', args: { path: 'math.js', old: 'mul:', new: 'mul: /* touched */' } } }, // harmless edit: repro still prints 5
    { call: { name: 'finish', args: { summary: 'claimed fixed' } } },
    { call: { name: 'replace', args: { path: 'math.js', old: '(a || 1) * (b || 1)', new: 'a * b' } } },
    { call: { name: 'finish', args: { summary: 'really fixed' } } },
  ])
  const s = new Session({ root, llm: LLM, mode: 'solve', issue, deps: { stream: m.stream as never } })
  const ev: AgentEvent[] = []
  s.subscribe((e) => ev.push(e))
  s.start(); await s.idle()
  assert.ok(ev.some((e) => e.type === 'status' && /Finish rejected/.test(String(e.data))))
  const done = ev.filter((e) => e.type === 'done')[0].data as { finished: boolean; summary: string }
  assert.equal(done.finished, true); assert.match(done.summary, /really fixed/)
})
