import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import { useSession } from '../lib/session'
import { post, cleanErr } from '../lib/api'
import { pushRecent } from '../lib/recent'
import * as A from '../lib/actions'
import { TitleBar } from './TitleBar'
import { ActivityBar } from './ActivityBar'
import { ExplorerPane, SearchPane, ScmPane, IssuesPane, QuickPane } from './SidePanes'
import { EditorArea } from './EditorArea'
import { Panel } from './Panel'
import { StatusBar } from './StatusBar'
import { AgentPanel } from './agent/AgentPanel'
import { CommandPalette } from './CommandPalette'
import { Splitter } from './Splitter'

export function Workspace() {
  const { repo, localPath, mode, set } = useApp()
  const s = useSession()
  const booted = useRef('')
  const [nonce, setNonce] = useState(0)

  const openReadme = useCallback(async (root: string) => {
    const nodes = await post<{ name: string; path: string; dir: boolean }[]>('/fs/list', { root, path: '' }).catch(() => [])
    const f = nodes.find((n) => !n.dir && /^readme/i.test(n.name)) ?? nodes.find((n) => !n.dir)
    if (f) A.openFile(f.path)
  }, [])

  // Boot: GitHub mode clones (or reuses) the repo; local mode opens the folder as-is.
  useEffect(() => {
    const key = mode === 'github' ? `g:${repo}` : `l:${localPath}`
    if (booted.current === key || (mode === 'github' && !repo) || (mode === 'local' && !localPath)) return
    booted.current = key
    const st = useSession.getState()
    const off = window.sakai.repo.onLog((l) => useSession.getState().log(l))
    void (async () => {
      try {
        let root = localPath
        if (mode === 'github') {
          pushRecent({ kind: 'github', value: repo! })
          root = await window.sakai.repo.clone(repo!)
          set({ localPath: root })
          st.log(`✓ Ready at ${root}`)
          st.log('$ gh issue list --state open')
          const list = await window.sakai.github.issues(repo!)
          st.set({ issues: list, side: 'explorer' })
          st.log(`✓ ${list.length} open issue(s) found.`)
        } else {
          st.log(`✓ Opened ${localPath}`)
        }
        st.set({ ready: true })
        await openReadme(root!)
      } catch (e) {
        st.log(`✗ ${cleanErr(e)}`)
        st.log('→ Fix it in the Terminal tab — you can run git commands yourself — then press Retry.')
        st.set({ cloneFailed: true, panel: 'output', panelOpen: true })
      }
    })()
    return () => { off() }
  }, [mode, repo, localPath, set, openReadme, nonce])

  useEffect(() => {
    const h = () => { booted.current = ''; useSession.getState().set({ cloneFailed: false }); useSession.getState().log('$ retry'); setNonce((n) => n + 1) }
    window.addEventListener('sakai:retry', h)
    return () => window.removeEventListener('sakai:retry', h)
  }, [])

  // Keep the changed-files badge fresh.
  useEffect(() => {
    if (!localPath || !s.ready) return
    const tick = () => void post<{ files: string[] }>('/git/changes', { root: localPath }).then(({ files }) => { const cur = useSession.getState().changed; if (files.join('|') !== cur.join('|')) useSession.getState().set({ changed: files }) }).catch(() => undefined)
    tick(); const id = setInterval(tick, 4000)
    return () => clearInterval(id)
  }, [localPath, s.ready])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const m = e.metaKey || e.ctrlKey, k = e.key.toLowerCase()
      if (!m) return
      const go = (fn: () => void) => { e.preventDefault(); fn() }
      if (k === 'p' && e.shiftKey) go(() => A.openPalette('commands'))
      else if (k === 'p') go(() => A.openPalette('files'))
      else if (k === 'b' && e.altKey) go(A.toggleAgent)
      else if (k === 'b') go(A.toggleSidebar)
      else if (k === 'j') go(A.togglePanel)
      else if (e.key === '`') go(() => (useSession.getState().panelOpen && useSession.getState().panel === 'terminal' ? A.togglePanel() : A.openTerminal()))
      else if (k === 'e' && e.shiftKey) go(() => A.showSide('explorer'))
      else if (k === 'f' && e.shiftKey) go(() => A.showSide('search'))
      else if (k === 'g' && e.shiftKey) go(() => A.showSide('scm'))
      else if (k === 'w') go(() => { const st = useSession.getState(); st.closeTab(st.active) })
      else if (k === ',') go(A.openSettings)
      else if (k === 'n') go(A.newTask)
      else if (k === 'o') go(() => void A.pickAndOpenFolder())
      else if (k === 'r' && e.shiftKey) go(A.newTask)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  // Keep at least ~400px for the editor: side panes shrink on narrow windows without losing the saved size.
  const [vw, setVw] = useState(window.innerWidth)
  useEffect(() => { const h = () => setVw(window.innerWidth); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h) }, [])
  const room = vw - 48 - 400
  const sideEff = s.sideOpen ? clamp(s.sideW, 180, Math.max(180, room - (s.agentOpen ? 300 : 0))) : 0
  const agentEff = s.agentOpen ? clamp(s.agentW, 300, Math.max(300, room - sideEff)) : 0
  return (
    <div className="h-full flex flex-col bg-bg">
      <TitleBar />
      <div className="flex-1 flex min-h-0">
        <ActivityBar />
        {s.sideOpen && (
          <>
            <aside className="shrink-0 bg-panel border-r border-line min-h-0" style={{ width: sideEff }}>
              {s.side === 'explorer' && <ExplorerPane />}
              {s.side === 'search' && <SearchPane />}
              {s.side === 'scm' && <ScmPane />}
              {s.side === 'issues' && <IssuesPane />}
              {s.side === 'quick' && <QuickPane />}
            </aside>
            <Splitter dir="v" onDrag={(d) => s.setSize({ sideW: clamp(useSession.getState().sideW + d, 180, 560) })} />
          </>
        )}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {!(s.panelOpen && s.panelMax) && <EditorArea />}
          {s.panelOpen && !s.panelMax && <Splitter dir="h" onDrag={(d) => s.setSize({ panelH: clamp(useSession.getState().panelH - d, 100, 620) })} />}
          <div className={s.panelMax ? 'flex-1 min-h-0' : 'shrink-0'} style={{ height: s.panelMax ? undefined : s.panelH, display: s.panelOpen ? 'block' : 'none' }}><Panel /></div>
        </div>
        {s.agentOpen && (
          <>
            <Splitter dir="v" onDrag={(d) => s.setSize({ agentW: clamp(useSession.getState().agentW - d, 300, 680) })} />
            <div className="shrink-0 min-h-0" style={{ width: agentEff }}><AgentPanel /></div>
          </>
        )}
      </div>
      <StatusBar />
      {s.palette && <CommandPalette />}
    </div>
  )
}
