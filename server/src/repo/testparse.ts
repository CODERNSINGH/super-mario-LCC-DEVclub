/** Generic parsing of test-runner output into failing-test names, so runs can be compared against a baseline. */

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g
export const stripAnsi = (s: string): string => s.replace(ANSI, '')

export interface TestRun {
  exit: number
  failing: string[]
  failedCount: number | null
  passedCount: number | null
  /** true when the runner failed but no individual test names could be parsed (build error, missing deps…) */
  unparsed: boolean
}

const normalise = (s: string): string => s.replace(/\s*\(\d+(\.\d+)?\s*m?s\)\s*$/, '').replace(/\s+/g, ' ').trim()

export function parseTestOutput(output: string, exit: number): TestRun {
  const lines = stripAnsi(output).split('\n')
  const jest = new Set<string>(), jestX = new Set<string>(), other = new Set<string>(), fileFail = new Set<string>()
  let inMochaFailures = false
  let lastFailFile = ''

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    let m: RegExpMatchArray | null

    if ((m = l.match(/^\s*FAIL\s+(\S+\.[A-Za-z]+)\s*$/))) { lastFailFile = m[1]; fileFail.add(m[1]) }
    if ((m = l.match(/^\s*●\s+(.+?)\s*$/))) {
      const name = normalise(m[1])
      if (/^Console\b/.test(name)) continue
      if (/^Test suite failed to run/i.test(name)) jest.add(`suite failed to run: ${lastFailFile || '?'}`)
      else jest.add(name)
    }
    if ((m = l.match(/^\s*[✕✗×]\s+(.+?)\s*$/))) jestX.add(normalise(m[1]))
    if ((m = l.match(/^\s*FAIL\s+(.+? > .+?)\s*$/))) other.add(normalise(m[1])) // vitest
    if ((m = l.match(/^(?:FAILED|ERROR)\s+(\S+)/))) other.add(m[1]) // pytest
    if ((m = l.match(/^\s*--- FAIL:\s+(\S+)/))) other.add(m[1]) // go
    if ((m = l.match(/^test\s+(\S+)\s+\.\.\.\s+FAILED/))) other.add(m[1]) // cargo

    if (/^\s*\d+\s+failing\b/.test(l)) inMochaFailures = true // mocha summary
    else if (inMochaFailures && (m = l.match(/^\s+\d+\)\s+(.+?)\s*$/))) {
      const next = lines[i + 1]?.match(/^\s{4,}(.+?):\s*$/)
      other.add(normalise(next ? `${m[1]} ${next[1]}` : m[1]))
    }
  }

  const names = new Set<string>([...(jest.size ? jest : jestX), ...other])
  const clean = stripAnsi(output)
  const failed = [...clean.matchAll(/(\d+)\s+(?:failed|failing)\b/g)].pop()
  const passed = [...clean.matchAll(/(\d+)\s+(?:passed|passing)\b/g)].pop()
  let failing = [...names]
  let unparsed = false
  if (!failing.length && fileFail.size) failing = [...fileFail].map((f) => `file: ${f}`)
  if (!failing.length && exit !== 0) { failing = [`(test command exited with ${exit})`]; unparsed = true }
  return { exit, failing, failedCount: failed ? Number(failed[1]) : null, passedCount: passed ? Number(passed[1]) : null, unparsed }
}

export interface Comparison { fixed: string[]; still: string[]; broken: string[]; allPass: boolean; comparable: boolean }

export function compareRuns(base: TestRun, now: TestRun): Comparison {
  if (now.exit === 0 && !now.failing.length) return { fixed: base.failing.filter((f) => !base.unparsed), still: [], broken: [], allPass: true, comparable: true }
  // If either side could not be parsed we cannot attribute failures; fall back to exit codes only.
  if (base.unparsed || now.unparsed) return { fixed: [], still: base.exit !== 0 ? now.failing : [], broken: base.exit === 0 && now.exit !== 0 ? now.failing : [], allPass: false, comparable: false }
  const b = new Set(base.failing), n = new Set(now.failing)
  return {
    fixed: [...b].filter((x) => !n.has(x)),
    still: [...n].filter((x) => b.has(x)),
    broken: [...n].filter((x) => !b.has(x)),
    allPass: false,
    comparable: true,
  }
}

const list = (xs: string[]) => xs.slice(0, 6).map((x) => `  - ${x}`).join('\n') + (xs.length > 6 ? `\n  - …and ${xs.length - 6} more` : '')

/** Text shown to the model after an edit. */
export function describeComparison(c: Comparison, now: TestRun): string {
  if (c.allPass) return 'Tests: ALL PASS.'
  if (!c.comparable) return `Tests: exit ${now.exit}; the runner output could not be parsed into test names. Read the output below.`
  const parts: string[] = []
  if (c.fixed.length) parts.push(`FIXED by your change (${c.fixed.length}):\n${list(c.fixed)}`)
  if (c.broken.length) parts.push(`NEWLY BROKEN by your change (${c.broken.length}) — you must fix or revert this:\n${list(c.broken)}`)
  if (c.still.length) parts.push(`Still failing but ALSO failing BEFORE your change (${c.still.length}) — these belong to other issues, do not fix them:\n${list(c.still)}`)
  return `Tests vs baseline:\n${parts.join('\n') || '(no change)'}`
}
