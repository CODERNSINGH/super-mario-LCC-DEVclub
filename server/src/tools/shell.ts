import { spawn } from 'node:child_process'
import { resolve, sep } from 'node:path'

const MAX_OUT = 12_000

export function runShell(cwd: string, command: string, timeoutMs = 120_000): Promise<{ code: number; output: string }> {
  return new Promise((done) => {
    // detached => own process group, so a timeout kills the whole tree (npm -> jest -> workers), not just bash.
    const p = spawn('bash', ['-lc', command], { cwd, detached: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', PAGER: 'cat', CI: process.env.CI ?? '1' } })
    let out = ''
    const add = (d: Buffer) => { out += d.toString() }
    p.stdout.on('data', add); p.stderr.on('data', add)
    const t = setTimeout(() => { try { process.kill(-p.pid!, 'SIGKILL') } catch { p.kill('SIGKILL') } out += `\n[Sakai: command killed after ${Math.round(timeoutMs / 1000)}s timeout]` }, timeoutMs)
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
