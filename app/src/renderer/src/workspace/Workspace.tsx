import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../store'
import { useSession, type Side } from '../lib/session'
import { Explorer } from '../components/Explorer'
import { FileView, DiffView } from '../components/Editors'
import { Terminal } from '../components/Terminal'
import { TaskPanel } from './TaskPanel'
import { CommandPalette } from './CommandPalette'
import { QuickPane, SettingsPane } from './SidePanes'
import { pushRecent } from '../lib/recent'
import { post } from '../lib/api'
import { useRef } from 'react'

import { cleanErr } from '../lib/api'

const ACTIVITY: { id: Side; label: string; icon: string }[] = [
  { id: 'issues', label: 'Issues', icon: '◎' },
  { id: 'explorer', label: 'Explorer', icon: '▤' },
  { id: 'changes', label: 'Changes', icon: '±' },
  { id: 'quick', label: 'Quick commands', icon: '›_' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

export function Workspace() {
  const { repo, user, llm, localPath, set } = useApp()
  const s = useSession()
  const logEnd = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    const st = useSession.getState()
    setFailed(false)
    try {
      const path = await window.sakai.repo.clone(repo!)
      set({ localPath: path })
      st.log(`✓ Ready at ${path}`)
      st.log('$ gh issue list --state open')
      const list = await window.sakai.github.issues(repo!)
      st.set({ issues: list })
      st.log(`✓ ${list.length} open issue(s) found. Pick one, or describe your own task.`)
    } catch (e) {
      st.log(`✗ ${cleanErr(e)}`)
      st.log('→ Fix it in the Terminal tab (⌘`) — you can run git commands yourself — then press "Retry clone".')
      setFailed(true)
    }
  }, [repo, set])

  useEffect(() => {
    pushRecent(repo!)
    const off = window.sakai.repo.onLog((l) => useSession.getState().log(l))
    if (!started.current) { started.current = true; void load() }
    return off
  }, [repo, load])

  useEffect(() => { logEnd.current?.scrollIntoView() }, [s.logs.length])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); useSession.getState().set({ palette: true }) }
      if ((e.metaKey || e.ctrlKey) && e.key === '`') { e.preventDefault(); useSession.getState().set({ panel: 'terminal', panelOpen: true }) }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); const p = useSession.getState(); p.set({ panelOpen: !p.panelOpen }) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  async function refreshChanges() {
    if (!localPath) return
    const { files } = await post<{ files: string[] }>('/git/changes', { root: localPath }).catch(() => ({ files: [] as string[] }))
    s.set({ changed: files })
  }
  useEffect(() => { if (s.side === 'changes') void refreshChanges() }, [s.side]) // eslint-disable-line react-hooks/exhaustive-deps

  const tabBtn = (active: boolean) => `h-full px-3 flex items-center gap-2 border-r border-line text-[12.5px] ${active ? 'bg-bg text-ink border-t-2 border-t-sakai' : 'bg-panel text-muted hover:text-fg'}`
  const activeTab = s.tabs.find((t) => t.id === s.active)!

  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="drag h-9 shrink-0 border-b border-line bg-panel flex items-center justify-center text-xs text-muted">
        Sakai — {repo}
        <button onClick={() => s.set({ palette: true })} className="no-drag absolute right-3 h-6 px-2 rounded border border-line text-[11px] hover:border-[#2c2c32]">⌘K</button>
      </div>
      <div className="flex-1 flex min-h-0">
        <nav className="w-12 shrink-0 border-r border-line bg-panel flex flex-col items-center py-1">
          {ACTIVITY.map((a) => (
            <button key={a.id} title={a.label} onClick={() => s.set({ side: a.id })} className={`w-12 h-11 grid place-items-center text-lg ${s.side === a.id ? 'text-ink border-l-2 border-sakai' : 'text-muted border-l-2 border-transparent hover:text-fg'}`}>{a.icon}</button>
          ))}
          <div className="flex-1" />
        </nav>

        <aside className="w-72 shrink-0 border-r border-line bg-panel flex flex-col min-h-0">
          <div className="px-4 h-9 shrink-0 flex items-center text-[11px] uppercase tracking-wider text-muted">{ACTIVITY.find((a) => a.id === s.side)!.label}</div>
          <div className="flex-1 overflow-auto pb-3">
            {s.side === 'issues' && (
              <>
                <button onClick={() => { s.set({ picked: null, goal: '', branch: `sakai/task-${Date.now().toString(36)}`, estimate: null }); s.openTab({ id: 'task', kind: 'task', title: 'Task' }); s.set({ active: 'task' }) }} className="w-full text-left px-4 h-8 text-sakai hover:bg-raised">+ Describe your own task</button>
                {s.issues.map((i) => (
                  <button key={i.number} onClick={() => { s.set({ picked: i, active: 'task' }) }} className={`w-full text-left px-4 py-2 border-l-2 ${s.picked?.number === i.number ? 'border-sakai bg-raised text-ink' : 'border-transparent hover:bg-raised'}`}>
                    <span className="text-muted">#{i.number}</span> {i.title}
                    {i.labels.length > 0 && <div className="mt-1 flex gap-1 flex-wrap">{i.labels.slice(0, 3).map((l) => <span key={l} className="text-[10px] px-1.5 rounded border border-line text-muted">{l}</span>)}</div>}
                  </button>
                ))}
                {!s.issues.length && <p className="px-4 py-2 text-muted text-xs">{localPath ? 'No open issues.' : failed ? 'Clone failed — see logs below.' : 'Cloning repository…'}</p>}
              </>
            )}
            {s.side === 'explorer' && <Explorer />}
            {s.side === 'quick' && <QuickPane />}
            {s.side === 'settings' && <SettingsPane />}
            {s.side === 'changes' && (
              <>
                {s.changed.map((f) => <button key={f} onClick={() => s.openTab({ id: `diff:${f}`, kind: 'diff', title: `${f.split('/').pop()} (diff)`, path: f })} className="w-full text-left px-4 h-7 font-mono text-[12px] hover:bg-raised truncate">{f}</button>)}
                {!s.changed.length && <p className="px-4 py-2 text-muted text-xs">Working tree clean.</p>}
              </>
            )}
          </div>
        </aside>

        <section className="flex-1 min-w-0 flex flex-col">
          <div className="h-9 shrink-0 flex border-b border-line bg-panel overflow-x-auto">
            {s.tabs.map((t) => (
              <div key={t.id} className={tabBtn(t.id === s.active)}>
                <button onClick={() => s.set({ active: t.id })}>{t.title}{s.dirty[t.id] ? ' ●' : ''}</button>
                {t.id !== 'task' && <button onClick={() => s.closeTab(t.id)} className="text-muted hover:text-ink">×</button>}
              </div>
            ))}
          </div>
          <div className="flex-1 min-h-0">
            {activeTab.kind === 'task' && <TaskPanel />}
            {activeTab.kind === 'file' && <FileView key={activeTab.id} path={activeTab.path!} />}
            {activeTab.kind === 'diff' && <DiffView key={activeTab.id} path={activeTab.path!} />}
          </div>
          {s.panelOpen && (
            <div className="h-56 shrink-0 border-t border-line bg-panel flex flex-col">
              <div className="h-8 px-2 flex items-center gap-1 text-[11px] uppercase tracking-wider border-b border-line shrink-0">
                {(['logs', 'terminal'] as const).map((p) => <button key={p} onClick={() => s.set({ panel: p })} className={`px-2 h-full ${s.panel === p ? 'text-ink border-b border-sakai' : 'text-muted hover:text-fg'}`}>{p}</button>)}
                {failed && <button onClick={() => { s.log('$ retry clone'); void load() }} className="ml-auto px-2 h-6 rounded bg-sakai text-ink normal-case tracking-normal">Retry clone</button>}
                <button onClick={() => s.set({ panelOpen: false })} className={`${failed ? '' : 'ml-auto'} px-2 text-muted hover:text-ink`}>×</button>
              </div>
              <div className="flex-1 min-h-0 relative">
                <div className={`absolute inset-0 overflow-auto px-4 py-2 font-mono text-[12px] ${s.panel === 'logs' ? '' : 'invisible'}`}>
                  {s.logs.map((l, i) => <div key={i} className={`whitespace-pre-wrap ${l.startsWith('✗') ? 'text-sakai' : l.startsWith('$') ? 'text-ink' : ''}`}>{l}</div>)}
                  <div ref={logEnd} />
                </div>
                <div className={`absolute inset-0 ${s.panel === 'terminal' ? '' : 'invisible'}`}><Terminal cwd={localPath} visible={s.panel === 'terminal'} /></div>
              </div>
            </div>
          )}
        </section>
      </div>
      <footer className="h-6 shrink-0 bg-sakai text-ink text-[11px] flex items-center px-3 gap-4">
        <span>⎇ {s.branch || (localPath ? 'main' : 'cloning…')}</span><span>{user?.login}</span>
        {s.phase === 'running' && <span>● running · {s.usage.steps} steps</span>}
        <span className="ml-auto">{llm?.provider} · {llm?.model}</span>
      </footer>
      {s.palette && <CommandPalette />}
    </div>
  )
}
