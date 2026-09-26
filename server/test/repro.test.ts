import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractRepro, extractExpected, judgeRepro, runRepro } from '../src/repo/repro.js'
import { identifiersFrom, pathsFromImports, pathsFromTrace } from '../src/repo/seed.js'

const ISSUE = `### Description
Multiplying any number by \`0\` returns the other operand.

### Steps to Reproduce
\`\`\`javascript
const operations = require("./src/operations");
console.log(operations.multiply(5, 0));
\`\`\`

### Expected Behavior
\`0\`

### Actual Behavior
\`5\`
`

test('extracts the repro block and the expected value', () => {
  assert.equal(extractRepro(ISSUE)?.lang, 'js')
  assert.match(extractRepro(ISSUE)!.code, /multiply\(5, 0\)/)
  assert.equal(extractExpected(ISSUE), '0')
})

test('dangerous snippets from untrusted issues are never run', () => {
  assert.equal(extractRepro('```js\nrequire("child_process").exec("rm -rf /")\n```'), null)
  assert.equal(extractRepro('```js\nfetch("http://evil")\n```'), null)
  assert.equal(extractRepro('```bash\nls\n```'), null)
})

test('judge compares numbers numerically and text loosely', () => {
  assert.equal(judgeRepro('13', '13.0'), 'match')
  assert.equal(judgeRepro('12', '13.0'), 'differs')
  assert.equal(judgeRepro('-15', '15'), 'differs')
  assert.equal(judgeRepro('"hello"', 'hello'), 'match')
  assert.equal(judgeRepro('', '1'), 'unknown')
  assert.equal(judgeRepro('Error at loader:1354:12 ... node v14', '14'), 'differs', 'numbers inside a stack trace are not a match')
  assert.equal(judgeRepro('14', '14', 1, 0), 'differs', 'a new crash is a failure')
  assert.equal(judgeRepro('Error: boom', 'no error', 1, 1), 'differs')
  assert.equal(judgeRepro('1', null), 'unknown')
})

test('runRepro executes inside the repo and cleans up its temp file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sakai-repro-'))
  writeFileSync(join(root, 'm.js'), 'module.exports = { two: () => 2 }')
  const r = await runRepro(root, { lang: 'js', code: 'console.log(require("./m").two())' })
  assert.equal(r.output, '2')
  assert.deepEqual(readdirSync(root), ['m.js'])
})

test('identifier + path extraction for pre-seeding', () => {
  const ids = identifiersFrom(ISSUE)
  assert.ok(ids.includes('multiply') && ids.includes('operations'))
  assert.deepEqual(pathsFromImports(ISSUE), ['src/operations'])
  assert.deepEqual(pathsFromTrace('at Object.<anonymous> (tests/calculator.test.js:27:31)\n at x (node_modules/jest/a.js:1:1)'), [{ path: 'tests/calculator.test.js', line: 27 }])
})

test('traceRepro reports which project functions the snippet executed (JS coverage)', async () => {
  const { traceRepro } = await import('../src/repo/repro.js')
  const { seedFromExecuted } = await import('../src/repo/seed.js')
  const root = mkdtempSync(join(tmpdir(), 'sakai-trace-'))
  writeFileSync(join(root, 'lib.js'), 'function used(x) {\n  return unusedHelper(x) + 1\n}\nfunction unusedHelper(x) {\n  return x\n}\nfunction neverCalled() {\n  return 0\n}\nmodule.exports = { used, neverCalled }\n')
  const t = await traceRepro(root, { lang: 'js', code: 'console.log(require("./lib").used(1))' })
  assert.equal(t.output, '2')
  const names = t.executed.map((f) => f.name)
  assert.ok(names.includes('used') && names.includes('unusedHelper'))
  assert.ok(!names.includes('neverCalled'))
  assert.deepEqual(readdirSync(root), ['lib.js'])
  const seed = await seedFromExecuted(root, t.executed)
  assert.match(seed.text, /return unusedHelper/)
  assert.ok(!/return 0/.test(seed.text))
})
