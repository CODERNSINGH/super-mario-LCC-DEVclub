import { post } from './api'
import { useSession, type FileStat } from './session'
import { useApp } from '../store'
import * as A from './actions'

/** Parses a unified `git diff` into per-file stats and new-side line numbers of additions/removals. */
export function parseDiff(diff: string): Record<string, FileStat> {
  const out: Record<string, FileStat> = {}
  let cur: FileStat | null = null, nl = 0, inHunk = false
  for (const l of diff.split('\n')) {
    if (l.startsWith('diff --git ')) {
      const m = l.match(/ b\/(.+)$/)
      cur = m ? (out[m[1]] = { add: 0, del: 0, status: 'M', added: [], removedAt: [] }) : null; inHunk = false; continue
    }
    if (!cur) continue
    if (!inHunk) {
      if (l.startsWith('new file mode')) cur.status = 'A'
      else if (l.startsWith('deleted file mode')) cur.status = 'D'
    }
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/)
    if (h) { nl = Number(h[1]); inHunk = true; continue }
    if (!inHunk || l.startsWith('\\')) continue
    if (l.startsWith('+')) { cur.add++; cur.added.push(nl++) }
    else if (l.startsWith('-')) { cur.del++; cur.removedAt.push(Math.max(1, nl)) }
    else nl++
  }
  return out
}

let timer: ReturnType<typeof setTimeout> | null = null
/** Debounced: recompute change stats from the working tree and bump `rev` so open editors refresh. */
export function refreshChanges(root: string | null = useApp.getState().localPath, delay = 250): Promise<void> {
  if (!root) return Promise.resolve()
  if (timer) clearTimeout(timer)
  return new Promise((resolve) => {
    timer = setTimeout(async () => {
      try {
        const { diff } = await post<{ diff: string }>('/git/diff', { root })
        const stats = parseDiff(diff)
        const s = useSession.getState()
        s.set({ stats, changed: Object.keys(stats), rev: s.rev + 1 })
      } catch { /* not a repo yet */ }
      resolve()
    }, delay)
  })
}

/** Called when the agent writes a file: open (once) a live diff tab and refresh. */
export function onAgentEdit(path: string): void {
  const s = useSession.getState()
  if (!s.tabs.some((t) => t.id === `diff:${path}`)) {
    s.openTab({ id: `diff:${path}`, kind: 'diff', title: `${path.split('/').pop()} (Working Tree)`, path, live: true })
  }
  void refreshChanges()
}

export function openAllDiffs(): void {
  const { changed } = useSession.getState()
  changed.forEach((f) => A.openDiff(f))
}
