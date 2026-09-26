/** Locates a named function/method in source text so a model can rewrite it whole (no line numbers, no exact-text copying). */

export interface FnSpan { start: number; end: number; name: string } // 0-based inclusive line indexes

const KEYWORDS = /^\s*(return|if|for|while|switch|else|throw|new|await|catch|try|do|case|yield|typeof|delete|void)\b/
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Index of the line where the brace block that opens at/after `from` closes, respecting strings and comments. */
function braceEnd(lines: string[], from: number): number {
  let depth = 0, opened = false
  let inBlock = false
  for (let i = from; i < lines.length; i++) {
    const l = lines[i]
    let quote = ''
    for (let k = 0; k < l.length; k++) {
      const ch = l[k], nx = l[k + 1]
      if (inBlock) { if (ch === '*' && nx === '/') { inBlock = false; k++ } continue }
      if (quote) { if (ch === '\\') k++; else if (ch === quote) quote = ''; continue }
      if (ch === '/' && nx === '/') break
      if (ch === '/' && nx === '*') { inBlock = true; k++; continue }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
      if (ch === '{') { depth++; opened = true }
      else if (ch === '}' && opened && --depth === 0) return i
    }
    if (i - from > 400 && !opened) return -1
  }
  return -1
}

export function findFunctions(src: string, name: string): FnSpan[] {
  const lines = src.split('\n')
  const n = esc(name)
  const out: FnSpan[] = []
  const py = new RegExp(`^(\\s*)(?:async\\s+)?def\\s+${n}\\s*\\(`)
  const js = [
    new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s*\\*?\\s*${n}\\s*[(<]`),
    new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)\\s+${n}\\s*=\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*(?::[^=]+)?=>|[\\w$]+\\s*=>)`),
    new RegExp(`^\\s*(?:(?:public|private|protected|static|async|get|set|override)\\s+)*\\*?${n}\\s*\\([^)]*\\)\\s*(?::\\s*[^{]+)?\\{?\\s*$`),
    new RegExp(`^\\s*(?:async\\s+)?${n}\\s*[:=]\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*=>)`),
    new RegExp(`^func\\s+(?:\\([^)]*\\)\\s*)?${n}\\s*[(\\[]`), // go
    new RegExp(`^\\s*(?:pub\\s+)?(?:async\\s+)?fn\\s+${n}\\s*[(<]`), // rust
  ]
  const generic = new RegExp(`^\\s*(?:[\\w<>\\[\\],*&:.?]+\\s+)+${n}\\s*\\([^;]*$`) // java/c#/c-like

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const m = l.match(py)
    if (m) {
      const base = m[1].length
      let end = i
      for (let k = i + 1; k < lines.length; k++) {
        if (!lines[k].trim()) continue
        const ind = lines[k].match(/^\s*/)![0].length
        if (ind <= base) break
        end = k
      }
      out.push({ start: i, end, name })
      continue
    }
    if (KEYWORDS.test(l)) continue
    if (js.some((r) => r.test(l)) || generic.test(l)) {
      const end = braceEnd(lines, i)
      if (end >= i) out.push({ start: i, end, name })
    }
  }
  return out
}

/** Names of functions in the file (for "not found" hints). */
export function listFunctions(src: string): string[] {
  const names = new Set<string>()
  for (const m of src.matchAll(/(?:function\s*\*?\s+|def\s+|fn\s+|func\s+(?:\([^)]*\)\s*)?)([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  for (const m of src.matchAll(/^\s*(?:static\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)) if (!KEYWORDS.test(`${m[1]} `)) names.add(m[1])
  for (const m of src.matchAll(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/gm)) names.add(m[1])
  return [...names].slice(0, 30)
}

const indentOf = (l: string) => l.match(/^[ \t]*/)![0]

/** Replaces the named function with `text` (re-indented to the original), returning the new source. */
export function replaceFunction(src: string, name: string, text: string, atLine?: number): { ok: true; result: string; start: number; end: number; count: number } | { ok: false; error: string } {
  const spans = findFunctions(src, name)
  if (!spans.length) {
    const known = listFunctions(src)
    return { ok: false, error: `ERROR: no function named "${name}" in this file.${known.length ? ` Functions found: ${known.join(', ')}.` : ''} Check the name, or use replace_lines.` }
  }
  let span = spans[0]
  if (spans.length > 1) {
    const hit = atLine ? spans.find((s) => s.start + 1 <= atLine && atLine <= s.end + 1) : undefined
    if (!hit) return { ok: false, error: `ERROR: "${name}" is defined ${spans.length} times (starting at lines ${spans.map((s) => s.start + 1).join(', ')}). Add "line": <one of those numbers>.` }
    span = hit
  }
  const lines = src.split('\n')
  const body = text.replace(/^```[\w-]*\n/, '').replace(/\n```\s*$/, '').replace(/^\n+|\s+$/g, '').split('\n')
  const baseIndent = indentOf(lines[span.start])
  const minIndent = Math.min(...body.filter((l) => l.trim()).map((l) => indentOf(l).length), Infinity)
  const first = indentOf(body[0]).length
  // Models usually indent the whole block consistently; normalise relative to the first line, then apply the original indent.
  const cut = Number.isFinite(minIndent) ? Math.min(minIndent, first) : 0
  const re = body.map((l) => (l.trim() ? baseIndent + l.slice(cut) : ''))
  lines.splice(span.start, span.end - span.start + 1, ...re)
  return { ok: true, result: lines.join('\n'), start: span.start + 1, end: span.start + re.length, count: re.length }
}
