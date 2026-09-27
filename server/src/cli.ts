#!/usr/bin/env node
/**
 * Sakai IDE — headless mode.  `make solve REPO=<url|path> ISSUE=<n>`  (or TASK="describe the bug")
 *
 * Reads the model credential ONLY from the environment (AI_API_KEY), clones the repository, runs the same
 * autonomous harness as the desktop app, prints live progress, and exits 0 when a verified fix was produced.
 */
import { createInterface } from 'node:readline/promises'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { runAgent } from './agent/loop.js'
import { commitLocal } from './git.js'
import type { LlmConfig } from './llm/client.js'

const PROVIDERS: Record<string, { baseUrl: string; kind: LlmConfig['kind']; model: string; native: boolean }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', kind: 'openai', model: 'deepseek-v4-pro', native: true },
  qwen: { baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', kind: 'openai', model: 'qwen3.8-max', native: true },
  'qwen-cn': { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', kind: 'openai', model: 'qwen3.8-max', native: true },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', kind: 'openai', model: 'openai/gpt-oss-120b', native: true },
  openai: { baseUrl: 'https://api.openai.com/v1', kind: 'openai', model: 'gpt-4.1', native: true },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', kind: 'anthropic', model: 'claude-sonnet-5', native: false },
  ollama: { baseUrl: 'http://localhost:11434', kind: 'ollama', model: 'qwen2.5:7b', native: false },
}

const tty = process.stdout.isTTY
const c = (code: number, s: string) => (tty ? `\u001b[${code}m${s}\u001b[0m` : s)
const red = (s: string) => c(31, s), dim = (s: string) => c(2, s), bold = (s: string) => c(1, s), green = (s: string) => c(32, s)

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const [k, inline] = a.slice(2).split('=')
    out[k] = inline ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true')
  }
  return out
}

function fail(msg: string, code = 2): never {
  console.error(red(`✗ ${msg}`))
  process.exit(code)
}

const run = (cwd: string, cmd: string, args: string[]) => spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })

function parseRepo(input: string): string | null {
  const m = input.trim().match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/)
  return m ? `${m[1]}/${m[2]}` : null
}

async function ghIssues(repo: string): Promise<{ number: number; title: string; body: string }[]> {
  const t = process.env.GITHUB_TOKEN
  const res = await fetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Sakai', ...(t ? { Authorization: `Bearer ${t}` } : {}) } })
  if (!res.ok) throw new Error(`Could not list issues for ${repo} (HTTP ${res.status})`)
  const items = (await res.json()) as { number: number; title: string; body: string | null; pull_request?: unknown }[]
  return items.filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, body: i.body ?? '' }))
}

