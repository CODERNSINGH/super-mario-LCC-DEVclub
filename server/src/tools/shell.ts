import { spawn } from 'node:child_process'
import { resolve, sep } from 'node:path'

const MAX_OUT = 12_000

export function runShell(cwd: string, command: string, timeoutMs = 120_000): Promise<{ code: number; output: string }> {
  return new Promise((done) => {
    const p = spawn('bash', ['-lc', command], { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', PAGER: 'cat' } })
    let out = ''
    const add = (d: Buffer) => { out += d.toString() }
    p.stdout.on('data', add); p.stderr.on('data', add)
    const t = setTimeout(() => { p.kill('SIGKILL'); out += '\n[timed out]' }, timeoutMs)
    p.on('close', (code) => {
      clearTimeout(t)
      const trimmed = out.length > MAX_OUT ? `${out.slice(0, MAX_OUT / 2)}\n…[truncated]…\n${out.slice(-MAX_OUT / 2)}` : out
      done({ code: code ?? -1, output: trimmed })
    })
  })
}

/** Confines file access to the repo root. */
export function safePath(root: string, rel: string): string {
  const abs = resolve(root, rel)
  if (abs !== root && !abs.startsWith(root + sep)) throw new Error(`Path escapes repository: ${rel}`)
  return abs
}
