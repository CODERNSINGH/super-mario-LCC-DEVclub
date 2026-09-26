import { readFile } from 'node:fs/promises'
import { runShell } from '../tools/shell.js'
import { trackedFiles } from './info.js'
import type { ExecutedFn } from './repro.js'

/**
 * Pre-selects the code most likely to matter for an issue so weak models don't burn steps exploring:
 * identifiers from the issue text/repro, files named in require/import paths, and files cited in failing stack traces.
 */

const STOP = new Set(['const', 'let', 'var', 'function', 'return', 'result', 'console', 'log', 'require', 'expected', 'actual', 'behavior', 'behaviour', 'description', 'steps', 'reproduce', 'issue', 'when', 'with', 'that', 'this', 'from', 'should', 'instead', 'returns', 'value', 'values', 'number', 'numbers', 'string', 'true', 'false', 'null', 'undefined', 'calling', 'call', 'instance', 'initialized', 'existing', 'unexpected', 'produces', 'print', 'import', 'test', 'tests', 'error', 'bug', 'fails', 'fail', 'does', 'not', 'the', 'and', 'for', 'any', 'new', 'class', 'object', 'method', 'after', 'before', 'lose', 'ignores', 'evaluating'])
const CODE = /\.(js|jsx|mjs|cjs|ts|tsx|py|go|rs|java|kt|rb|php|c|cc|cpp|h|cs|swift|vue|svelte)$/i
const isTest = (p: string) => /(^|\/)(tests?|__tests__|spec)(\/|$)|\.(test|spec)\.[a-z]+$|_test\.(go|py)$/i.test(p)

