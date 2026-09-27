import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { runShell, safePath } from '../tools/shell.js'

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'target', 'vendor', '__pycache__', '.venv', 'venv'])
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.go', '.rs', '.java', '.kt', '.rb', '.php', '.c', '.cc', '.cpp', '.h', '.cs', '.swift', '.vue', '.svelte', '.json', '.yml', '.yaml', '.toml', '.md', '.sh', '.css', '.html'])

export interface TreeNode { name: string; path: string; dir: boolean; children?: TreeNode[] }

export async function listDir(root: string, rel = ''): Promise<TreeNode[]> {
  const dir = safePath(root, rel)
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((e) => !(e.isDirectory() && SKIP.has(e.name)) && e.name !== '.DS_Store')
    .map((e) => ({ name: e.name, path: join(rel, e.name), dir: e.isDirectory() }))
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
}

export async function readRepoFile(root: string, rel: string): Promise<string> {
  const p = safePath(root, rel)
  if ((await stat(p)).size > 1_500_000) return '[file too large to display]'
  return readFile(p, 'utf8')
}

/** Tracked files with sizes (uses git so ignored files are skipped). */
export async function trackedFiles(root: string): Promise<{ path: string; size: number }[]> {
  const r = await runShell(root, 'git ls-files', 20_000)
  let files = r.code === 0 ? r.output.split('\n').filter(Boolean) : []
  if (!files.length) files = await walk(root) // not a git repo (local test folder)
  const out: { path: string; size: number }[] = []
  for (const f of files) {
    if (!CODE_EXT.has(extname(f).toLowerCase())) continue
    try { out.push({ path: f, size: (await stat(join(root, f))).size }) } catch { /* deleted */ }
  }
  return out
}

export async function repoMap(root: string, maxLines = 160): Promise<string> {
  const files = await trackedFiles(root)
  const lines = files.map((f) => f.path).sort()
  return lines.length > maxLines ? [...lines.slice(0, maxLines), `… ${lines.length - maxLines} more files`].join('\n') : lines.join('\n')
}

export async function detectTestCommand(root: string): Promise<string | null> {
  const has = (f: string) => existsSync(join(root, f))
  if (has('package.json')) {
    try {
      const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
      if (pkg.scripts?.test && !/no test specified/.test(pkg.scripts.test)) {
        const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lockb') ? 'bun' : 'npm'
        return `${pm} test`
      }
    } catch { /* fallthrough */ }
  }
  if (has('pytest.ini') || has('pyproject.toml') || has('setup.py') || has('tox.ini')) return 'python -m pytest -x -q'
  if (has('Cargo.toml')) return 'cargo test'
  if (has('go.mod')) return 'go test ./...'
  if (has('pom.xml')) return 'mvn -q test'
  if (has('build.gradle') || has('build.gradle.kts')) return './gradlew test'
  if (has('Gemfile')) return 'bundle exec rspec'
  if (has('Makefile')) return 'make test'
  return null
}

/** Installs project dependencies without touching manifests or lockfiles. Returns a log tail, or null if nothing to do. */
export async function installDeps(root: string): Promise<string | null> {
  const has = (f: string) => existsSync(join(root, f))
  if (has('package.json') && !has('node_modules')) {
    const cmd = has('pnpm-lock.yaml') ? 'pnpm install --frozen-lockfile'
      : has('yarn.lock') ? 'yarn install --frozen-lockfile'
      : has('package-lock.json') ? 'npm ci --no-audit --no-fund'
      : 'npm install --no-package-lock --no-audit --no-fund'
    const r = await runShell(root, cmd, 480_000)
    return `$ ${cmd}\nexit ${r.code}\n${r.output.slice(-600)}`
  }
  return null
}

/** Directory walk used when a folder is not (yet) a git repository. */
async function walk(root: string, rel = '', out: string[] = []): Promise<string[]> {
  if (out.length > 3000) return out
  for (const e of await readdir(join(root, rel), { withFileTypes: true }).catch(() => [])) {
    if (SKIP.has(e.name) || e.name.startsWith('.sakai-')) continue
    const p = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) await walk(root, p, out)
    else out.push(p)
  }
  return out
}
