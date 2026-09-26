import type { SakaiApi } from '../../../preload'

export interface FolderInfo { path: string; name: string; isGitRepo: boolean; branch: string | null; dirty: boolean; hasCommits: boolean }
export interface SystemCheck { git: boolean; node: boolean; online: boolean }

interface Extra {
  local?: {
    pickFolder(): Promise<string | null>
    inspect(path: string): Promise<FolderInfo>
    ensureRepo(path: string): Promise<void>
    createDemo(): Promise<string>
    revealInFinder(path: string): Promise<void> | void
  }
  system?: { check(): Promise<SystemCheck> }
}

const sk = () => window.sakai as SakaiApi & Extra
const missing = (what: string) => new Error(`${what} is not available in this build`)

/** Local-folder + system helpers provided by the main process. Wrapped so the UI degrades gracefully if a helper is missing. */
export const local = {
  pickFolder: async (): Promise<string | null> => { if (typeof sk().local?.pickFolder !== 'function') throw missing('Folder picker'); return sk().local!.pickFolder() },
  inspect: async (p: string): Promise<FolderInfo> => typeof sk().local?.inspect === 'function' ? sk().local!.inspect(p) : { path: p, name: p.split('/').pop() ?? p, isGitRepo: true, branch: null, dirty: false, hasCommits: true },
  ensureRepo: async (p: string): Promise<void> => { if (typeof sk().local?.ensureRepo === 'function') await sk().local!.ensureRepo(p) },
  createDemo: async (): Promise<string> => { if (typeof sk().local?.createDemo !== 'function') throw missing('Demo project'); return sk().local!.createDemo() },
  reveal: (p: string) => { void sk().local?.revealInFinder?.(p) },
}

export const system = {
  check: async (): Promise<SystemCheck> => typeof sk().system?.check === 'function' ? sk().system!.check() : { git: true, node: true, online: navigator.onLine },
}
