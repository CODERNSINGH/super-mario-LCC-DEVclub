import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StreamFilter } from '../src/llm/filter.js'

function run(chunks: string[]) {
  const text: string[] = [], think: string[] = []
  const f = new StreamFilter((s) => text.push(s), (s) => think.push(s))
  chunks.forEach((c) => f.push(c))
  f.end()
  return { visible: f.visible, thinking: f.thinking, streamed: text.join(''), streamedThink: think.join(''), raw: f.raw }
}
const split = (s: string, n: number) => s.match(new RegExp(`[\\s\\S]{1,${n}}`, 'g')) ?? []

test('plain prose streams through untouched', () => {
  const r = run(['Hello ', 'world, ', 'how are you?'])
  assert.equal(r.visible, 'Hello world, how are you?')
  assert.equal(r.streamed, r.visible)
})

test('fenced tool JSON is dropped, prose kept — at every chunk size', () => {
  const msg = 'Let me look at the file.\n```json\n{"tool":"read_file","args":{"path":"a.js"}}\n```'
  for (const n of [1, 2, 3, 5, 8, 100]) {
    const r = run(split(msg, n))
    assert.equal(r.visible.trim(), 'Let me look at the file.', `chunk size ${n}`)
    assert.equal(r.streamed.trim(), 'Let me look at the file.', `chunk size ${n}`)
    assert.equal(r.raw, msg)
  }
})

test('bare tool JSON on its own line is dropped', () => {
  for (const n of [1, 4, 100]) {
    const r = run(split('Checking.\n{"tool":"bash","args":{"command":"ls {a,b}"}}', n))
    assert.equal(r.visible.trim(), 'Checking.', `chunk size ${n}`)
  }
})

test('tool JSON with braces and quotes inside strings is matched correctly', () => {
  const r = run(split('{"tool":"replace","args":{"old":"if (x) { return \\"}\\" }","new":"y"}}\nDone.', 3))
  assert.equal(r.visible.trim(), 'Done.')
})

test('ordinary code fences and JSON without "tool" are kept', () => {
  const r = run(split('Use this:\n```js\nconst a = {x: 1}\n```\nand {"name":"x"} inline.', 4))
  assert.match(r.visible, /const a = \{x: 1\}/)
  assert.match(r.visible, /\{"name":"x"\}/)
})

test('<think> blocks become thinking, not text — even split across chunks', () => {
  for (const n of [1, 2, 3, 100]) {
    const r = run(split('<think>secret plan</think>The answer is 4.', n))
    assert.equal(r.thinking, 'secret plan', `chunk size ${n}`)
    assert.equal(r.visible, 'The answer is 4.', `chunk size ${n}`)
  }
})

test('out-of-band reasoning is forwarded as thinking', () => {
  const think: string[] = []
  const f = new StreamFilter(() => undefined, (s) => think.push(s))
  f.pushThinking('step 1 '); f.pushThinking('step 2'); f.push('ok'); f.end()
  assert.equal(think.join(''), 'step 1 step 2')
  assert.equal(f.visible, 'ok')
})

test('unterminated tool JSON at end of stream is still hidden', () => {
  const r = run(['Thinking.\n```json\n{"tool":"bash","args":{"command":"ls"}'])
  assert.equal(r.visible.trim(), 'Thinking.')
})
