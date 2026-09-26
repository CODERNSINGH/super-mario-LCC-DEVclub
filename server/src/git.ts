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

export interface PrInput { root: string; repo: string; token?: string | null; branch: string; title: string; body: string; base?: string }

export async function commitPushPr(i: PrInput): Promise<{ url: string; number?: number }> {
  const g = simpleGit(i.root)
  const files = await changedFiles(i.root)
  const branches = await g.branchLocal()

  if (branches.current !== i.branch) {
    await g.checkoutLocalBranch(i.branch).catch(() => g.checkout(i.branch))
  }

  if (files.length > 0) {
    await g.add('.')
    await g.commit(`${i.title}\n\nCo-authored by Sakai`)
  }

  // Push branch to origin. If token auth fails, fall back to default git credentials.
  const token = (i.token ?? '').trim()
  try {
    const authArgs = token ? ['-c', authed(token)] : []
    await g.raw([...authArgs, 'push', '-u', 'origin', i.branch])
  } catch (pushErr) {
    if (token) {
      await g.raw(['push', '-u', 'origin', i.branch])
    } else {
      throw pushErr
    }
  }

  // Determine base branch
  let base = i.base
  if (!base) {
    try {
      const sym = (await g.raw(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])).trim().replace('origin/', '')
      if (sym) base = sym
    } catch { /* ignore */ }
  }
  if (!base) base = 'main'

  // If token is available, attempt to create the PR via the GitHub REST API
  if (token) {
    try {
      const res = await fetch(`https://api.github.com/repos/${i.repo}/pulls`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: i.title, body: i.body, head: i.branch, base }),
      })
      if (res.ok) {
        const pr = (await res.json()) as { html_url: string; number: number }
        return { url: pr.html_url, number: pr.number }
      }

      // Check if a PR already exists for this branch
      const errText = await res.text()
      if (res.status === 422 && /pull request already exists/i.test(errText)) {
        const owner = i.repo.split('/')[0]
        const listRes = await fetch(`https://api.github.com/repos/${i.repo}/pulls?head=${encodeURIComponent(`${owner}:${i.branch}`)}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
        })
        if (listRes.ok) {
          const list = (await listRes.json()) as { html_url: string; number: number }[]
          if (list.length > 0) return { url: list[0].html_url, number: list[0].number }
        }
      }
    } catch { /* fallback to web URL */ }
  }

  // Fallback to GitHub compare / new PR web URL
  const url = `https://github.com/${i.repo}/pull/new/${encodeURIComponent(i.branch)}`
  return { url }
}
