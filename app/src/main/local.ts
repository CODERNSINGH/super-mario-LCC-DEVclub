import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { DEMO_FILES } from './demo-project'
import { GIT_MISSING_MESSAGE, gitInstalled, runGit } from './git'

export interface FolderInfo { path: string; name: string; isGitRepo: boolean; branch: string | null; dirty: boolean; hasCommits: boolean }

const FALLBACK = { name: 'Sakai', email: 'sakai@localhost' }

function assertDir(p: string): string {
  const abs = resolve(p)
  if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new Error(`Folder not found: ${abs}`)
  return abs
}

async function requireGit(): Promise<void> {
  if (!(await gitInstalled())) throw new Error(GIT_MISSING_MESSAGE)
}

export async function inspectFolder(path: string): Promise<FolderInfo> {
  const dir = assertDir(path)
  const base: FolderInfo = { path: dir, name: basename(dir), isGitRepo: false, branch: null, dirty: false, hasCommits: false }
  if (!(await gitInstalled())) return base
  const inside = await runGit(dir, ['rev-parse', '--is-inside-work-tree'])
  if (inside.code !== 0 || inside.out.trim() !== 'true') return base
  const hasCommits = (await runGit(dir, ['rev-parse', '--verify', '-q', 'HEAD'])).code === 0
  const branch = (await runGit(dir, ['symbolic-ref', '--short', '-q', 'HEAD'])).out.trim() || null // works before the first commit
  const dirty = (await runGit(dir, ['status', '--porcelain'])).out.trim().length > 0
  return { ...base, isGitRepo: true, branch, dirty, hasCommits }
}

/** Makes the folder a git repo with at least one commit so diffs/branches work. Never rewrites an existing history. */
export async function ensureRepo(path: string): Promise<void> {
  await requireGit()
  const dir = assertDir(path)
  const info = await inspectFolder(dir)
  if (info.isGitRepo && info.hasCommits) return

  if (!info.isGitRepo) {
    const init = await runGit(dir, ['init', '-b', 'main'])
    if (init.code !== 0) { // git < 2.28 has no -b
      const plain = await runGit(dir, ['init'])
      if (plain.code !== 0) throw new Error(`git init failed: ${plain.out.trim()}`)
      await runGit(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
    }
    // Keep dependency folders out of the first commit when the project has no .gitignore of its own.
    if (existsSync(join(dir, 'node_modules')) && !existsSync(join(dir, '.gitignore'))) writeFileSync(join(dir, '.gitignore'), 'node_modules/\n.DS_Store\n')
  }

  const hasName = (await runGit(dir, ['config', 'user.name'])).out.trim()
  const hasEmail = (await runGit(dir, ['config', 'user.email'])).out.trim()
  const id = [...(hasName ? [] : ['-c', `user.name=${FALLBACK.name}`]), ...(hasEmail ? [] : ['-c', `user.email=${FALLBACK.email}`])]

  await runGit(dir, ['add', '-A'])
  const commit = await runGit(dir, [...id, 'commit', '--allow-empty', '-m', 'Initial commit'])
  if (commit.code !== 0) throw new Error(`Could not create the initial commit: ${commit.out.trim()}`)
}

export async function createDemo(): Promise<string> {
  const dir = join(app.getPath('home'), 'Sakai', 'sakai-demo')
  if (existsSync(dir) && readdirSync(dir).length > 0) return dir // never overwrite the user's edits
  for (const [rel, content] of Object.entries(DEMO_FILES)) {
    const file = join(dir, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
  await ensureRepo(dir)
  return dir
}

export function registerLocalIpc(): void {
  ipcMain.handle('local:pick', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const opts = { title: 'Choose a project folder', buttonLabel: 'Open Folder', properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'> }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]
  })
  ipcMain.handle('local:inspect', (_e, path: string) => inspectFolder(path))
  ipcMain.handle('local:ensureRepo', (_e, path: string) => ensureRepo(path))
  ipcMain.handle('local:createDemo', () => createDemo())
  ipcMain.handle('local:reveal', (_e, path: string) => { shell.showItemInFolder(assertDir(path)) })
}
