import { ipcMain, BrowserWindow, app } from 'electron'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

/** Parses "owner/name" out of a GitHub URL or shorthand. */
export function parseRepo(input: string): string | null {
  const m = input.trim().match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/)
  return m ? `${m[1]}/${m[2]}` : null
}

export function registerRepoIpc(getSecret: (k: string) => string | null): void {
  ipcMain.handle('repo:parse', (_e, input: string) => parseRepo(input))

  // Clones (or reuses) the repo using the user's OAuth/PAT token if available; supports public repos without token.
  ipcMain.handle('repo:clone', async (e, repo: string) => {
    const token = getSecret('github')
    const root = join(app.getPath('home'), 'Sakai')
    mkdirSync(root, { recursive: true })
    const win = BrowserWindow.fromWebContents(e.sender)
    const log = (line: string) => win?.webContents.send('repo:log', line)
    const url = `https://github.com/${repo}.git`
    const auth = token
      ? ['-c', `http.extraheader=Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`]
      : []

    let dest = join(root, repo.replace('/', '__'))
    if (existsSync(dest)) {
      const remote = await git(dest, ['remote', 'get-url', 'origin'])
      if (remote.code === 0 && remote.out.trim().replace(/\.git$/, '').endsWith(`github.com/${repo}`)) {
        log(`✓ Found existing clone at ${dest}`)
        log('$ git fetch origin')
        await git(dest, [...auth, 'fetch', '--prune', 'origin'], log)
        const dirty = (await git(dest, ['status', '--porcelain'])).out.trim()
        if (dirty) log('! Uncommitted changes present — leaving your working tree untouched')
        else {
          // Start from the default branch: leftover Sakai branches (no upstream) are switched away from, never deleted.
          const head = (await git(dest, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])).out.trim().replace('origin/', '') || 'main'
          const cur = (await git(dest, ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim()
          if (cur !== head) {
            log(`$ git checkout ${head}   (was on ${cur})`)
            await git(dest, ['checkout', head], log)
          }
          const up = await git(dest, ['rev-parse', '--abbrev-ref', '@{u}'])
          if (up.code === 0) {
            log('$ git pull --ff-only')
            const r = await git(dest, [...auth, 'pull', '--ff-only'], log)
            if (r.code !== 0) log('! Could not fast-forward — continuing with the local copy')
          }
        }
        return dest
      }
      // Folder exists but is not this repository: never overwrite it, use a fresh name instead.
      let n = 2
      while (existsSync(`${dest}-${n}`)) n++
      dest = `${dest}-${n}`
      log(`! ${join(root, repo.replace('/', '__'))} is not a clone of ${repo}; using ${dest}`)
    }

    log(`$ git clone ${url} ${dest}`)
    const r = await git(root, [...auth, 'clone', '--progress', url, dest], log)
    if (r.code !== 0) throw new Error(`git clone failed (exit ${r.code}). Check the repository exists and your GitHub account has access.`)
    return dest
  })
}

function git(cwd: string, args: string[], log?: (l: string) => void): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
    let out = ''
    const onData = (d: Buffer) => { const t = String(d); out += t; if (log && t.trim()) log(t.trimEnd()) }
    p.stdout.on('data', onData); p.stderr.on('data', onData)
    p.on('error', (err) => resolve({ code: 1, out: String(err) }))
    p.on('close', (code) => resolve({ code: code ?? 1, out }))
  })
}
