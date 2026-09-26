import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { runShell, safePath } from './shell.js'
import { replaceFunction } from './fn.js'

export interface ToolCall { tool: string; args: Record<string, string> }

export const TOOL_DOCS = `Tools (reply with exactly ONE fenced json block per turn, nothing after it):
{"tool":"bash","args":{"command":"..."}}                            run a shell command in the repo root
{"tool":"search","args":{"pattern":"regex","path":"optional/dir"}}   ripgrep-style search with line numbers
{"tool":"read_file","args":{"path":"...","start":"1","end":"200"}}   read a numbered line range
{"tool":"replace","args":{"path":"...","old":"...","new":"..."}}     replace one occurrence (copy "old" exactly from read_file)
{"tool":"replace_function","args":{"path":"...","name":"evaluate","new":"<the COMPLETE new function>"}}  rewrite one whole function by name — best when the logic must change
{"tool":"replace_lines","args":{"path":"...","start":"45","end":"60","new":"..."}}  replace a line range (numbers from read_file) — best for multi-line edits
{"tool":"write_file","args":{"path":"...","content":"..."}}          create a NEW file (fails if it exists)
{"tool":"revert","args":{"path":"..."}}                              undo all your changes to one file
{"tool":"think","args":{"thought":"..."}}                       private scratchpad: plan the algorithm / explain the cause before editing (no side effects)
{"tool":"finish","args":{"summary":"..."}}                           only after your fix is verified`

