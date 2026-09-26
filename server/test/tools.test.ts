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

test('applyReplace: exact, whitespace-insensitive multi-line, and helpful failures', async () => {
  const { applyReplace } = await import('../src/tools/index.js')
  const src = 'function multiply(a, b) {\n  const numA = a || 1;\n  const numB = b || 1;\n  return numA * numB;\n}\n'
  const exact = applyReplace(src, 'return numA * numB;', 'return a * b;')
  assert.ok(exact.ok && !exact.fuzzy && exact.result.includes('return a * b;'))
  // two statements joined on one line (what qwen2.5:7b produced) still matches the two source lines
  const joined = applyReplace(src, 'const numA = a || 1; const numB = b || 1;', 'if (a === 0 || b === 0) return 0;\nconst numA = a;\nconst numB = b;')
  assert.ok(joined.ok && joined.fuzzy)
  if (joined.ok) assert.equal(joined.result, 'function multiply(a, b) {\n  if (a === 0 || b === 0) return 0;\n  const numA = a;\n  const numB = b;\n  return numA * numB;\n}\n')
  const missing = applyReplace(src, 'const numA = a || 2;', 'x')
  assert.ok(!missing.ok && /numA/.test((missing as { error: string }).error))
  assert.ok(!applyReplace(src, 'return numA * numB;', 'return numA * numB;').ok)
  assert.ok(!applyReplace('a\na\n', 'a', 'b').ok)
})

test('replace_lines replaces an inclusive line range and validates bounds', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sakai-rl-'))
  writeFileSync(join(root, 'f.js'), 'a\nb\nc\nd\n')
  const out = await execute(root, { tool: 'replace_lines', args: { path: 'f.js', start: '2', end: '3', new: 'X\nY\nZ' } })
  assert.match(out, /^OK: replaced lines 2-3 with 3 line/)
  assert.equal(readFileSync(join(root, 'f.js'), 'utf8'), 'a\nX\nY\nZ\nd\n')
  assert.match(await execute(root, { tool: 'replace_lines', args: { path: 'f.js', start: '9', end: '10', new: 'x' } }), /invalid line range/)
})

test('replaceFunction finds JS/py functions by name and re-indents the new text', async () => {
  const { replaceFunction, findFunctions } = await import('../src/tools/fn.js')
  const js = 'class C {\n  a() {\n    return "}"\n  }\n  evaluate(x) {\n    // { comment\n    return x\n  }\n}\nfunction evaluate2(y) { return y }\n'
  const r = replaceFunction(js, 'evaluate', 'evaluate(x) {\n  return x * 2\n}')
  assert.ok(r.ok)
  if (r.ok) assert.equal(r.result, 'class C {\n  a() {\n    return "}"\n  }\n  evaluate(x) {\n    return x * 2\n  }\n}\nfunction evaluate2(y) { return y }\n')
  const py = 'def a():\n    return 1\n\ndef b(x):\n    y = x\n\n    return y\n\nz = 3\n'
  const p = replaceFunction(py, 'b', 'def b(x):\n    return x + 1')
  assert.ok(p.ok)
  if (p.ok) assert.equal(p.result, 'def a():\n    return 1\n\ndef b(x):\n    return x + 1\n\nz = 3\n')
  assert.equal(findFunctions('function f() {}\nfunction f() {}\n', 'f').length, 2)
  assert.ok(!replaceFunction('function f() {}\nfunction f() {}\n', 'f', 'function f(){}').ok)
  const miss = replaceFunction(js, 'nope', 'x')
  assert.ok(!miss.ok && /Functions found/.test((miss as { error: string }).error))
})

test('two tool objects in one reply: only the first is used and no JSON leaks into edits', async () => {
  const c = parseToolCall('```json\n{"tool":"replace_lines","args":{"path":"a.js","start":"82","end":"83","new":"  return result;\n}"}}\n{"tool":"finish","args":{"summary":"x"}}\n```')
  assert.equal(c?.tool, 'replace_lines')
  assert.ok(!/tool/.test(c?.args.new ?? ''))
  const { execute } = await import('../src/tools/index.js')
  assert.match(await execute('/tmp', { tool: 'replace_lines', args: { path: 'a.js', start: '1', end: '1', new: 'x}\n{"tool":"finish"' } }), /contains tool-call JSON/)
})

test('ensureBranch never fails on a dirty tree and never reuses a stale branch', async () => {
  const { execSync } = await import('node:child_process')
  const { ensureBranch } = await import('../src/git.js')
  const root = mkdtempSync(join(tmpdir(), 'sakai-git-'))
  const sh = (c: string) => execSync(c, { cwd: root, stdio: 'ignore' })
  sh('git init -q -b main && git config user.email a@b && git config user.name a')
  writeFileSync(join(root, 'f.txt'), 'one'); sh('git add . && git commit -qm init')
  // an old Sakai branch exists with different content for f.txt
  sh('git checkout -qb sakai/fix'); writeFileSync(join(root, 'f.txt'), 'old fix'); sh('git commit -qam old'); sh('git checkout -q main')
  writeFileSync(join(root, 'f.txt'), 'new local edit') // dirty tree that git would refuse to carry onto sakai/fix
  const b = await ensureBranch(root, 'sakai/fix')
  assert.equal(b, 'sakai/fix-2')
  assert.equal(readFileSync(join(root, 'f.txt'), 'utf8'), 'new local edit')
  assert.equal(await ensureBranch(root, 'sakai/fix'), 'sakai/fix-2') // idempotent for the same run
})
