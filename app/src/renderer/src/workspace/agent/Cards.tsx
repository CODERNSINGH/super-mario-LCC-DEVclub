import { useEffect, useState } from 'react'
import { Search, FileText, Pencil, FilePlus, Undo2, Terminal, FlaskConical, Package, CheckCheck, ChevronRight, Loader2, Brain, GitPullRequest, GitCommitHorizontal, Trash2, ExternalLink } from 'lucide-react'
import { useApp } from '../../store'
import { useSession } from '../../lib/session'
import { post } from '../../lib/api'
import type { Item } from '../../lib/chat'
import { FileIcon } from '../../ui/icons'
import { Button } from '../../components/ui'
import * as A from '../../lib/actions'
import { Md } from './Md'
import logo from '../../assets/logo.png'

type Tool = Extract<Item, { kind: 'tool' }>
const isTestCmd = (c: string) => /\b(test|jest|vitest|pytest|cargo test|go test|mvn|gradle|rspec)\b/.test(c)
const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '')

function describe(t: Tool) {
  const a = t.call.args
  switch (t.call.tool) {
    case 'search': return { icon: Search, verb: 'Searched', detail: `“${a.pattern}”${a.path ? ` in ${a.path}` : ''}` }
    case 'read_file': return { icon: FileText, verb: 'Read', detail: `${a.path}${a.start ? `:${a.start}-${a.end ?? ''}` : ''}`, path: a.path }
    case 'replace': return { icon: Pencil, verb: 'Edited', detail: a.path, path: a.path }
    case 'write_file': return { icon: FilePlus, verb: 'Created', detail: a.path, path: a.path }
    case 'revert': return { icon: Undo2, verb: 'Reverted', detail: a.path, path: a.path }
    case 'setup': return { icon: Package, verb: 'Installed dependencies', detail: '' }
    case 'baseline': return { icon: FlaskConical, verb: 'Baseline tests', detail: a.command }
    case 'finish': return { icon: CheckCheck, verb: 'Finished', detail: '' }
    default: return isTestCmd(a.command ?? '') ? { icon: FlaskConical, verb: 'Ran tests', detail: a.command } : { icon: Terminal, verb: 'Ran', detail: a.command ?? '' }
  }
}

function Chip({ ok, children }: { ok: boolean; children: string }) {
  return <span className={`ml-auto shrink-0 px-1.5 h-[16px] rounded text-[10px] font-semibold flex items-center ${ok ? 'bg-white text-black' : 'bg-sakai text-ink'}`}>{children}</span>
}

export function DiffLines({ edit }: { edit: { old: string; new: string } }) {
  const del = edit.old.split('\n').slice(0, 14), add = edit.new.split('\n').slice(0, 14)
  return (
    <pre className="font-mono text-[11.5px] leading-[17px] overflow-x-auto border-t border-line">
      {del.map((l, i) => <div key={`d${i}`} className="px-3 bg-sakai/15 text-fg whitespace-pre"><span className="text-sakai select-none mr-2">−</span>{l}</div>)}
      {add.map((l, i) => <div key={`a${i}`} className="px-3 bg-white/[.07] text-fg whitespace-pre"><span className="text-white select-none mr-2">+</span>{l}</div>)}
    </pre>
  )
}

