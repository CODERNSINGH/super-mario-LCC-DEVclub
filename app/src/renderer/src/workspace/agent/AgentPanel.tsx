import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Plus, SlidersHorizontal, Square, ArrowDown, Loader2, Bug, BookOpen, Wand2, TestTube2 } from 'lucide-react'
import { useApp } from '../../store'
import { useSession } from '../../lib/session'
import { useChat, sendMessage, stopSession, reattach, type Item } from '../../lib/chat'
import { TaskForm } from './TaskForm'
import { Composer } from './Composer'
import { AiBubble, UserBubble, ToolCard, TaskCard, ErrorCard, ResultCard, PhaseRow } from './Cards'
import { Md } from './Md'
import { LearnCard } from './LearnCard'
import * as A from '../../lib/actions'
import { Mascot } from '../../ui/Mascot'

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n))

function Empty({ root }: { root: string | null }) {
  const { repo, localPath } = useApp()
  const s = useSession()
  const name = repo?.split('/')[1] ?? localPath?.split('/').pop() ?? 'this project'
  const chip = (icon: React.ReactNode, label: string, fn: () => void) => <button onClick={fn} disabled={!root} className="w-full flex items-center gap-2.5 h-9 px-3 rounded-lg border border-line bg-panel hover:border-sakai/70 hover:bg-raised text-left text-[12.5px] text-fg disabled:opacity-40"><span className="text-sakai">{icon}</span>{label}</button>
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-center fade">
      <Mascot size={76} />
      <h3 className="mt-3 text-ink text-[15px] font-semibold">How can I help with {name}?</h3>
      <p className="mt-1 text-[12px] text-muted max-w-[280px]">Ask about the code, or hand me a bug. I’ll edit, run your tests and show every step.</p>
      <div className="mt-5 w-full max-w-[300px] space-y-2">
        {chip(<Wand2 size={15} />, 'Solve an issue…', A.newTask)}
        {chip(<BookOpen size={15} />, 'Explain this repository', () => root && void sendMessage(root, 'Explain this repository: its purpose, structure and main flow.'))}
        {chip(<Bug size={15} />, 'Find likely bugs', () => root && void sendMessage(root, 'Review the code for likely bugs and list them with file and line.'))}
        {chip(<TestTube2 size={15} />, 'Run the tests', () => root && void sendMessage(root, 'Run the test suite and summarise what passes and fails.'))}
      </div>
      {s.issues.length > 0 && (
        <div className="mt-4 w-full max-w-[300px] text-left">
          <div className="text-[10.5px] uppercase tracking-wider text-faint mb-1">Open issues</div>
          {s.issues.slice(0, 3).map((i) => <button key={i.number} onClick={() => s.set({ picked: i, agentView: 'task' })} className="w-full text-left h-7 px-2 rounded hover:bg-hover text-[12px] text-muted hover:text-ink truncate"><span className="font-mono text-faint mr-1.5">#{i.number}</span>{i.title}</button>)}
        </div>
      )}
    </div>
  )
}

function Transcript({ items, phase, root }: { items: Item[]; phase: 'idle' | 'running'; root: string | null }) {
  const box = useRef<HTMLDivElement>(null)
  const [stick, setStick] = useState(true)
  const last = items[items.length - 1]
  const signal = items.length + (last && 'text' in last ? last.text.length : 0) + (last?.kind === 'ai' ? last.thinking.length : 0)

  useLayoutEffect(() => { if (stick) box.current?.scrollTo({ top: box.current.scrollHeight }) }, [signal, phase, stick])
  const onScroll = () => { const b = box.current!; setStick(b.scrollHeight - b.scrollTop - b.clientHeight < 60) }
  const lastResult = [...items].reverse().find((i) => i.kind === 'result')?.id

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={box} onScroll={onScroll} className="absolute inset-0 overflow-auto px-3.5 py-3 space-y-3">
        {items.map((it) => it.kind === 'task' ? <TaskCard key={it.id} it={it} />
          : it.kind === 'user' ? <UserBubble key={it.id} it={it} />
          : it.kind === 'ai' ? <AiBubble key={it.id} it={it} />
          : it.kind === 'tool' ? <ToolCard key={it.id} t={it} />
          : it.kind === 'phase' ? <PhaseRow key={it.id} label={it.label} />
          : it.kind === 'error' ? <ErrorCard key={it.id} text={it.text} />
          : it.kind === 'result' ? (it.id === lastResult ? <div key={it.id} className="space-y-3"><ResultCard finished={it.finished} summary={it.summary} />{it.finished && root && items.some((x) => x.kind === 'task') && <LearnCard root={root} items={items} />}</div> : <div key={it.id} className="text-[11.5px] text-muted pl-8">Turn finished.</div>)
          : <div key={it.id} className="text-[12px] text-muted pl-8"><Md text={it.text} /></div>)}
        {phase === 'running' && last?.kind !== 'ai' && <div className="flex items-center gap-2 pl-8 text-[12px] text-muted"><Loader2 size={13} className="spin text-sakai" />working…</div>}
      </div>
      {!stick && <button onClick={() => { setStick(true) }} className="absolute bottom-3 left-1/2 -translate-x-1/2 h-7 px-3 rounded-full bg-raised border border-line2 text-[11.5px] text-fg flex items-center gap-1.5 shadow-lg fade hover:border-sakai"><ArrowDown size={12} />Jump to latest</button>}
    </div>
  )
}