/** Clones (or reuses) a GitHub repo under ~/Sakai and returns its path. */
function ensureClone(repo: string): string {
  const root = join(homedir(), 'Sakai')
  mkdirSync(root, { recursive: true })
  const dest = join(root, repo.replace('/', '__'))
  const t = process.env.GITHUB_TOKEN
  const auth = t ? ['-c', `http.extraheader=Authorization: Basic ${Buffer.from(`x-access-token:${t}`).toString('base64')}`] : []
  if (existsSync(join(dest, '.git'))) {
    console.log(dim(`· reusing existing clone at ${dest}`))
    run(dest, 'git', [...auth, 'fetch', '--prune', 'origin'])
    if (!run(dest, 'git', ['status', '--porcelain']).stdout.trim()) {
      const head = run(dest, 'git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).stdout.trim().replace('origin/', '') || 'main'
      run(dest, 'git', ['checkout', head]); run(dest, 'git', [...auth, 'pull', '--ff-only'])
    } else console.log(dim('· working tree has local changes — left untouched'))
    return dest
  }
  console.log(dim(`$ git clone https://github.com/${repo}.git ${dest}`))
  const r = run(root, 'git', [...auth, 'clone', '--quiet', `https://github.com/${repo}.git`, dest])
  if (r.status !== 0) fail(`git clone failed: ${r.stderr.trim() || 'is the repository public?'}`, 1)
  return dest
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2))
  if (a.help || a.h) {
    console.log(`Sakai IDE — headless solver
  make solve REPO=<github url | owner/name | local path> ISSUE=<number>
  make solve REPO=<...> TASK="describe the bug"
Env: AI_API_KEY (required)  AI_PROVIDER (default deepseek)  AI_MODEL  AI_BASE_URL  GITHUB_TOKEN (optional)
Options: --steps N  --commit (commit the fix locally on a sakai/* branch)`)
    return
  }

  // ── credentials: environment only ───────────────────────────────────────────
  const provider = (a.provider || process.env.AI_PROVIDER || 'deepseek').toLowerCase()
  const p = PROVIDERS[provider] ?? fail(`Unknown AI_PROVIDER "${provider}". Use one of: ${Object.keys(PROVIDERS).join(', ')}`)
  const apiKey = process.env.AI_API_KEY
  if (!apiKey && provider !== 'ollama') fail('AI_API_KEY is not set.  export AI_API_KEY="<your key>"  and run again.')
  const llm: LlmConfig = { baseUrl: process.env.AI_BASE_URL || p.baseUrl, apiKey, model: a.model || process.env.AI_MODEL || p.model, kind: p.kind, native: p.native }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const interactive = !!process.stdin.isTTY
  const ask = async (q: string) => (interactive ? (await rl.question(q)).trim() : '')

  // ── repository ──────────────────────────────────────────────────────────────
  let repoArg = a.repo || (await ask('Repository (GitHub URL, owner/name or local path): '))
  if (!repoArg) fail('No repository given. Use REPO=<url|path>.')
  let root: string, ghRepo: string | null = null
  if (existsSync(resolve(repoArg)) && statSync(resolve(repoArg)).isDirectory()) root = resolve(repoArg)
  else { ghRepo = parseRepo(repoArg); if (!ghRepo) fail(`"${repoArg}" is neither a folder nor a GitHub repository.`); root = ensureClone(ghRepo) }
  if (!existsSync(join(root, '.git'))) { run(root, 'git', ['init', '-q']); run(root, 'git', ['add', '.']); run(root, 'git', ['-c', 'user.name=Sakai', '-c', 'user.email=sakai@localhost', 'commit', '-qm', 'initial']) }

  // ── task ────────────────────────────────────────────────────────────────────
  let issue: { number?: number; title: string; body: string } | undefined
  if (a.task) issue = { title: a.task, body: '' }
  else {
    let number = a.issue ? Number(a.issue) : NaN
    let list: Awaited<ReturnType<typeof ghIssues>> = []
    if (ghRepo) { try { list = await ghIssues(ghRepo) } catch (e) { console.log(dim(`· ${(e as Error).message}`)) } }
    if (!number && list.length && interactive) {
      console.log(bold('\nOpen issues:')); list.forEach((i) => console.log(`  #${i.number}  ${i.title}`))
      const ans = await ask('\nIssue number to solve (or type a task description): ')
      if (/^#?\d+$/.test(ans)) number = Number(ans.replace('#', '')); else if (ans) issue = { title: ans, body: '' }
    }
    if (!issue && number) { const hit = list.find((i) => i.number === number); if (!hit) fail(`Issue #${number} not found${ghRepo ? ` in ${ghRepo}` : ' (issues are only available for GitHub repositories)'}.`); issue = { number, title: `#${number} ${hit.title}`, body: hit.body } }
  }
  rl.close()
  if (!issue) fail('Nothing to solve. Use ISSUE=<n> or TASK="...".')

  console.log(`\n${bold('Sakai IDE')}  ${dim(`${llm.model} via ${new URL(llm.baseUrl).host}`)}\n${bold('Task')}  ${issue.title}\n`)

  // ── run the harness ─────────────────────────────────────────────────────────
  const ac = new AbortController()
  process.on('SIGINT', () => { console.log(red('\n^C — stopping…')); ac.abort() })
  let last = ''
  const result = await runAgent({
    root, llm, issue, maxSteps: a.steps ? Number(a.steps) : undefined, signal: ac.signal,
    onEvent: (e) => {
      if (e.type === 'status' && e.data !== last) { last = e.data as string; console.log(dim(`· ${e.data}`)) }
      else if (e.type === 'tool') {
        const d = e.data as { call: { tool: string; args: Record<string, string> }; out: string }
        console.log(`${green('$')} ${d.call.tool} ${dim(d.call.args.command ?? d.call.args.path ?? d.call.args.pattern ?? '')}`)
        const first = d.out.split('\n').filter(Boolean).slice(0, 2).join(' ⏎ ').slice(0, 160)
        if (first) console.log(dim(`  ↳ ${first}`))
      } else if (e.type === 'assistant' && typeof e.data === 'string' && e.data.trim()) console.log(`\n${e.data.trim().slice(0, 600)}\n`)
    },
  }).catch((e: Error) => fail(e.message, 1))

  // ── report ──────────────────────────────────────────────────────────────────
  console.log(`\n${result.finished ? green('✓ Fix verified') : red('✗ Not finished')}  ${result.summary}`)
  console.log(dim(`  ${result.steps} steps · ${result.inputTokens + result.outputTokens} tokens`))
  const diff = run(root, 'git', ['diff', '--stat', 'HEAD']).stdout.trim()
  console.log(diff ? `\n${bold('Changes')}\n${diff}\n` : dim('\n(no file changes)\n'))
  if (a.commit && diff) {
    const r = await commitLocal({ root, branch: `sakai/${(issue.number ? `issue-${issue.number}` : 'task')}`, message: issue.title.slice(0, 70) })
    console.log(green(`✓ committed ${r.sha.slice(0, 7)} on ${r.branch}`))
  }
  console.log(dim(`Repository: ${root}`))
  process.exit(result.finished ? 0 : 1)
}

main().catch((e: Error) => fail(e.message, 1))