export function ToolCard({ t }: { t: Tool }) {
  const [open, setOpen] = useState(false)
  const d = describe(t)
  const out = strip(t.out ?? '')
  const test = d.verb === 'Ran tests' || d.verb === 'Baseline tests'
  const pass = /ALL PASS/.test(out) || (test && /^exit 0/.test(out))
  const fail = /FAILING \(exit/.test(out) || (test && /^exit [1-9]/.test(out))
  const edit = t.edit ?? (t.call.tool === 'replace' && t.call.args.old !== undefined ? { path: t.call.args.path, old: t.call.args.old, new: t.call.args.new ?? '' } : undefined)
  const autoTest = /auto-ran the tests/.test(out)
  return (
    <div className="rounded-lg border border-line bg-panel overflow-hidden fade">
      <button onClick={() => setOpen(!open)} className="w-full h-8 px-2.5 flex items-center gap-2 text-left hover:bg-hover">
        {t.running ? <Loader2 size={13} className="spin text-sakai shrink-0" /> : <d.icon size={13} className="text-muted shrink-0" />}
        <span className="text-[12px] text-muted shrink-0">{d.verb}</span>
        <span className="text-[12px] text-ink truncate font-mono">{d.detail}</span>
        {autoTest ? <Chip ok={/ALL PASS/.test(out)}>{/ALL PASS/.test(out) ? 'TESTS PASS' : 'TESTS FAIL'}</Chip> : pass ? <Chip ok>PASS</Chip> : fail ? <Chip ok={false}>FAIL</Chip> : null}
        <ChevronRight size={12} className={`shrink-0 text-faint transition-transform ${open ? 'rotate-90' : ''} ${pass || fail || autoTest ? '' : 'ml-auto'}`} />
      </button>
      {edit && <DiffLines edit={edit} />}
      {open && (
        <div className="border-t border-line">
          {d.path && <button onClick={() => A.openFile(d.path!)} className="w-full text-left px-3 h-6 text-[11.5px] text-sakai hover:underline flex items-center gap-1"><ExternalLink size={10} />Open {d.path}</button>}
          {out && <pre className="max-h-52 overflow-auto px-3 py-2 font-mono text-[11px] leading-[16px] text-fg/80 whitespace-pre-wrap selectable">{out.slice(0, 4000)}</pre>}
        </div>
      )}
    </div>
  )
}

export function Thinking({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(streaming)
  useEffect(() => { if (!streaming) setOpen(false) }, [streaming])
  return (
    <div className="rounded-lg border border-line/70 bg-bg/60">
      <button onClick={() => setOpen(!open)} className="w-full h-7 px-2.5 flex items-center gap-2 text-[12px] text-muted hover:text-fg">
        <Brain size={12} className={streaming ? 'text-sakai' : ''} />{streaming ? 'Thinking…' : 'Thought process'}<ChevronRight size={12} className={`ml-auto transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="px-3 pb-2 text-[12px] leading-relaxed text-muted whitespace-pre-wrap max-h-48 overflow-auto selectable">{text}</div>}
    </div>
  )
}

export function AiBubble({ it }: { it: Extract<Item, { kind: 'ai' }> }) {
  return (
    <div className="flex gap-2.5 fade">
      <img src={logo} width={22} height={22} alt="" className="shrink-0 mt-0.5 self-start object-contain" style={{ width: 22, height: 22 }} />
      <div className="min-w-0 flex-1 space-y-2">
        {it.thinking && <Thinking text={it.thinking} streaming={it.streaming && !it.text} />}
        {(it.text || it.streaming) && <div className="relative"><Md text={it.text} />{it.streaming && <span className="inline-block w-[7px] h-[14px] bg-sakai align-[-2px] ml-0.5 animate-pulse" />}</div>}
      </div>
    </div>
  )
}

export function UserBubble({ it }: { it: Extract<Item, { kind: 'user' }> }) {
  return (
    <div className="flex justify-end fade">
      <div className={`max-w-[88%] rounded-xl rounded-tr-sm px-3 py-2 bg-raised border border-line2 text-[13px] text-ink whitespace-pre-wrap selectable ${it.pending ? 'opacity-60' : ''}`}>
        {it.text}{it.pending && <div className="text-[10px] text-muted mt-1">queued — sent before the next step</div>}
      </div>
    </div>
  )
}

export function TaskCard({ it }: { it: Extract<Item, { kind: 'task' }> }) {
  return (
    <div className="rounded-lg border border-sakai/40 bg-sakai/10 px-3 py-2 fade">
      <div className="text-[10.5px] uppercase tracking-wider text-sakai">Solving{it.number ? ` #${it.number}` : ''}</div>
      <div className="text-[13px] text-ink mt-0.5">{it.title}</div>
    </div>
  )
}

export function ErrorCard({ text }: { text: string }) {
  return <div className="rounded-lg border border-sakai/50 bg-sakai/10 px-3 py-2 text-[12.5px] text-fg whitespace-pre-wrap fade selectable">{text}</div>
}

/** Shown after each finished turn: changed files + Create PR / Commit locally / Discard. */
export function ResultCard({ finished, summary }: { finished: boolean; summary: string }) {
  const { repo, localPath, mode, llm, user } = useApp()
  const s = useSession()
  const [files, setFiles] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [pr, setPr] = useState<{ url: string; number: number } | null>(null)

  useEffect(() => { void post<{ files: string[] }>('/git/changes', { root: localPath }).then((r) => { setFiles(r.files); useSession.getState().set({ changed: r.files }) }).catch(() => undefined) }, [localPath])
  const title = s.picked ? `Fix #${s.picked.number}: ${s.picked.title}` : (s.goal || summary).slice(0, 70)
  const author = user ? { name: user.name || user.login, email: `${user.id ? user.id + '+' : ''}${user.login}@users.noreply.github.com` } : undefined

  async function createPr() {
    setBusy(true); setMsg('')
    try {
      const token = await window.sakai.github.token()
      const body = `${summary}\n\n${s.picked ? `Closes #${s.picked.number}\n\n` : ''}---\nResolved autonomously by Sakai (${llm?.provider}/${llm?.model}).`
      const r = await post<{ url: string; number: number }>('/git/pr', { root: localPath, repo, token, branch: s.branch || `sakai/${Date.now()}`, title, body, author })
      setPr(r); s.log(`✓ Pull request #${r.number} opened: ${r.url}`)
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  async function commitLocal() {
    setBusy(true); setMsg('')
    try {
      const r = await post<{ sha: string; branch: string }>('/git/commit', { root: localPath, branch: s.branch || undefined, message: title, author })
      setMsg(`Committed ${r.sha.slice(0, 7)} on ${r.branch}`); setFiles([]); s.set({ changed: [] }); s.log(`✓ Committed ${r.sha.slice(0, 7)} on ${r.branch}`)
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  const discard = () => s.set({ modal: { title: 'Discard Sakai’s changes?', body: 'Every modified file is restored to its last commit and new files are removed.', confirm: 'Discard', onConfirm: () => void post('/git/reset', { root: localPath }).then(() => { setFiles([]); s.set({ changed: [] }); s.log('✓ Discarded working tree changes') }) } })

  return (
    <div className="rounded-xl border border-line2 bg-panel overflow-hidden fade">
      <div className={`px-3 h-8 flex items-center gap-2 text-[12px] border-b border-line ${finished ? 'text-ink' : 'text-sakai'}`}><span className={`w-2 h-2 rounded-full ${finished ? 'bg-white' : 'bg-sakai'}`} />{finished ? 'Verified fix ready' : 'Stopped before finishing'}</div>
      <div className="p-3 space-y-3">
        {summary && <Md text={summary} />}
        {files.length > 0 && <div className="flex flex-wrap gap-1.5">{files.map((f) => <button key={f} onClick={() => A.openDiff(f)} className="h-6 pl-1.5 pr-2 rounded border border-line2 hover:border-sakai flex items-center gap-1.5 text-[11.5px] font-mono text-fg"><FileIcon name={f.split('/').pop()!} size={12} />{f}</button>)}</div>}
        {files.length === 0 && !msg && <p className="text-[12px] text-muted">No files were changed.</p>}
        <div className="flex flex-wrap gap-2 items-center">
          {pr ? <a href={pr.url} target="_blank" className="text-sakai text-[12.5px] underline underline-offset-2">Open pull request #{pr.number}</a>
            : mode === 'github' ? <Button className="h-8 text-[12px]" disabled={busy || !files.length} onClick={createPr}><GitPullRequest size={13} className="inline -mt-0.5 mr-1.5" />{busy ? 'Opening PR…' : 'Create pull request'}</Button>
            : <Button className="h-8 text-[12px]" disabled={busy || !files.length} onClick={commitLocal}><GitCommitHorizontal size={13} className="inline -mt-0.5 mr-1.5" />{busy ? 'Committing…' : 'Commit locally'}</Button>}
          {mode === 'github' && !pr && <Button variant="ghost" className="h-8 text-[12px]" disabled={busy || !files.length} onClick={commitLocal}>Commit only</Button>}
          <Button variant="quiet" className="h-8 text-[12px]" disabled={!files.length} onClick={discard}><Trash2 size={13} className="inline -mt-0.5 mr-1" />Discard</Button>
        </div>
        {msg && <p className="text-[12px] text-muted whitespace-pre-wrap">{msg}</p>}
      </div>
    </div>
  )
}
