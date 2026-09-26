import { create } from 'zustand'

export type Step = 'repo' | 'github' | 'llm' | 'workspace'
export type Mode = 'github' | 'local'
export interface GhUser { id?: number; login: string; name: string | null; avatar_url: string }
export interface LlmChoice { provider: string; model: string; baseUrl?: string }

interface State {
  step: Step
  /** `github`: repo is cloned from GitHub. `local`: an existing folder on disk (no login needed). */
  mode: Mode
  repoInput: string
  repo: string | null
  user: GhUser | null
  llm: LlmChoice | null
  localPath: string | null
  set: (p: Partial<State>) => void
}

export const useApp = create<State>((set) => ({
  step: 'repo', mode: 'github', repoInput: '', repo: null, user: null, llm: null, localPath: null,
  set: (p) => set(p),
}))
