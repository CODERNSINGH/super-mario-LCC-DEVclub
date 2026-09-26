import { useSyncExternalStore } from 'react'

export interface QuickCmd { id: string; name: string; command: string; builtin?: boolean }

const KEY = 'sakai.quick'
const DEFAULTS: QuickCmd[] = [
  { id: 'status', name: 'Git status', command: 'git status -sb', builtin: true },
  { id: 'log', name: 'Recent commits', command: 'git log --oneline -15', builtin: true },
  { id: 'diff', name: 'Diff summary', command: 'git diff --stat', builtin: true },
  { id: 'tree', name: 'File tree', command: 'git ls-files | head -80', builtin: true },
]

function read(): QuickCmd[] {
  try { return [...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '[]') as QuickCmd[])] } catch { return DEFAULTS }
}
let cache = read()
const subs = new Set<() => void>()

function write(custom: QuickCmd[]) {
  try { localStorage.setItem(KEY, JSON.stringify(custom)) } catch { /* storage unavailable */ }
  cache = [...DEFAULTS, ...custom]
  subs.forEach((f) => f())
}

export const addQuick = (name: string, command: string) => write([...cache.filter((c) => !c.builtin), { id: String(Date.now()), name, command }])
export const removeQuick = (id: string) => write(cache.filter((c) => !c.builtin && c.id !== id))
export const useQuick = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => cache)

/** Runs a command in the integrated terminal. */
export function runInTerminal(setSession: (p: { panel: 'terminal'; panelOpen: true }) => void, termId: number, command: string) {
  setSession({ panel: 'terminal', panelOpen: true })
  if (termId) window.sakai.term.write(termId, `${command}\r`)
}
