import { useState } from 'react'
import { ChevronDown, ChevronRight, CircleDot, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useApp } from '../../store'
import { useSession } from '../../lib/session'
import { useChat } from '../../lib/chat'
import { solveIssue } from '../../lib/solve'
import { cleanErr } from '../../lib/api'

/** All open issues, one click to solve — pinned above the chat so it is never hidden behind a sidebar icon. */
export function IssueStrip({ root }: { root: string | null }) {
  const { repo, mode } = useApp()
  const s = useSession()
  const chat = useChat(root)
  const running = chat.phase === 'running'
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('sakai.issues.open') !== '0' } catch { return true } })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (mode !== 'github' || !repo) return null

  const toggle = () => { setOpen((v) => { try { localStorage.setItem('sakai.issues.open', v ? '0' : '1') } catch { /* storage unavailable */ } return !v }) }
  async function refresh() {
    setBusy(true); setErr('')
    try { s.set({ issues: await window.sakai.github.issues(repo!) }) } catch (e) { setErr(cleanErr(e)) } finally { setBusy(false) }
  }

  return (
    <div className="shrink-0 border-b border-line">
      <div className="h-8 px-3 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
        <button onClick={toggle} className="flex items-center gap-1 hover:text-ink">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}Issues<span className="ml-1 px-1.5 rounded-full bg-raised text-fg normal-case tracking-normal">{s.issues.length}</span></button>
        <button onClick={refresh} title="Refresh issues" className="ml-auto w-6 h-6 grid place-items-center rounded hover:bg-hover hover:text-ink"><RefreshCw size={12} className={busy ? 'animate-spin' : ''} /></button>
      </div>
      {open && (
        <div className="max-h-[210px] overflow-auto pb-1.5 px-2 space-y-1">
          {s.issues.length === 0 && <p className="px-1 py-1.5 text-[12px] text-muted">{busy ? 'Loading…' : 'No open issues. Describe your own task below.'}</p>}
          {s.issues.map((i) => {
            const active = s.solving === i.number && running
            return (
              <div key={i.number} className={`group flex items-center gap-2 rounded-lg border px-2 py-1.5 ${active ? 'border-sakai/60 bg-sakai/10' : 'border-line bg-bg hover:border-line2'}`}>
                <CircleDot size={14} className="shrink-0 text-[#3fb950]" />
                <button onClick={() => s.set({ picked: i, goal: `#${i.number} ${i.title}`, agentView: 'task' })} title={i.body ? i.body.slice(0, 300) : 'Open details'} className="flex-1 min-w-0 text-left">
                  <div className="text-[12.5px] text-ink truncate"><span className="text-muted">#{i.number}</span> {i.title.replace(/^\[[^\]]+\]\s*/, '')}</div>
                  {i.labels.length > 0 && <div className="mt-0.5 flex gap-1 overflow-hidden">{i.labels.slice(0, 3).map((l) => <span key={l} className="text-[9.5px] px-1.5 rounded border border-line text-muted">{l}</span>)}</div>}
                </button>
                <button
                  onClick={() => void solveIssue(i)} disabled={running}
                  className="shrink-0 h-7 px-2.5 rounded-md bg-sakai hover:bg-sakai-hover disabled:opacity-40 disabled:pointer-events-none text-ink text-[11.5px] font-semibold flex items-center gap-1"
                >{active ? <><Loader2 size={12} className="animate-spin" />Solving</> : <><Sparkles size={12} />Solve</>}</button>
              </div>
            )
          })}
          {err && <p className="px-1 text-[11px] text-sakai">{err}</p>}
        </div>
      )}
    </div>
  )
}
