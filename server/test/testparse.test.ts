import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTestOutput, compareRuns, describeComparison } from '../src/repo/testparse.js'

const JEST_BASE = `
FAIL tests/calculator.test.js
  ● Calculator › performs subtraction on current value

    expect(received).toBe(expected)

  ● Calculator › evaluates basic expressions respecting operator precedence

Tests:       2 failed, 10 passed, 12 total
`
const JEST_ONE = `
FAIL tests/calculator.test.js
  ● Calculator › evaluates basic expressions respecting operator precedence

Tests:       1 failed, 11 passed, 12 total
`

test('jest failing names + counts', () => {
  const r = parseTestOutput(JEST_BASE, 1)
  assert.deepEqual(r.failing, ['Calculator › performs subtraction on current value', 'Calculator › evaluates basic expressions respecting operator precedence'])
  assert.equal(r.failedCount, 2); assert.equal(r.passedCount, 10)
})

test('ANSI colours are ignored', () => {
  const r = parseTestOutput('\u001b[31m  ● Suite › a test\u001b[0m\n', 1)
  assert.deepEqual(r.failing, ['Suite › a test'])
})

test('compare: fixed / still failing / newly broken', () => {
  const base = parseTestOutput(JEST_BASE, 1)
  const c = compareRuns(base, parseTestOutput(JEST_ONE, 1))
  assert.deepEqual(c.fixed, ['Calculator › performs subtraction on current value'])
  assert.equal(c.still.length, 1)
  assert.deepEqual(c.broken, [])
  const worse = compareRuns(parseTestOutput(JEST_ONE, 1), parseTestOutput(JEST_BASE, 1))
  assert.deepEqual(worse.broken, ['Calculator › performs subtraction on current value'])
  assert.match(describeComparison(worse, parseTestOutput(JEST_BASE, 1)), /NEWLY BROKEN/)
})

test('all pass', () => {
  const c = compareRuns(parseTestOutput(JEST_BASE, 1), parseTestOutput('Tests: 12 passed, 12 total', 0))
  assert.ok(c.allPass); assert.equal(c.fixed.length, 2)
})

test('pytest, go, cargo, vitest, mocha', () => {
  assert.deepEqual(parseTestOutput('FAILED tests/test_a.py::test_x - assert 1 == 2\n1 failed, 3 passed', 1).failing, ['tests/test_a.py::test_x'])
  assert.deepEqual(parseTestOutput('--- FAIL: TestAdd (0.00s)\nFAIL', 1).failing, ['TestAdd'])
  assert.deepEqual(parseTestOutput('test math::tests::adds ... FAILED\n', 101).failing, ['math::tests::adds'])
  assert.deepEqual(parseTestOutput(' FAIL  tests/a.test.ts > math > adds\n', 1).failing, ['tests/a.test.ts > math > adds'])
  const mocha = '  2 passing\n  1 failing\n\n  1) Calculator\n       adds:\n     AssertionError'
  assert.deepEqual(parseTestOutput(mocha, 1).failing, ['Calculator adds'])
})

test('unparseable failure falls back to exit code', () => {
  const r = parseTestOutput('SyntaxError: Unexpected token', 1)
  assert.ok(r.unparsed)
  const c = compareRuns(parseTestOutput('Tests: 3 passed', 0), r)
  assert.equal(c.comparable, false); assert.equal(c.broken.length, 1)
})