/** Models often cite paths as `src/a.js#L10`, `src/a.js:10` or `./src/a.js` — normalise to a real path. */
export function cleanPath(p: string | undefined): string | undefined {
  return p?.trim().replace(/^\.\//, '').replace(/#L?\d+(-L?\d+)?$/i, '').replace(/:\d+(-\d+)?$/, '')
}

/** Commands the agent must never run: dependency changes (Sakai installs deps itself), git history/state changes, destructive deletes. */
export function blockedCommand(cmd: string): string | null {
  if (/\b(npm|pnpm|yarn|bun)\s+(i|install|add|remove|uninstall)\b.*(--save|--save-dev|-D|-S|--global|-g)\b|\b(yarn|pnpm|bun)\s+add\b/.test(cmd)) return 'Do not add or change dependencies. Dependencies are already installed by Sakai; only edit source or test files.'
  if (/\bgit\s+(commit|push|reset|clean|checkout\s+--|stash|rebase|merge|branch\s+-D)\b/.test(cmd)) return 'Do not change git state. Sakai commits and pushes for you. Use git diff/status/log only.'
  if (/\brm\s+-\w*r\w*f?\w*\s+(\/|~|\.\.|\*)/.test(cmd) || /\bsudo\b|\bcurl\b[^|]*\|\s*(ba)?sh/.test(cmd)) return 'That command is not allowed.'
  return null
}

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

const ALIASES: Record<string, string> = { grep: 'search', read: 'read_file', cat: 'read_file', open: 'read_file', edit: 'replace', str_replace: 'replace', edit_lines: 'replace_lines', rewrite_function: 'replace_function', replace_fn: 'replace_function', update_function: 'replace_function', replace_range: 'replace_lines', create_file: 'write_file', write: 'write_file', run: 'bash', shell: 'bash', sh: 'bash', ls: 'bash', done: 'finish' }

export const EDIT_TOOLS = ['replace', 'replace_lines', 'replace_function', 'write_file', 'revert']

/** Chat mode is read-only: deny anything that could modify the working tree. */
export function readOnlyBlocked(cmd: string): string | null {
  const stripped = cmd.replace(/\d*>\s*&\d+|\d*>\s*\/dev\/null/g, '')
  if (/>|\btee\b|\bsed\s+-i|\bperl\s+-[a-z]*i|\b(rm|mv|cp|touch|mkdir|rmdir|chmod|chown|ln|dd|truncate|patch)\b|\b(npm|pnpm|yarn|bun|pip|pip3|brew|apt|apt-get)\s+(i|install|add|remove|uninstall|update|upgrade|ci)\b|\bgit\s+(apply|am|add|restore|switch|checkout|pull|fetch)\b/.test(stripped)) return 'This is a read-only chat: shell commands that modify files are not allowed. Use them only to read (grep, cat, ls, git log/diff/show, running tests).'
  return null
}

const clip = (s: string, max = 6000): string => (s.length > max ? `${s.slice(0, Math.floor(max * 0.4))}\n…[output truncated]…\n${s.slice(-Math.floor(max * 0.6))}` : s)

const norm = (l: string) => l.trim().replace(/\s+/g, ' ')
const indentOf = (l: string) => l.match(/^[ \t]*/)?.[0] ?? ''

/**
 * Applies old→new. Exact unique match first; otherwise a whitespace-insensitive line match (models often get
 * indentation or trailing spaces wrong). Returns the new source or an error with a hint pointing at the nearest code.
 */
export function applyReplace(src: string, old: string, neu: string): { ok: true; result: string; fuzzy: boolean } | { ok: false; error: string } {
  if (!old.trim()) return { ok: false, error: "ERROR: 'old' is empty" }
  if (old === neu) return { ok: false, error: "ERROR: 'new' is identical to 'old' — nothing to change." }
  const n = src.split(old).length - 1
  if (n === 1) return { ok: true, result: src.replace(old, () => neu), fuzzy: false }
  if (n > 1) return { ok: false, error: `ERROR: 'old' matched ${n} times; add surrounding lines so it is unique.` }

  // Whitespace-insensitive match across lines: models often join statements onto one line or mangle indentation.
  const tokens = old.trim().split(/\s+/).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(tokens.join('\\s*'), 'g')
  const found = [...src.matchAll(re)]
  if (found.length === 1) {
    const m = found[0], start = m.index ?? 0
    const lineStart = src.lastIndexOf('\n', start - 1) + 1
    const indent = indentOf(src.slice(lineStart))
    const nl = neu.replace(/^\n+|\n+$/g, '').split('\n')
    const minIndent = Math.min(...nl.slice(1).filter((l) => l.trim()).map((l) => indentOf(l).length), Infinity)
    const body = nl.map((l, i) => (i === 0 ? l.trimStart() : (Number.isFinite(minIndent) ? l.slice(Math.min(minIndent, indentOf(l).length)) : l).replace(/^/, l.trim() ? indent : '')))
    return { ok: true, result: src.slice(0, start) + body.join('\n') + src.slice(start + m[0].length), fuzzy: true }
  }
  if (found.length > 1) return { ok: false, error: `ERROR: 'old' matched ${found.length} places ignoring whitespace; add surrounding lines so it is unique.` }

  // Not found: show the code around the closest line so the model can copy it exactly.
  const lines = src.split('\n')
  const words = norm(old.split('\n').find((l) => norm(l).length > 3) ?? old).split(' ')
  let near = -1
  for (let n = words.length; n >= 1 && near < 0; n--) { // longest leading phrase that appears in the file
    const phrase = words.slice(0, n).join(' ')
    if (phrase.length >= 5) near = lines.findIndex((l) => norm(l).includes(phrase))
  }
  if (near >= 0) {
    const span = Math.min(12, Math.max(5, old.split('\n').length + 3))
    const a = Math.max(0, near - 1), b = Math.min(lines.length, a + span)
    return { ok: false, error: `ERROR: 'old' not found. The code there is (copy it exactly):\n${lines.slice(a, b).map((l, i) => `${a + i + 1}\t${l}`).join('\n')}` }
  }
  return { ok: false, error: "ERROR: 'old' not found. Use read_file on the file and copy the lines exactly." }
}

export async function execute(root: string, rawCall: ToolCall, opts: { readOnly?: boolean } = {}): Promise<string> {
  const call = { ...rawCall, tool: ALIASES[rawCall.tool] ?? rawCall.tool }
  const a = { ...(call.args ?? {}) }
  if (a.path) a.path = cleanPath(a.path)!
  if (opts.readOnly && EDIT_TOOLS.includes(call.tool)) return 'ERROR: this is a read-only chat, so files cannot be edited here. Explain the change in words instead, or ask the user to switch to Solve mode.'
  try {
    switch (call.tool) {
      case 'bash': {
        if (!a.command) return 'ERROR: missing command'
        const blocked = blockedCommand(a.command) ?? (opts.readOnly ? readOnlyBlocked(a.command) : null)
        if (blocked) return `ERROR: ${blocked}`
        const r = await runShell(root, a.command)
        return `exit ${r.code}\n${clip(r.output)}`
      }
      case 'search': {
        if (!a.pattern) return 'ERROR: search needs "pattern"'
        const target = a.path ? q(a.path) : '.'
        if (a.path) safePath(root, a.path)
        const cmd = `(command -v rg >/dev/null && rg -n --no-heading -S -g '!node_modules' -g '!.git' -e ${q(a.pattern)} ${target} || grep -rnE --exclude-dir=node_modules --exclude-dir=.git ${q(a.pattern)} ${target}) | head -80`
        const r = await runShell(root, cmd, 30_000)
        return clip(r.output.trim() || 'no matches', 4000)
      }
      case 'read_file': {
        const lines = (await readFile(safePath(root, a.path), 'utf8')).split('\n')
        const s = Math.max(1, Number(a.start ?? 1) || 1), e = Math.min(lines.length, Number(a.end ?? s + 199) || s + 199, s + 249)
        return `[${a.path} lines ${s}-${e} of ${lines.length}]\n` + lines.slice(s - 1, e).map((l, i) => `${s + i}\t${l}`).join('\n')
      }
      case 'replace': {
        const p = safePath(root, a.path)
        const r = applyReplace(await readFile(p, 'utf8'), a.old ?? '', a.new ?? '')
        if (!r.ok) return r.error
        await writeFile(p, r.result)
        return r.fuzzy ? 'OK (matched ignoring whitespace differences)' : 'OK'
      }
      case 'think':
        return 'Noted. Now act on your plan with an edit.'
      case 'replace_function': {
        const p = safePath(root, a.path)
        if (!a.name || !a.new) return 'ERROR: replace_function needs "name" and "new" (the complete new function text).'
        const r = replaceFunction(await readFile(p, 'utf8'), a.name, a.new, a.line ? Number(a.line) : undefined)
        if (!r.ok) return r.error
        if (r.result === (await readFile(p, 'utf8'))) return `ERROR: your new ${a.name} is IDENTICAL to the existing one, so nothing changed. Decide what must behave differently (use think), then write the changed logic.`
        await writeFile(p, r.result)
        const now = r.result.split('\n')
        return `OK: rewrote function ${a.name} (now lines ${r.start}-${r.end}):\n${now.slice(r.start - 1, r.end).map((l, i) => `${r.start + i}\t${l}`).join('\n')}`
      }
      case 'replace_lines': {
        const p = safePath(root, a.path)
        const lines = (await readFile(p, 'utf8')).split('\n')
        const start = Number(a.start), end = Number(a.end ?? a.start)
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lines.length) return `ERROR: invalid line range ${a.start}-${a.end} (file has ${lines.length} lines). Use the line numbers shown by read_file.`
        const neu = (a.new ?? '').replace(/\n$/, '').split('\n')
        if (lines.slice(start - 1, end).join('\n') === neu.join('\n')) return 'ERROR: the new text is IDENTICAL to those lines, so nothing changed. Decide what must behave differently (use think), then write the changed logic.'
        lines.splice(start - 1, end - start + 1, ...neu)
        await writeFile(p, lines.join('\n'))
        const from = Math.max(1, start - 1), to = Math.min(lines.length, start + neu.length)
        return `OK: replaced lines ${start}-${end} with ${neu.length} line(s); line numbers below this edit have SHIFTED (re-read before another line edit). File now (lines ${from}-${to}):\n${lines.slice(from - 1, to).map((l, i) => `${from + i}\t${l}`).join('\n')}`
      }
      case 'write_file': {
        const p = safePath(root, a.path)
        if (existsSync(p)) return `ERROR: ${a.path} already exists. Do not overwrite it: use "replace" to edit part of it (or "revert" to undo your changes to it).`
        await mkdir(dirname(p), { recursive: true })
        await writeFile(p, a.content ?? '')
        return 'OK'
      }
      case 'revert': {
        safePath(root, a.path)
        const r = await runShell(root, `git checkout -- ${q(a.path)}`, 20_000)
        return r.code === 0 ? `OK: ${a.path} restored to its original content` : `ERROR: ${r.output}`
      }
      default:
        return `ERROR: unknown tool "${call.tool}". Use one of: bash, search, read_file, replace, replace_lines, replace_function, write_file, revert, think, finish.`
    }
  } catch (e) {
    return `ERROR: ${(e as Error).message}`
  }
}

