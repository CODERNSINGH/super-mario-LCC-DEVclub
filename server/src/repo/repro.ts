import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { runShell } from '../tools/shell.js'

/** Reproduction snippet taken from an issue's fenced code block. */
export interface Repro { lang: 'js' | 'py'; code: string }

// Issue text is untrusted input: never auto-run snippets that touch the filesystem destructively, spawn processes or use the network.
const DANGEROUS = /child_process|\bexec(?:Sync)?\s*\(|\bspawn|rm\s+-rf|\bunlink|rmdir|writeFile|appendFile|createWriteStream|\bfetch\s*\(|https?\.request|require\(\s*['"]https?['"]\s*\)|require\(\s*['"]net['"]\s*\)|process\.env|\beval\s*\(|new Function|os\.system|subprocess|shutil|urllib|requests\.|socket|open\([^)]*['"][wa]/

const LANGS: Record<string, Repro['lang']> = { javascript: 'js', js: 'js', node: 'js', mjs: 'js', cjs: 'js', python: 'py', py: 'py', python3: 'py' }

export function extractRepro(body: string): Repro | null {
  const blocks = [...body.matchAll(/```([\w-]*)[^\S\n]*\n([\s\S]*?)```/g)].map((m) => ({ tag: m[1].toLowerCase(), code: m[2].trim(), at: m.index ?? 0 }))
  const heading = body.search(/#+\s*(steps to reproduce|reproduc|repro)/i)
  const ordered = [...blocks].sort((a, b) => Number(b.at >= heading && heading >= 0) - Number(a.at >= heading && heading >= 0) || a.at - b.at)
  for (const b of ordered) {
    let lang = LANGS[b.tag]
    if (!lang && !b.tag) lang = /\brequire\(|console\.log|=>|\bconst\b|\blet\b/.test(b.code) ? 'js' : /\bprint\(|^import\s|^from\s|\bdef\b/m.test(b.code) ? 'py' : undefined as never
    if (!lang || !b.code || DANGEROUS.test(b.code)) continue
    return { lang, code: b.code }
  }
  return null
}

/** The value the issue says should be produced (first inline code / fenced block after "Expected"). */
export function extractExpected(body: string): string | null {
  const m = body.match(/expected[^\n]*\n+([\s\S]{0,300})/i)
  if (!m) return null
  const block = m[1]
  const inline = block.match(/`([^`\n]+)`/)
  if (inline) return inline[1].trim()
  const fenced = block.match(/```[\w-]*\n([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const first = block.split('\n').find((l) => l.trim())
  return first?.trim() ?? null
}

export type Verdict = 'match' | 'differs' | 'unknown'

const num = (s: string): number | null => { const t = s.trim().replace(/^['"]|['"]$/g, ''); return t !== '' && Number.isFinite(Number(t)) ? Number(t) : null }

/**
 * Compares the snippet's output with the issue's expected value.
 * - numeric expectations need a numeric last line (a stack trace containing "14" is not a match)
 * - a snippet that newly crashes (non-zero exit when it ran fine before) is a failure
 */
export function judgeRepro(output: string, expected: string | null, exitCode = 0, baselineExit = 0): Verdict {
  if (!expected) return 'unknown'
  if (exitCode !== 0 && baselineExit === 0) return 'differs'
  const lines = output.split('\n').map((l) => l.trim()).filter(Boolean)
  const last = lines[lines.length - 1]
  if (!last) return 'unknown'
  const a = num(last), b = num(expected)
  if (b !== null) return a !== null && Math.abs(a - b) < 1e-9 ? 'match' : 'differs'
  const clean = (s: string) => s.replace(/^['"`]|['"`]$/g, '').trim().toLowerCase()
  if (clean(last) === clean(expected)) return 'match'
  return expected.length >= 4 && output.toLowerCase().includes(expected.toLowerCase()) ? 'match' : 'differs'
}

/** Runs the snippet inside the repo root (so relative requires work), then removes the temp file. */
export async function runRepro(root: string, r: Repro): Promise<{ code: number; output: string }> {
  const esm = r.lang === 'js' && /^\s*import\s/m.test(r.code)
  const file = `.sakai-repro-${Date.now()}${r.lang === 'py' ? '.py' : esm ? '.mjs' : '.cjs'}`
  const path = join(root, file)
  await writeFile(path, r.code + '\n')
  try {
    const res = await runShell(root, `${r.lang === 'py' ? 'python3' : 'node'} ${file}`, 15_000)
    return { code: res.code, output: res.output.replace(new RegExp(file.replace(/\./g, '\\.'), 'g'), '<repro>').slice(-800).trim() }
  } finally {
    if (existsSync(path)) await unlink(path).catch(() => undefined)
  }
}

/** A function the reproduction actually executed (1-based lines). */
export interface ExecutedFn { file: string; name: string; start: number; end: number }

const PY_TRACER = `
import sys, json, os, runpy
root = os.getcwd(); out = os.environ["SAKAI_TRACE_OUT"]; hits = {}
def prof(frame, event, arg):
    if event == "call":
        f = frame.f_code.co_filename
        if f.startswith(root) and "site-packages" not in f and "/.sakai" not in f and "node_modules" not in f:
            hits[(f, frame.f_code.co_name, frame.f_code.co_firstlineno)] = 1
sys.setprofile(prof)
try:
    runpy.run_path(sys.argv[1], run_name="__main__")
finally:
    sys.setprofile(None)
    json.dump([{"file": os.path.relpath(k[0], root), "name": k[1], "start": k[2], "end": k[2] + 25} for k in hits], open(out, "w"))
`

function lineOf(text: string, offset: number): number {
  let n = 1
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) n++
  return n
}

/** Runs the repro and reports which project functions executed (V8 coverage for JS, sys.setprofile for Python). */
export async function traceRepro(root: string, r: Repro): Promise<{ code: number; output: string; executed: ExecutedFn[] }> {
  const esm = r.lang === 'js' && /^\s*import\s/m.test(r.code)
  const file = `.sakai-trace-${Date.now()}${r.lang === 'py' ? '.py' : esm ? '.mjs' : '.cjs'}`
  const path = join(root, file)
  const dir = mkdtempSync(join(tmpdir(), 'sakai-cov-'))
  await writeFile(path, r.code + '\n')
  const executed: ExecutedFn[] = []
  const real = realpathSync(root) // node reports symlink-resolved paths (macOS /var → /private/var)
  try {
    let res: { code: number; output: string }
    if (r.lang === 'py') {
      const tracer = join(dir, 'tracer.py')
      await writeFile(tracer, PY_TRACER)
      res = await runShell(root, `SAKAI_TRACE_OUT='${join(dir, 'trace.json')}' python3 '${tracer}' ${file}`, 20_000)
      try { for (const f of JSON.parse(readFileSync(join(dir, 'trace.json'), 'utf8')) as ExecutedFn[]) if (f.name !== '<module>' && !f.file.startsWith('.sakai')) executed.push({ ...f, file: relative(real, join(real, f.file)) }) } catch { /* no trace */ }
    } else {
      res = await runShell(root, `NODE_V8_COVERAGE='${dir}' node ${file}`, 20_000)
      for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
        let data: { result: { url: string; functions: { functionName: string; ranges: { startOffset: number; endOffset: number; count: number }[] }[] }[] }
        try { data = JSON.parse(readFileSync(join(dir, f), 'utf8')) } catch { continue }
        for (const script of data.result) {
          if (!script.url.startsWith('file://')) continue
          const abs = decodeURIComponent(script.url.slice(7))
          const rel = relative(real, abs)
          if (rel.startsWith('..') || rel.includes('node_modules') || rel.startsWith('.sakai')) continue
          let text: string
          try { text = readFileSync(abs, 'utf8') } catch { continue }
          for (const fn of script.functions) {
            const rg = fn.ranges[0]
            if (!fn.functionName || rg.count === 0) continue // module wrapper / never called
            executed.push({ file: rel, name: fn.functionName, start: lineOf(text, rg.startOffset), end: lineOf(text, rg.endOffset) })
          }
        }
      }
    }
    return { code: res.code, output: res.output.replace(new RegExp(file.replace(/\./g, '\\.'), 'g'), '<repro>').slice(-800).trim(), executed }
  } finally {
    if (existsSync(path)) await unlink(path).catch(() => undefined)
    rmSync(dir, { recursive: true, force: true })
  }
}
