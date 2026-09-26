import { create } from 'zustand'
import type { AgentEvent } from './api'

export type Tab = { id: string; kind: 'task' | 'file' | 'diff'; title: string; path?: string }
export interface Issue { number: number; title: string; body: string; labels: string[] }
export interface Estimate { repoTokens: number; steps: number; inputTokens: number; outputTokens: number; costUsd: number; minutes: number; complexity: string; testCommand: string | null; tips: string[]; priced: boolean }
export type Phase = 'idle' | 'estimating' | 'estimated' | 'running' | 'done' | 'failed'
export type Panel = 'logs' | 'terminal' | 'agent'
export type Side = 'explorer' | 'issues' | 'changes' | 'quick' | 'settings'

interface Session {
  tabs: Tab[]; active: string; dirty: Record<string, boolean>; termId: number
  side: Side; panel: Panel; panelOpen: boolean; palette: boolean
  logs: string[]
  issues: Issue[]; picked: Issue | null
  goal: string; notes: string; testCommand: string; branch: string
  estimate: Estimate | null; phase: Phase
  events: AgentEvent[]; usage: { inputTokens: number; outputTokens: number; steps: number }
  summary: string; changed: string[]; pr: { url: string; number: number } | null
  set: (p: Partial<Session>) => void
  log: (l: string) => void
  openTab: (t: Tab) => void
  closeTab: (id: string) => void
}

export const useSession = create<Session>((set) => ({
  tabs: [{ id: 'task', kind: 'task', title: 'Task' }], active: 'task', dirty: {}, termId: 0,
  side: 'issues', panel: 'logs', panelOpen: true, palette: false,
  logs: [], issues: [], picked: null,
  goal: '', notes: '', testCommand: '', branch: '',
  estimate: null, phase: 'idle', events: [], usage: { inputTokens: 0, outputTokens: 0, steps: 0 },
  summary: '', changed: [], pr: null,
  set: (p) => set(p),
  log: (l) => set((s) => ({ logs: [...s.logs, l] })),
  openTab: (t) => set((s) => ({ tabs: s.tabs.some((x) => x.id === t.id) ? s.tabs : [...s.tabs, t], active: t.id })),
  closeTab: (id) => set((s) => {
    if (id === 'task') return s
    const tabs = s.tabs.filter((t) => t.id !== id)
    return { tabs, active: s.active === id ? tabs[tabs.length - 1].id : s.active }
  }),
}))