/** Repairs common weak-model JSON mistakes: raw newlines in strings, trailing commas, stray quotes after numbers. */
function repairJson(s: string): string {
  let out = '', inStr = false, esc = false
  for (const ch of s) {
    if (inStr) {
      if (esc) { out += ch; esc = false }
      else if (ch === '\\') { out += ch; esc = true }
      else if (ch === '"') { out += ch; inStr = false }
      else if (ch === '\n') out += '\\n'
      else if (ch === '\r') out += '\\r'
      else if (ch === '\t') out += '\\t'
      else out += ch
    } else { if (ch === '"') inStr = true; out += ch }
  }
  return out.replace(/,\s*([}\]])/g, '$1').replace(/(:\s*-?\d+(?:\.\d+)?)"(\s*[,}])/g, '$1$2')
}

const ARG_KEYS = ['command', 'pattern', 'path', 'name', 'line', 'start', 'end', 'old', 'new', 'content', 'summary', 'thought']

/** Last resort: pull fields out by key names, so unescaped quotes inside code (`"new": "a = "b""`) still work. */
function lenientParse(text: string): ToolCall | null {
  const tool = text.match(/"tool"\s*:\s*"([\w.-]+)"/)?.[1]
  if (!tool) return null
  const argsAt = text.search(/"args"\s*:/)
  const body = argsAt >= 0 ? text.slice(argsAt) : text
  const marks = ARG_KEYS.flatMap((k) => { const m = new RegExp(`"${k}"\\s*:\\s*`).exec(body); return m ? [{ k, i: m.index, v: m.index + m[0].length }] : [] }).sort((x, y) => x.i - y.i)
  const args: Record<string, string> = {}
  marks.forEach((m, n) => {
    let raw = body.slice(m.v, n + 1 < marks.length ? marks[n + 1].i : body.length).trim()
    raw = raw.replace(/[}\s`]*$/, '').replace(/,\s*$/, '')
    if (raw.startsWith('"')) raw = raw.slice(1).replace(/"\s*$/, '')
    else raw = raw.replace(/"$/, '')
    args[m.k] = raw.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  })
  return { tool, args }
}

export function parseToolCall(text: string): ToolCall | null {
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/g, '')
  const fences = [...stripped.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1])
  const brace = stripped.indexOf('{'), last = stripped.lastIndexOf('}')
  const candidates = [...fences.reverse(), ...(brace >= 0 && last > brace ? [stripped.slice(brace, last + 1)] : [])]
  for (const c of candidates) {
    for (const attempt of [c, repairJson(c)]) {
      try {
        const j = JSON.parse(attempt) as ToolCall
        if (j && typeof j.tool === 'string') {
          const args: Record<string, string> = {}
          for (const [k, v] of Object.entries(j.args ?? {})) args[k] = typeof v === 'string' ? v : String(v)
          return { tool: j.tool, args }
        }
      } catch { /* try next */ }
    }
  }
  // Every strict attempt failed — try the lenient extractor on the best candidate.
  for (const c of candidates) { const l = lenientParse(c); if (l) return l }
  return null
}

/** Human-readable reason a reply could not be parsed (fed back to the model). */
export function parseProblem(text: string): string {
  const c = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text.slice(text.indexOf('{'))
  if (!text.includes('{')) return 'Your reply contained no tool call.'
  try { JSON.parse(c); return 'The JSON parsed but has no "tool" field.' } catch (e) { return `Your JSON is invalid (${(e as Error).message.slice(0, 120)}). Check quotes and commas.` }
}