export function identifiersFrom(text: string): string[] {
  const found = new Map<string, number>()
  const add = (w: string, weight: number) => { if (w.length >= 3 && !STOP.has(w.toLowerCase())) found.set(w, (found.get(w) ?? 0) + weight) }
  for (const m of text.matchAll(/`([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)(?:\(\))?`/g)) m[1].split('.').forEach((w) => add(w, 3))
  for (const m of text.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) add(m[1], 2)
  for (const m of text.matchAll(/\.([A-Za-z_$][\w$]*)/g)) add(m[1], 2)
  for (const m of text.matchAll(/\b([A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+|[a-z]+[A-Z][A-Za-z0-9]*|[a-z]+_[a-z_0-9]+)\b/g)) add(m[1], 2)
  for (const m of text.matchAll(/\b(?:new\s+)?([A-Z][A-Za-z0-9]{3,})\b/g)) add(m[1], 1)
  for (const m of text.matchAll(/\b([a-z]{5,})\b/g)) add(m[1], 0.5)
  return [...found.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w).slice(0, 14)
}

export function pathsFromImports(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/(?:require|import)\s*\(?\s*['"](\.{0,2}\/[^'"]+)['"]/g)) out.push(m[1].replace(/^\.\//, '').replace(/^(\.\.\/)+/, ''))
  for (const m of text.matchAll(/from\s+['"](\.{0,2}\/[^'"]+)['"]/g)) out.push(m[1].replace(/^\.\//, '').replace(/^(\.\.\/)+/, ''))
  return out
}

export function pathsFromTrace(output: string): { path: string; line: number }[] {
  const out: { path: string; line: number }[] = []
  for (const m of output.matchAll(/([\w@./-]+\.(?:js|jsx|mjs|cjs|ts|tsx|py|go|rs|java|rb|php)):(\d+)/g)) {
    if (/node_modules|internal\//.test(m[1])) continue
    out.push({ path: m[1].replace(/^\.\//, ''), line: Number(m[2]) })
  }
  return out
}

interface Hit { file: string; line: number; text: string }

async function grep(root: string, ident: string): Promise<Hit[]> {
  const r = await runShell(root, `git grep -n -w -I -- '${ident.replace(/'/g, '')}' | head -60`, 15_000)
  return r.output.split('\n').flatMap((l) => {
    const m = l.match(/^([^:]+):(\d+):(.*)$/)
    return m ? [{ file: m[1], line: Number(m[2]), text: m[3] }] : []
  })
}

const isDef = (ident: string, text: string) =>
  new RegExp(`(function|class|def|fn|func|interface|type)\\s+${ident}\\b|\\b${ident}\\s*\\([^)]*\\)\\s*\\{|\\b${ident}\\s*[:=]\\s*(async\\s*)?(function|\\(|[A-Za-z_$]+\\s*=>)|^\\s*(const|let|var)\\s+${ident}\\s*=`).test(text)

async function window(root: string, file: string, from: number, to: number): Promise<string> {
  const lines = (await readFile(`${root}/${file}`, 'utf8')).split('\n')
  const a = Math.max(1, from), b = Math.min(lines.length, to)
  return `--- ${file} (lines ${a}-${b} of ${lines.length})\n` + lines.slice(a - 1, b).map((l, i) => `${a + i}\t${l}`).join('\n')
}

export async function buildSeed(root: string, issueText: string, baselineOutput = '', maxChars = 6500): Promise<string> {
  const idents = identifiersFrom(issueText)
  const files = new Set((await trackedFiles(root)).map((f) => f.path).filter((f) => CODE.test(f)))
  const score = new Map<string, number>()
  const marks = new Map<string, { defs: number[]; any: number[] }>()
  const bump = (f: string, s: number) => score.set(f, (score.get(f) ?? 0) + s)
  const mark = (f: string) => marks.get(f) ?? (marks.set(f, { defs: [], any: [] }), marks.get(f)!)

  for (const id of idents) {
    const hits = (await grep(root, id)).filter((h) => files.has(h.file))
    const perFile = new Set(hits.map((h) => h.file)).size
    if (!perFile) continue
    const idf = 1 / perFile
    for (const h of hits) {
      const def = isDef(id, h.text)
      bump(h.file, idf * (def ? 4 : 1) * (isTest(h.file) ? 0.3 : 1))
      const mk = mark(h.file); (def ? mk.defs : mk.any).push(h.line)
    }
  }
  for (const p of pathsFromImports(issueText)) {
    const hit = [...files].find((f) => f === p || f.replace(/\.[a-z]+$/, '') === p || f.startsWith(`${p}.`) || f.endsWith(`/${p}.js`) || f.endsWith(`/${p}.ts`) || f.endsWith(`/${p}.py`))
    if (hit) bump(hit, 3)
  }
  const traces = pathsFromTrace(baselineOutput).filter((t) => files.has(t.path) && !isTest(t.path))
  for (const t of traces) { bump(t.path, 2); mark(t.path).defs.push(t.line) }

  const ranked = [...score.entries()].filter(([f]) => !isTest(f)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f]) => f)
  const parts: string[] = []
  let used = 0
  for (const f of ranked) {
    const mk = marks.get(f)
    const anchors = [...new Set([...(mk?.defs ?? []), ...(mk?.any ?? [])])].slice(0, 3)
    let text: string
    try {
      const total = (await readFile(`${root}/${f}`, 'utf8')).split('\n').length
      text = total <= 90 || !anchors.length ? await window(root, f, 1, 90) : (await Promise.all(anchors.sort((a, b) => a - b).map((a) => window(root, f, a - 8, a + 20)))).join('\n')
    } catch { continue }
    if (used + text.length > maxChars) text = text.slice(0, Math.max(0, maxChars - used))
    if (!text) break
    parts.push(text); used += text.length
  }
  return parts.join('\n\n')
}


/** Code windows for the functions the issue reproduction executed (most precise localization signal). */
export async function seedFromExecuted(root: string, executed: ExecutedFn[], maxChars = 5500): Promise<{ text: string; summary: string }> {
  const uniq = new Map<string, ExecutedFn>()
  for (const f of executed) if (!isTest(f.file) && CODE.test(f.file)) uniq.set(`${f.file}:${f.name}:${f.start}`, f)
  const fns = [...uniq.values()].filter((f) => f.end - f.start <= 60)
  if (!fns.length) return { text: '', summary: '' }
  const byFile = new Map<string, ExecutedFn[]>()
  for (const f of fns) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f])
  const parts: string[] = []
  let used = 0
  for (const [file, list] of byFile) {
    list.sort((a, b) => a.start - b.start)
    let lines: string[]
    try { lines = (await readFile(`${root}/${file}`, 'utf8')).split('\n') } catch { continue }
    // Merge neighbouring windows, keep leading doc comments (start-4).
    const spans: [number, number][] = []
    for (const f of list) {
      const a = Math.max(1, f.start - 4), b = Math.min(lines.length, f.end + 1)
      const last = spans[spans.length - 1]
      if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b); else spans.push([a, b])
    }
    for (const [a, b] of spans) {
      let text = `--- ${file} (lines ${a}-${b} of ${lines.length})\n` + lines.slice(a - 1, b).map((l, i) => `${a + i}\t${l}`).join('\n')
      if (used + text.length > maxChars) text = text.slice(0, Math.max(0, maxChars - used))
      if (!text) break
      parts.push(text); used += text.length
    }
  }
  return { text: parts.join('\n\n'), summary: fns.map((f) => `${f.file}:${f.name}`).join(', ') }
}
