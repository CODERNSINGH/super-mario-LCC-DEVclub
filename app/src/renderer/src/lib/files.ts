import { post } from './api'

export interface FNode { name: string; path: string; dir: boolean }

const cache = new Map<string, string[]>()

/** Breadth-first listing of every file path (capped) — powers Quick Open and Search. */
export async function allFiles(root: string, force = false): Promise<string[]> {
  if (!force && cache.has(root)) return cache.get(root)!
  const out: string[] = []
  let queue: string[] = ['']
  while (queue.length && out.length < 3000) {
    const level = await Promise.all(queue.map((d) => post<FNode[]>('/fs/list', { root, path: d }).catch(() => [] as FNode[])))
    queue = []
    for (const nodes of level) for (const n of nodes) { if (n.dir) queue.push(n.path); else out.push(n.path) }
  }
  cache.set(root, out)
  return out
}
export const invalidateFiles = (root: string) => cache.delete(root)

export interface Hit { path: string; line: number; text: string }

/** Plain-text search across tracked files (client-side; skips binaries and huge files). */
export async function searchText(root: string, query: string, opts: { caseSensitive: boolean; regex: boolean }, onHit: (h: Hit) => void, signal: { cancelled: boolean }): Promise<number> {
  const files = (await allFiles(root)).filter((f) => !/\.(png|jpe?g|gif|ico|icns|woff2?|ttf|zip|pdf|lock)$/i.test(f) && !/package-lock\.json$/.test(f))
  let re: RegExp
  try { re = new RegExp(opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), opts.caseSensitive ? '' : 'i') } catch { return 0 }
  let total = 0, i = 0
  const worker = async () => {
    while (i < files.length && !signal.cancelled && total < 500) {
      const f = files[i++]
      try {
        const { content } = await post<{ content: string }>('/fs/read', { root, path: f })
        if (content.length > 400_000) continue
        content.split('\n').forEach((l, n) => { if (total < 500 && re.test(l)) { total++; onHit({ path: f, line: n + 1, text: l.trim().slice(0, 200) }) } })
      } catch { /* unreadable */ }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return total
}
