import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { runShell, safePath } from './shell.js'

export interface ToolCall { tool: string; args: Record<string, string> }

export const TOOL_DOCS = `Tools (reply with exactly ONE fenced json block per turn, nothing after it):
{"tool":"bash","args":{"command":"..."}}                            run a shell command in the repo root
{"tool":"search","args":{"pattern":"regex","path":"optional/dir"}}   ripgrep-style search with line numbers
{"tool":"read_file","args":{"path":"...","start":"1","end":"200"}}   read a numbered line range
{"tool":"replace","args":{"path":"...","old":"...","new":"..."}}     replace ONE exact, unique occurrence
{"tool":"write_file","args":{"path":"...","content":"..."}}          create or overwrite a file
{"tool":"finish","args":{"summary":"..."}}                           only after tests pass and diff is reviewed`

/** Models often cite paths as `src/a.js#L10`, `src/a.js:10` or `./src/a.js` — normalise to a real path. */
export function cleanPath(p: string | undefined): string | undefined {
  return p?.trim().replace(/^\.\//, '').replace(/#L?\d+(-L?\d+)?$/i, '').replace(/:\d+(-\d+)?$/, '')
}

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

const ALIASES: Record<string, string> = { grep: 'search', read: 'read_file', cat: 'read_file', open: 'read_file', edit: 'replace', str_replace: 'replace', create_file: 'write_file', write: 'write_file', run: 'bash', shell: 'bash', sh: 'bash', ls: 'bash', done: 'finish' }

export async function execute(root: string, rawCall: ToolCall): Promise<string> {
  const call = { ...rawCall, tool: ALIASES[rawCall.tool] ?? rawCall.tool }
  const a = { ...(call.args ?? {}) }
  if (a.path) a.path = cleanPath(a.path)!
  try {
    switch (call.tool) {
      case 'bash': {
        if (!a.command) return 'ERROR: missing command'
        const r = await runShell(root, a.command)
        return `exit ${r.code}\n${r.output}`
      }
      case 'search': {
        if (!a.pattern) return 'ERROR: search needs "pattern"'
        const target = a.path ? q(safePath(root, a.path)) : '.'
        const cmd = `(command -v rg >/dev/null && rg -n --no-heading -S -g '!node_modules' -g '!.git' -e ${q(a.pattern)} ${target} || grep -rnE --exclude-dir=node_modules --exclude-dir=.git ${q(a.pattern)} ${target}) | head -80`
        const r = await runShell(root, cmd, 30_000)
        return r.output.trim() || 'no matches'
      }
      case 'read_file': {
        const lines = (await readFile(safePath(root, a.path), 'utf8')).split('\n')
        const s = Math.max(1, Number(a.start ?? 1)), e = Math.min(lines.length, Number(a.end ?? s + 199))
        return `[${a.path} lines ${s}-${e} of ${lines.length}]\n` + lines.slice(s - 1, e).map((l, i) => `${s + i}\t${l}`).join('\n')
      }
      case 'replace': {
        const p = safePath(root, a.path)
        const src = await readFile(p, 'utf8')
        if (!a.old) return 'ERROR: empty old string'
        const n = src.split(a.old).length - 1
        if (n === 0) return "ERROR: 'old' not found. Re-read the file; whitespace must match exactly."
        if (n > 1) return `ERROR: 'old' matched ${n} times; add surrounding context so it is unique.`
        await writeFile(p, src.replace(a.old, () => a.new ?? ''))
        return 'OK'
      }
      case 'write_file': {
        const p = safePath(root, a.path)
        await mkdir(dirname(p), { recursive: true })
        await writeFile(p, a.content ?? '')
        return 'OK'
      }
      default:
        return `ERROR: unknown tool "${call.tool}". Use one of: bash, search, read_file, replace, write_file, finish.`
    }
  } catch (e) {
    return `ERROR: ${(e as Error).message}`
  }
}

/** Escapes raw control characters inside JSON string literals (common weak-model mistake). */
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
  return out.replace(/,\s*([}\]])/g, '$1')
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
  return null
}
