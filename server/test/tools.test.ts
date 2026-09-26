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

test('cleanPath strips line suffixes and ./', async () => {
  const { cleanPath } = await import('../src/tools/index.js')
  assert.equal(cleanPath('src/calculator.js#L10'), 'src/calculator.js')
  assert.equal(cleanPath('./src/a.ts:42'), 'src/a.ts')
  assert.equal(cleanPath('src/a.ts#L3-L9'), 'src/a.ts')
})

test('repairs a stray quote after a number', () => {
  const c = parseToolCall('```json\n{"tool":"read_file","args":{"path":"src/a.js","start":15,"end":25"}}\n```')
  assert.deepEqual(c, { tool: 'read_file', args: { path: 'src/a.js', start: '15', end: '25' } })
})

test('lenient parser keeps unescaped quotes inside code', () => {
  const c = parseToolCall('{"tool":"replace","args":{"path":"a.js","old":"return a - b","new":"return a - b + "x""}}')
  assert.equal(c?.tool, 'replace')
  assert.equal(c?.args.new, 'return a - b + "x"')
})

test('bash guard blocks dependency and git changes', async () => {
  const { blockedCommand } = await import('../src/tools/index.js')
  assert.ok(blockedCommand('npm install --save-dev jest'))
  assert.ok(blockedCommand('git commit -am x'))
  assert.equal(blockedCommand('npm test'), null)
  assert.equal(blockedCommand('git diff'), null)
})
