import { simpleGit } from 'simple-git'

const authed = (token: string) => `http.https://github.com/.extraheader=AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`

export async function currentDiff(root: string): Promise<string> {
  const g = simpleGit(root)
  await g.raw(['add', '-N', '.']).catch(() => undefined) // include new files in diff
  return g.diff(['HEAD'])
}

export async function changedFiles(root: string): Promise<string[]> {
  const s = await simpleGit(root).status()
  return [...new Set([...s.modified, ...s.created, ...s.not_added, ...s.renamed.map((r) => r.to), ...s.deleted])]
}

export async function originalContent(root: string, rel: string): Promise<string> {
  return simpleGit(root).show([`HEAD:${rel}`]).catch(() => '')
}

export async function createBranch(root: string, name: string): Promise<void> {
  await simpleGit(root).checkoutLocalBranch(name)
}

export interface PrInput { author?: { name: string; email: string }; root: string; repo: string; token: string; branch: string; title: string; body: string; base?: string }

export async function commitPushPr(i: PrInput): Promise<{ url: string; number: number }> {
  const g = simpleGit(i.root)
  const files = await changedFiles(i.root)
  if (!files.length) throw new Error('No changes to commit')
  const branches = await g.branchLocal()
  if (branches.current !== i.branch) await g.checkoutLocalBranch(i.branch).catch(() => g.checkout(i.branch))
  // Machines without a git identity would fail with "Please tell me who you are": fall back to the GitHub account.
  const hasName = (await g.getConfig('user.name')).value, hasEmail = (await g.getConfig('user.email')).value
  if (i.author && !hasName) await g.addConfig('user.name', i.author.name, false, 'local')
  if (i.author && !hasEmail) await g.addConfig('user.email', i.author.email, false, 'local')
  await g.add('.')
  await g.commit(i.title)
  await g.raw(['-c', authed(i.token), 'push', '-u', 'origin', i.branch])

  const base = i.base ?? (await defaultBranch(i.repo, i.token))
  const res = await fetch(`https://api.github.com/repos/${i.repo}/pulls`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${i.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: i.title, body: i.body, head: i.branch, base }),
  })
  if (!res.ok) throw new Error(`GitHub PR creation failed (${res.status}): ${await res.text()}`)
  const pr = (await res.json()) as { html_url: string; number: number }
  return { url: pr.html_url, number: pr.number }
}

async function defaultBranch(repo: string, token: string): Promise<string> {
  const r = await fetch(`https://api.github.com/repos/${repo}`, { headers: { Authorization: `Bearer ${token}` } })
  return ((await r.json()) as { default_branch: string }).default_branch
}
