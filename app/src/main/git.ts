import { spawn } from 'node:child_process'

export interface GitResult { code: number; out: string }

export const GIT_MISSING_MESSAGE = 'Git is not installed on this Mac. Open Terminal, run:  xcode-select --install  — then try again.'

/** Runs git without ever prompting (no credential/editor prompts). Never throws. */
export function runGit(cwd: string, args: string[], log?: (l: string) => void): Promise<GitResult> {
  return new Promise((resolve) => {
    let p
    try {
      p = spawn('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true', LC_ALL: 'C' } })
    } catch (e) { return resolve({ code: 127, out: String(e) }) }
    let out = ''
    const onData = (d: Buffer) => { const t = String(d); out += t; if (log && t.trim()) log(t.trimEnd()) }
    p.stdout.on('data', onData)
    p.stderr.on('data', onData)
    p.on('error', (err) => resolve({ code: 127, out: (err as NodeJS.ErrnoException).code === 'ENOENT' ? GIT_MISSING_MESSAGE : String(err) }))
    p.on('close', (code) => resolve({ code: code ?? 1, out }))
  })
}

export async function gitInstalled(): Promise<boolean> {
  return (await runGit(process.cwd(), ['--version'])).code === 0
}
