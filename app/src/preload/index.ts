import { contextBridge, ipcRenderer } from 'electron'

const invoke = <T>(ch: string, ...a: unknown[]) => ipcRenderer.invoke(ch, ...a) as Promise<T>

const api = {
  github: {
    start: () => invoke<{ device_code: string; user_code: string; verification_uri: string; interval: number; expires_in: number }>('github:start'),
    poll: (code: unknown) => invoke<{ id: number; login: string; name: string | null; avatar_url: string }>('github:poll', code),
    cancel: () => invoke<void>('github:cancel'),
    open: (uri?: string) => invoke<void>('github:open', uri),
    user: () => invoke<{ id: number; login: string; name: string | null; avatar_url: string } | null>('github:user'),
    token: () => invoke<string | null>('github:token'),
    signOut: () => invoke<void>('github:signout'),
    issues: (repo: string) => invoke<{ number: number; title: string; body: string; labels: string[] }[]>('github:issues', repo),
  },
  secret: {
    set: (k: string, v: string) => invoke<void>('secret:set', k, v),
    get: (k: string) => invoke<string | null>('secret:get', k),
  },
  repo: {
    parse: (input: string) => invoke<string | null>('repo:parse', input),
    clone: (repo: string) => invoke<string>('repo:clone', repo),
    onLog: (cb: (line: string) => void) => {
      const h = (_: unknown, l: string) => cb(l)
      ipcRenderer.on('repo:log', h)
      return () => { ipcRenderer.removeListener('repo:log', h) }
    },
  },
  llm: {
    providers: () => invoke<{ id: string; name: string; kind: string; baseUrl: string; needsKey: boolean; models: string[]; note?: string }[]>('llm:providers'),
    key: (id: string) => invoke<string>('llm:key', id),
    envKey: (id: string) => invoke<string>('llm:envKey', id),
    test: (id: string, key: string, baseUrl?: string) => invoke<{ ok: boolean; message: string; models?: string[] }>('llm:test', id, key, baseUrl),
  },
  local: {
    pickFolder: () => invoke<string | null>('local:pick'),
    inspect: (path: string) => invoke<{ path: string; name: string; isGitRepo: boolean; branch: string | null; dirty: boolean; hasCommits: boolean }>('local:inspect', path),
    ensureRepo: (path: string) => invoke<void>('local:ensureRepo', path),
    createDemo: () => invoke<string>('local:createDemo'),
    revealInFinder: (path: string) => invoke<void>('local:reveal', path),
  },
  system: {
    check: () => invoke<{ git: boolean; node: boolean; online: boolean }>('system:check'),
  },
  serverUrl: () => invoke<string>('server:url'),
  term: {
    create: (cwd: string | null, cols: number, rows: number) => invoke<number>('term:create', cwd, cols, rows),
    write: (id: number, d: string) => ipcRenderer.send('term:write', id, d),
    resize: (id: number, c: number, r: number) => ipcRenderer.send('term:resize', id, c, r),
    kill: (id: number) => ipcRenderer.send('term:kill', id),
    onData: (cb: (id: number, d: string) => void) => {
      const h = (_: unknown, id: number, d: string) => cb(id, d)
      ipcRenderer.on('term:data', h)
      return () => { ipcRenderer.removeListener('term:data', h) }
    },
  },
  onEntrance: (cb: () => void) => ipcRenderer.on('window:entrance', cb),
}

contextBridge.exposeInMainWorld('sakai', api)
export type SakaiApi = typeof api