function WorkingBar({ root }: { root: string }) {
  const chat = useChat(root)
  const est = useSession((s) => s.estimate)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const el = chat.startedAt ? Math.max(0, Math.floor((now - chat.startedAt) / 1000)) : 0
  const left = chat.limitMin > 0 ? Math.max(0, chat.limitMin * 60 - el) : Infinity
  const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
  const total = chat.usage.inputTokens + chat.usage.outputTokens
  const cost = est?.priced && est.inputTokens + est.outputTokens > 0 ? (total / (est.inputTokens + est.outputTokens)) * est.costUsd : null
  return (
    <div className="shrink-0 mx-3 mb-1 rounded-lg border border-sakai/40 bg-sakai/10 px-3 h-9 flex items-center gap-2.5 fade">
      <span className="relative w-2 h-2"><span className="absolute inset-0 rounded-full bg-sakai animate-ping" /><span className="absolute inset-0 rounded-full bg-sakai" /></span>
      <span className="text-[12px] text-ink truncate flex-1">{chat.status || 'Sakai is working…'}</span>
      <span className={`text-[11px] font-mono whitespace-nowrap ${left < 60 ? 'text-sakai font-semibold' : 'text-fg'}`} title={chat.limitMin > 0 ? `Time limit ${chat.limitMin} min` : 'No overall time limit — stalled steps restart automatically'}>{mmss(el)}{left === Infinity ? '' : ` · ${mmss(left)} left`}</span>
      <span className="text-[11px] text-muted font-mono whitespace-nowrap">{chat.usage.steps} {chat.usage.steps === 1 ? "step" : "steps"} · {fmt(total)} tok{cost !== null ? ` · ~$${cost.toFixed(cost < 0.1 ? 3 : 2)}` : ''}</span>
      <button onClick={() => void stopSession(root)} className="h-6 px-2 rounded bg-sakai hover:bg-sakai-hover text-ink text-[11px] font-semibold flex items-center gap-1"><Square size={9} fill="currentColor" />Stop</button>
    </div>
  )
}

export function AgentPanel() {
  const root = useApp((a) => a.localPath)
  const s = useSession()
  const chat = useChat(root)
  useEffect(() => { if (root) reattach(root) }, [root])

  return (
    <aside className="h-full flex flex-col bg-panel border-l border-line min-w-0">
      <div className="h-9 shrink-0 px-3 flex items-center gap-2 border-b border-line">
        <Mascot size={20} animate={false} />
        <span className="text-[11px] uppercase tracking-wider text-fg">Sakai Agent</span>
        {chat.phase === 'running' && <span className="text-[10px] text-sakai uppercase tracking-wider">● live</span>}
        <span className="ml-auto flex items-center gap-0.5 text-muted">
          <button title="New chat" onClick={A.newChat} className="w-6 h-6 grid place-items-center rounded hover:bg-hover hover:text-ink"><Plus size={15} /></button>
          <button title="Task form (solve an issue)" onClick={() => s.set({ agentView: s.agentView === 'task' ? 'chat' : 'task' })} className={`w-6 h-6 grid place-items-center rounded hover:bg-hover hover:text-ink ${s.agentView === 'task' ? 'text-sakai' : ''}`}><SlidersHorizontal size={14} /></button>
        </span>
      </div>
      {s.agentView === 'task' ? <div className="flex-1 min-h-0"><TaskForm /></div> : (
        <>
          {chat.items.length === 0 ? <div className="flex-1 min-h-0"><Empty root={root} /></div> : <Transcript items={chat.items} phase={chat.phase} root={root} />}
          {chat.phase === 'running' && root && <WorkingBar root={root} />}
          <Composer running={chat.phase === 'running'} />
        </>
      )}
    </aside>
  )
}
