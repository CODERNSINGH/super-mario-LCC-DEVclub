import { ipcMain, BrowserWindow, app } from 'electron'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

/** Parses "owner/name" out of a GitHub URL or shorthand. */
export function parseRepo(input: string): string | null {
  const m = input.trim().match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/)
  return m ? `${m[1]}/${m[2]}` : null
}

export function registerRepoIpc(getSecret: (k: string) => string | null): void {
  ipcMain.handle('repo:parse', (_e, input: string) => parseRepo(input))

  // Clones with the user's OAuth token; streams logs to the renderer.
  ipcMain.handle('repo:clone', (e, repo: string) => {
    const token = getSecret('github')
    if (!token) throw new Error('Not signed in')
    const root = join(app.getPath('home'), 'Sakai')
    mkdirSync(root, { recursive: true })
    const dest = join(root, repo.replace('/', '__'))
    const win = BrowserWindow.fromWebContents(e.sender)
    const log = (line: string) => win?.webContents.send('repo:log', line)
    return new Promise<string>((resolve, reject) => {
      log(`$ git clone https://github.com/${repo}.git ${dest}`)
      const p = spawn('git', ['-c', `http.extraheader=Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`, 'clone', '--progress', `https://github.com/${repo}.git`, dest])
      p.stdout.on('data', (d) => log(String(d).trimEnd()))
      p.stderr.on('data', (d) => log(String(d).trimEnd()))
      p.on('close', (c) => (c === 0 ? resolve(dest) : reject(new Error(`git clone exited with ${c}`))))
    })
  })
}
