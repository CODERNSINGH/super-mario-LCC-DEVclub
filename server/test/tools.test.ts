import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseToolCall, execute } from '../src/tools/index.js'
import { safePath } from '../src/tools/shell.js'

test('parses fenced json tool call', () => {
  const c = parseToolCall('thinking\n```json\n{"tool":"bash","args":{"command":"ls"}}\n```')
  assert.deepEqual(c, { tool: 'bash', args: { command: 'ls' } })
})

test('repairs raw newlines inside strings and trailing commas', () => {
  const c = parseToolCall('```json\n{"tool":"write_file","args":{"path":"a.txt","content":"line1\nline2",}}\n```')
  assert.equal(c?.args.content, 'line1\nline2')
})

test('ignores <think> blocks and reads bare json', () => {
  const c = parseToolCall('<think>{"tool":"x"}</think>{"tool":"finish","args":{"summary":"ok"}}')
  assert.equal(c?.tool, 'finish')
})

test('safePath rejects escapes', () => {
  assert.throws(() => safePath('/repo', '../etc/passwd'))
  assert.equal(safePath('/repo', 'src/a.ts'), '/repo/src/a.ts')
})

test('replace requires a unique match', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sakai-'))
  writeFileSync(join(root, 'f.txt'), 'a a b')
  assert.match(await execute(root, { tool: 'replace', args: { path: 'f.txt', old: 'a', new: 'x' } }), /matched 2 times/)
  assert.equal(await execute(root, { tool: 'replace', args: { path: 'f.txt', old: 'b', new: 'c' } }), 'OK')
  assert.equal(readFileSync(join(root, 'f.txt'), 'utf8'), 'a a c')
})
