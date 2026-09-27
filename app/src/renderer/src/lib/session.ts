import { create } from 'zustand'

export type Tab = { id: string; kind: 'welcome' | 'file' | 'diff' | 'settings'; title: string; path?: string; live?: boolean }
export interface Issue { number: number; title: string; body: string; labels: string[] }
export interface Estimate { repoTokens: number; steps: number; inputTokens: number; outputTokens: number; costUsd: number; minutes: number; complexity: string; testCommand: string | null; tips: string[]; priced: boolean }
export interface FileStat { add: number; del: number; status: 'A' | 'M' | 'D'; added: number[]; removedAt: number[] }
export interface LogLine { ts: number; level: 'info' | 'warn' | 'error'; text: string; agent?: boolean }
export type Side = 'explorer' | 'search' | 'scm' | 'issues' | 'quick'
export type PanelTab = 'problems' | 'output' | 'debug' | 'terminal'
export interface ModalSpec { title: string; body: string; confirm: string; cancel?: string; onConfirm: () => void }
export interface Problem { message: string; source: string; severity: 'error' | 'warning' }

const LS = 'sakai.layout'
const layout = (() => { try { return JSON.parse(localStorage.getItem(LS) ?? '{}') as Record<string, number> } catch { return {} } })()
const saveLayout = (p: Record<string, number>) => { try { localStorage.setItem(LS, JSON.stringify({ ...layout, ...p })) } catch { /* ignore */ } }

interface Session {
  tabs: Tab[]; active: string; dirty: Record<string, boolean>; termId: number
  side: Side; sideOpen: boolean; sideW: number
  agentOpen: boolean; agentW: number
  panelOpen: boolean; panel: PanelTab; panelH: number; panelMax: boolean
  palette: null | 'commands' | 'files'
  modal: ModalSpec | null
  agentView: 'chat' | 'task'
  composerText: string
  ready: boolean; cloneFailed: boolean
  logs: LogLine[]; debug: string[]; problems: Problem[]
  issues: Issue[]; picked: Issue | null; solving: number | null
  goal: string; notes: string; testCommand: string; branch: string; stepLimit: number; timeLimitMin: number
  stats: Record<string, FileStat>; rev: number
  estimate: Estimate | null
  changed: string[]
  cursor: { line: number; col: number }
  activity: string
  set: (p: Partial<Session>) => void
  setSize: (p: Partial<Pick<Session, 'sideW' | 'agentW' | 'panelH'>>) => void
  log: (l: string, level?: LogLine['level'], agent?: boolean) => void
  dbg: (l: string) => void
  openTab: (t: Tab) => void
  closeTab: (id: string) => void
  reset: () => void
}

const fresh = () => ({
  tabs: [{ id: 'welcome', kind: 'welcome', title: 'Welcome' } as Tab], active: 'welcome', dirty: {}, termId: 0,
  ready: false, cloneFailed: false,
  logs: [], debug: [], problems: [], issues: [], picked: null, solving: null,
  goal: '', notes: '', testCommand: '', branch: '', stepLimit: 30, timeLimitMin: 0, stats: {}, rev: 0, estimate: null, changed: [],
  cursor: { line: 1, col: 1 }, activity: '',
})

export const useSession = create<Session>((set) => ({
  ...fresh(),
  side: 'explorer', sideOpen: true, sideW: layout.sideW ?? 264,
  agentOpen: true, agentW: layout.agentW ?? 400,
  panelOpen: true, panel: 'output', panelH: layout.panelH ?? 220, panelMax: false,
  palette: null, modal: null, agentView: 'chat', composerText: '',
  set: (p) => set(p),
  setSize: (p) => { saveLayout(p as Record<string, number>); set(p) },
  log: (l, level, agent) => set((s) => ({ logs: [...s.logs.slice(-1500), { ts: Date.now(), level: level ?? (l.startsWith('✗') ? 'error' : l.startsWith('!') ? 'warn' : 'info'), text: l, agent }] })),
  dbg: (l) => set((s) => ({ debug: [...s.debug.slice(-800), l] })),
  openTab: (t) => set((s) => ({ tabs: s.tabs.some((x) => x.id === t.id) ? s.tabs : [...s.tabs, t], active: t.id })),
  closeTab: (id) => set((s) => {
    const i = s.tabs.findIndex((t) => t.id === id)
    if (i < 0) return s
    const tabs = s.tabs.filter((t) => t.id !== id)
    const dirty = { ...s.dirty }; delete dirty[id]
    return { tabs, dirty, active: s.active === id ? (tabs[Math.min(i, tabs.length - 1)]?.id ?? '') : s.active }
  }),
  reset: () => set(fresh()),
}))
