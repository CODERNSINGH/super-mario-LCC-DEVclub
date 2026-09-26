import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, RefreshCw, X, CaseSensitive, Regex, Undo2, Check, Plus, FoldVertical, Sparkles, Play } from 'lucide-react'
import { useApp } from '../store'
import { useSession, type Issue } from '../lib/session'
import { post } from '../lib/api'
import { FileIcon } from '../ui/icons'
import { searchText, type Hit, type FNode, invalidateFiles } from '../lib/files'
import { addQuick, removeQuick, runInTerminal, useQuick } from '../lib/quick'
import * as A from '../lib/actions'
import { revealLine } from '../lib/monaco'
import { Button } from '../components/ui'

function Section({ title, children, actions, defaultOpen = true, grow = false }: { title: string; children: ReactNode; actions?: ReactNode; defaultOpen?: boolean; grow?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`flex flex-col min-h-0 ${open && grow ? 'flex-1' : ''}`}>
      <div className="group h-[22px] shrink-0 flex items-center pr-1 hover:bg-hover cursor-default" onClick={() => setOpen(!open)}>
        <span className="w-5 grid place-items-center text-muted">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
        <span className="text-[11px] font-bold tracking-wide text-fg/90 uppercase flex-1 truncate">{title}</span>
        <span className="opacity-0 group-hover:opacity-100 flex" onClick={(e) => e.stopPropagation()}>{actions}</span>
      </div>
      {open && <div className={`${grow ? 'flex-1' : ''} min-h-0 overflow-auto`}>{children}</div>}
    </div>
  )
}
const IconBtn = ({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) => <button title={title} onClick={onClick} className="w-5 h-5 grid place-items-center rounded text-muted hover:text-ink hover:bg-line2">{children}</button>
const PaneTitle = ({ children, right }: { children: ReactNode; right?: ReactNode }) => <div className="h-9 shrink-0 px-4 flex items-center text-[11px] tracking-wider uppercase text-muted">{children}<span className="ml-auto flex">{right}</span></div>

/* ───────────────────────── Explorer ───────────────────────── */

function Tree({ path, depth, version }: { path: string; depth: number; version: number }) {
  const root = useApp((s) => s.localPath)!
  const [nodes, setNodes] = useState<FNode[]>([])
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const active = useSession((s) => s.active)
  const changed = useSession((s) => s.changed)
  useEffect(() => { void post<FNode[]>('/fs/list', { root, path }).then(setNodes).catch(() => setNodes([])) }, [root, path, version])
  return (
    <>
      {nodes.map((n) => {
        const mod = changed.includes(n.path) || (n.dir && changed.some((c) => c.startsWith(n.path + '/')))
        return (
          <div key={n.path}>
            <button onClick={() => (n.dir ? setOpen((o) => ({ ...o, [n.path]: !o[n.path] })) : A.openFile(n.path))} style={{ paddingLeft: 6 + depth * 12 }}
              className={`row w-full text-left ${active === `file:${n.path}` ? 'active' : ''}`}>
              <span className="w-3.5 grid place-items-center text-muted">{n.dir ? (open[n.path] ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}</span>
              <FileIcon name={n.name} dir={n.dir} open={open[n.path]} />
              <span className={`truncate text-[13px] ${mod ? 'text-sakai' : ''}`}>{n.name}</span>
              {!n.dir && changed.includes(n.path) && <span className="ml-auto text-[11px] text-sakai font-semibold">M</span>}
              {n.dir && mod && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-sakai" />}
            </button>
            {n.dir && open[n.path] && <Tree path={n.path} depth={depth + 1} version={version} />}
          </div>
        )
      })}
    </>
  )
}

function Outline() {
  const root = useApp((s) => s.localPath)!
  const tab = useSession((s) => s.tabs.find((t) => t.id === s.active))
  const [syms, setSyms] = useState<{ name: string; line: number; kind: string }[]>([])
  useEffect(() => {
    if (tab?.kind !== 'file' || !tab.path) return setSyms([])
    void post<{ content: string }>('/fs/read', { root, path: tab.path }).then(({ content }) => {
      const out: { name: string; line: number; kind: string }[] = []
      content.split('\n').forEach((l, i) => {
        const m = l.match(/^\s*(?:export\s+)?(?:async\s+)?(?:function\*?\s+([\w$]+)|class\s+([\w$]+)|def\s+(\w+)|func\s+(\w+)|(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>)/)
        const name = m && (m[1] || m[2] || m[3] || m[4] || m[5])
        if (name) out.push({ name, line: i + 1, kind: m![2] ? 'class' : 'fn' })
        else { const mm = l.match(/^\s{2}(?:async\s+)?([\w$]+)\s*\([^)]*\)\s*\{/); if (mm && !/^(if|for|while|switch|catch)$/.test(mm[1])) out.push({ name: mm[1], line: i + 1, kind: 'fn' }) }
      })
      setSyms(out.slice(0, 200))
    }).catch(() => setSyms([]))
  }, [root, tab?.id, tab?.kind, tab?.path])
  if (!syms.length) return <p className="px-6 py-1 text-[12px] text-faint">{tab?.kind === 'file' ? 'No symbols found.' : 'The active editor cannot provide outline information.'}</p>
  return <>{syms.map((y) => <button key={y.name + y.line} onClick={() => revealLine(tab!.path!, y.line)} className="row w-full text-left pl-6"><span className="text-[10px] text-muted font-mono w-4">{y.kind === 'class' ? 'C' : 'ƒ'}</span><span className="truncate text-[12.5px]">{y.name}</span><span className="ml-auto text-[11px] text-faint">{y.line}</span></button>)}</>
}

export function ExplorerPane() {
  const { repo, localPath } = useApp()
  const s = useSession()
  const [version, setVersion] = useState(0)
  const refresh = () => { if (localPath) invalidateFiles(localPath); setVersion((v) => v + 1) }
  const files = s.tabs.filter((t) => t.kind === 'file' || t.kind === 'diff')
  const name = (repo?.split('/')[1] ?? localPath?.split('/').pop() ?? 'workspace').toUpperCase()
  return (
    <div className="h-full flex flex-col min-h-0">
      <PaneTitle>Explorer</PaneTitle>
      {!localPath ? (
        <div className="px-4 text-[12.5px] text-muted leading-relaxed">
          {s.cloneFailed ? <>The repository could not be opened.<Button className="mt-3 w-full" onClick={() => window.dispatchEvent(new Event('sakai:retry'))}>Retry clone</Button></> : repo ? 'Cloning repository…' : 'You have not opened a folder yet.'}
          {!repo && <Button className="mt-3 w-full" onClick={() => void A.pickAndOpenFolder()}>Open Folder</Button>}
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {files.length > 0 && (
            <Section title={`Open Editors`} defaultOpen={false}>
              {files.map((t) => (
                <div key={t.id} className={`row group ${s.active === t.id ? 'active' : ''}`} onClick={() => s.set({ active: t.id })}>
                  <span className="w-3.5" /><FileIcon name={t.title} /><span className="truncate flex-1 text-[13px]">{t.title}</span>
                  {s.dirty[t.id] ? <span className="w-2 h-2 rounded-full bg-fg" /> : <button className="opacity-0 group-hover:opacity-100 text-muted hover:text-ink" onClick={(e) => { e.stopPropagation(); s.closeTab(t.id) }}><X size={13} /></button>}
                </div>
              ))}
            </Section>
          )}
          <Section grow title={name} actions={<><IconBtn title="Refresh Explorer" onClick={refresh}><RefreshCw size={12} /></IconBtn><IconBtn title="Collapse Folders" onClick={() => setVersion((v) => v + 1)}><FoldVertical size={12} /></IconBtn></>}>
            <Tree path="" depth={0} version={version} />
          </Section>
          <Section title="Outline" defaultOpen={false}><Outline /></Section>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── Search ───────────────────────── */

export function SearchPane() {
  const root = useApp((s) => s.localPath)
  const [q, setQ] = useState('')
  const [cs, setCs] = useState(false)
  const [re, setRe] = useState(false)
  const [hits, setHits] = useState<Hit[]>([])
  const [busy, setBusy] = useState(false)
  const token = useRef({ cancelled: false })

  useEffect(() => {
    token.current.cancelled = true
    if (!root || q.trim().length < 2) { setHits([]); setBusy(false); return }
    const t = { cancelled: false }; token.current = t
    setHits([]); setBusy(true)
    const id = setTimeout(() => { void searchText(root, q, { caseSensitive: cs, regex: re }, (h) => { if (!t.cancelled) setHits((x) => [...x, h]) }, t).then(() => { if (!t.cancelled) setBusy(false) }) }, 250)
    return () => { clearTimeout(id); t.cancelled = true }
  }, [q, cs, re, root])

  const groups = hits.reduce<Record<string, Hit[]>>((m, h) => { (m[h.path] ??= []).push(h); return m }, {})
  const tog = (on: boolean, fn: () => void, icon: ReactNode, title: string) => <button title={title} onClick={fn} className={`w-5 h-5 grid place-items-center rounded ${on ? 'bg-sakai/30 text-ink' : 'text-muted hover:text-ink'}`}>{icon}</button>
  return (
    <div className="h-full flex flex-col min-h-0">
      <PaneTitle>Search</PaneTitle>
      <div className="px-3 pb-2">
        <div className="flex items-center h-7 px-2 rounded bg-bg border border-line focus-within:border-sakai gap-1">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" spellCheck={false} className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px] text-ink placeholder:text-faint" />
          {tog(cs, () => setCs(!cs), <CaseSensitive size={14} />, 'Match Case')}{tog(re, () => setRe(!re), <Regex size={14} />, 'Use Regular Expression')}
        </div>
        <div className="mt-1.5 text-[11.5px] text-muted h-4">{busy ? 'Searching…' : q.trim().length >= 2 ? `${hits.length}${hits.length >= 500 ? '+' : ''} results in ${Object.keys(groups).length} files` : ''}</div>
      </div>
      <div className="flex-1 overflow-auto">
        {Object.entries(groups).map(([path, hs]) => (
          <Section key={path} title={`${path.split('/').pop()}  ${hs.length}`}>
            {hs.map((h, i) => <button key={i} onClick={() => { A.openFile(h.path); setTimeout(() => revealLine(h.path, h.line), 250) }} className="row w-full text-left pl-6"><span className="truncate text-[12.5px] text-fg/90">{h.text}</span><span className="ml-auto text-[11px] text-faint">{h.line}</span></button>)}
          </Section>
        ))}
        {!root && <p className="px-4 text-[12.5px] text-muted">Open a folder to search.</p>}
      </div>
    </div>
  )
}

/* ───────────────────────── Source Control ───────────────────────── */

export function ScmPane() {
  const { localPath, user, mode } = useApp()
  const s = useSession()
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const refresh = useCallback(async () => {
    if (!localPath) return
    const { files } = await post<{ files: string[] }>('/git/changes', { root: localPath }).catch(() => ({ files: [] as string[] }))
    useSession.getState().set({ changed: files })
  }, [localPath])
  useEffect(() => { void refresh() }, [refresh])

  async function commit() {
    setBusy(true); setNote('')
    try {
      const author = user ? { name: user.name || user.login, email: `${user.id ? user.id + '+' : ''}${user.login}@users.noreply.github.com` } : undefined
      const r = await post<{ sha: string; branch: string }>('/git/commit', { root: localPath, branch: s.branch || undefined, message: msg.trim(), author })
      setNote(`Committed ${r.sha.slice(0, 7)} on ${r.branch}`); setMsg(''); await refresh(); s.log(`✓ Committed ${r.sha.slice(0, 7)} on ${r.branch}`)
    } catch (e) { setNote((e as Error).message) } finally { setBusy(false) }
  }
  const discard = () => s.set({ modal: { title: 'Discard all changes?', body: 'This restores every modified file to its last commit and removes untracked files. It cannot be undone.', confirm: 'Discard', onConfirm: () => void post('/git/reset', { root: localPath }).then(refresh) } })

  return (
    <div className="h-full flex flex-col min-h-0">
      <PaneTitle right={<><IconBtn title="Refresh" onClick={() => void refresh()}><RefreshCw size={12} /></IconBtn></>}>Source Control</PaneTitle>
      <div className="px-3 pb-2 space-y-2">
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && msg.trim() && s.changed.length) void commit() }} rows={2} placeholder={`Message (⌘Enter to commit on “${s.branch || 'current branch'}”)`} className="w-full px-2 py-1.5 rounded bg-bg border border-line focus:border-sakai outline-none text-[12.5px] text-ink placeholder:text-faint resize-none" />
        <Button className="w-full h-7 text-[12px]" disabled={busy || !msg.trim() || !s.changed.length} onClick={commit}><Check size={13} className="inline -mt-0.5 mr-1" />Commit{mode === 'local' ? '' : ' (local)'}</Button>
        {note && <p className="text-[11.5px] text-muted">{note}</p>}
      </div>
      <Section title={`Changes  ${s.changed.length}`} grow actions={<IconBtn title="Discard All Changes" onClick={discard}><Undo2 size={12} /></IconBtn>}>
        {s.changed.map((f) => (
          <button key={f} onClick={() => A.openDiff(f)} className="row w-full text-left pl-4"><FileIcon name={f.split('/').pop()!} /><span className="truncate text-[13px]">{f.split('/').pop()}</span><span className="truncate text-[11.5px] text-faint">{f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : ''}</span><span className="ml-auto text-[11px] font-semibold text-sakai">M</span></button>
        ))}
        {!s.changed.length && <p className="px-4 py-1 text-[12.5px] text-muted">No changes detected.</p>}
      </Section>
    </div>
  )
}

/* ───────────────────────── Issues (GitHub mode) ───────────────────────── */

export function IssuesPane() {
  const s = useSession()
  const [q, setQ] = useState('')
  const list = s.issues.filter((i) => `${i.number} ${i.title}`.toLowerCase().includes(q.toLowerCase()))
  const pick = (i: Issue) => s.set({ picked: i, agentOpen: true, agentView: 'task' })
  return (
    <div className="h-full flex flex-col min-h-0">
      <PaneTitle>GitHub Issues</PaneTitle>
      <div className="px-3 pb-2"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter issues" className="w-full h-7 px-2 rounded bg-bg border border-line focus:border-sakai outline-none text-[12.5px] text-ink placeholder:text-faint" /></div>
      <div className="flex-1 overflow-auto">
        {list.map((i) => (
          <div key={i.number} onClick={() => pick(i)} className={`group px-3 py-2 border-l-2 cursor-default ${s.picked?.number === i.number ? 'border-sakai bg-sakai/10' : 'border-transparent hover:bg-hover'}`}>
            <div className="flex gap-2"><span className="text-muted font-mono text-[12px]">#{i.number}</span><span className="text-[13px] text-ink leading-snug flex-1">{i.title}</span></div>
            <div className="mt-1.5 flex items-center gap-1 flex-wrap">
              {i.labels.slice(0, 3).map((l) => <span key={l} className="text-[10px] px-1.5 rounded-full border border-line2 text-muted">{l}</span>)}
              <button onClick={(e) => { e.stopPropagation(); pick(i) }} className="ml-auto opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] text-sakai hover:text-sakai-hover"><Sparkles size={11} />Solve with Sakai</button>
            </div>
          </div>
        ))}
        {!list.length && <p className="px-4 py-1 text-[12.5px] text-muted">{s.issues.length ? 'No matching issues.' : s.ready ? 'No open issues.' : 'Loading issues…'}</p>}
      </div>
    </div>
  )
}

/* ───────────────────────── Quick commands ───────────────────────── */

export function QuickPane() {
  const cmds = useQuick()
  const s = useSession()
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const inp = 'w-full h-7 px-2 rounded bg-bg border border-line focus:border-sakai outline-none text-[12px] text-ink placeholder:text-faint'
  const item = (id: string, title: string, cmd: string, removable: boolean) => (
    <div key={id} className="group flex items-stretch gap-1 px-3 mb-1.5">
      <button onClick={() => runInTerminal(s.set, s.termId, cmd)} className="flex-1 min-w-0 text-left px-2.5 py-1.5 rounded-md border border-line hover:border-sakai/70 flex items-center gap-2">
        <Play size={12} className="text-sakai shrink-0" /><span className="min-w-0"><span className="block text-ink text-[12.5px]">{title}</span><span className="block font-mono text-[11px] text-muted truncate">{cmd}</span></span>
      </button>
      {removable && <button onClick={() => removeQuick(id)} className="px-1 text-muted hover:text-sakai" title="Remove"><X size={13} /></button>}
    </div>
  )
  return (
    <div className="h-full flex flex-col min-h-0">
      <PaneTitle>Quick Commands</PaneTitle>
      <p className="px-4 pb-2 text-[12px] text-muted leading-relaxed">One-click commands that run in the integrated terminal. Add your own — they are saved on this Mac.</p>
      <div className="flex-1 overflow-auto pb-3">
        {s.testCommand && item('tests', 'Run tests', s.testCommand, false)}
        {cmds.map((c) => item(c.id, c.name, c.command, !c.builtin))}
        <div className="mx-3 mt-3 pt-3 border-t border-line space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted">Add command</div>
          <input className={inp} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={`${inp} font-mono`} placeholder="npm run lint" value={command} onChange={(e) => setCommand(e.target.value)} />
          <Button variant="ghost" className="w-full h-7 text-[12px]" disabled={!name.trim() || !command.trim()} onClick={() => { addQuick(name.trim(), command.trim()); setName(''); setCommand('') }}><Plus size={12} className="inline -mt-0.5 mr-1" />Add</Button>
        </div>
      </div>
    </div>
  )
}
