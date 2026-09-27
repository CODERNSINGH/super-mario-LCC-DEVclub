import { create } from 'zustand'

export type Step = 'repo' | 'github' | 'llm' | 'workspace'
export type Mode = 'github' | 'local'
export interface GhUser { id?: number; login: string; name: string | null; avatar_url: string }
export interface LlmChoice { provider: string; model: string; baseUrl?: string }

export type Profile = 'student' | 'swe' | 'vibe'
export const PROFILES: { id: Profile; emoji: string; name: string; blurb: string; api: 'student' | 'developer' | 'vibe' }[] = [
  { id: 'student', emoji: '🎓', name: 'Student', blurb: 'Learn the logic while AI works', api: 'student' },
  { id: 'swe', emoji: '🧑‍💻', name: 'SWE', blurb: 'Crisp reasoning, no fluff', api: 'developer' },
  { id: 'vibe', emoji: '✨', name: 'Vibe coder', blurb: 'Plain words + spot the risky bits', api: 'vibe' },
]
const ls = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }
const initProfile = (): Profile => { const v = ls('sakai.profile'); return v === 'student' || v === 'swe' || v === 'vibe' ? v : 'swe' }

interface State {
  profile: Profile
  tipsOn: boolean
  setProfile: (p: Profile) => void
  setTipsOn: (b: boolean) => void
  step: Step
  /** `github`: repo is cloned from GitHub. `local`: an existing folder on disk (no login needed). */
  mode: Mode
  repoInput: string
  repo: string | null
  user: GhUser | null
  llm: LlmChoice | null
  /** True while the model came from the AI_API_KEY environment (evaluation mode): the model step is skipped once. */
  envAuto: boolean
  localPath: string | null
  set: (p: Partial<State>) => void
}

export const useApp = create<State>((set) => ({
  profile: initProfile(), tipsOn: ls('sakai.tips') !== 'off',
  setProfile: (profile) => { lsSet('sakai.profile', profile); set({ profile }) },
  setTipsOn: (b) => { lsSet('sakai.tips', b ? 'on' : 'off'); set({ tipsOn: b }) },
  step: 'repo', mode: 'github', repoInput: '', repo: null, user: null, llm: null, envAuto: false, localPath: null,
  set: (p) => set(p),
}))
