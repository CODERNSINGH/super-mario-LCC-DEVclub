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
  const files = r.output.split('\n').filter(Boolean)
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
