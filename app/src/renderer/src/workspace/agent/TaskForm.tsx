import { useEffect, useState } from 'react'
import { Coins, Clock, Cpu, Footprints, Lightbulb } from 'lucide-react'
import { useApp } from '../../store'
import { useSession, type Estimate } from '../../lib/session'
import { cleanErr, isSmallModel, post, resolveLlm } from '../../lib/api'
import { startSession } from '../../lib/chat'
import { Button } from '../../components/ui'

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n))
const inp = 'w-full px-2.5 rounded-md bg-bg border border-line focus:border-sakai outline-none text-[12.5px] text-ink placeholder:text-faint'
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="block text-[11px] text-muted mb-1">{label}</span>{children}</label>

function EstimateCard({ e, provider, model }: { e: Estimate; provider: string; model: string }) {
  const free = ['ollama', 'lmstudio'].includes(provider)
  const stat = (icon: React.ReactNode, k: string, v: string) => <div><div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted">{icon}{k}</div><div className="text-ink text-[15px] font-semibold mt-0.5">{v}</div></div>
  return (
    <div className="rounded-xl border border-line2 bg-panel p-3 fade">
      <div className="grid grid-cols-4 gap-2">
        {stat(<Coins size={10} />, 'Cost', free ? 'Free' : e.priced ? `$${e.costUsd.toFixed(e.costUsd < 0.1 ? 3 : 2)}` : 'n/a')}
        {stat(<Cpu size={10} />, 'Tokens', fmt(e.inputTokens + e.outputTokens))}
        {stat(<Clock size={10} />, 'Time', `~${e.minutes}m`)}
        {stat(<Footprints size={10} />, 'Steps', `≤${e.steps}`)}
      </div>
      <div className="mt-2 text-[11px] text-muted leading-snug">{model} · repo ≈ {fmt(e.repoTokens)} tokens · {e.complexity} · tests <span className="font-mono">{e.testCommand ?? 'not detected'}</span></div>
      <div className="mt-2.5 pt-2.5 border-t border-line">
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted mb-1.5"><Lightbulb size={10} />Optimization</div>
        <ul className="space-y-1 text-[12px] text-fg/90">{e.tips.map((t) => <li key={t} className="flex gap-1.5"><span className="text-sakai">·</span>{t}</li>)}</ul>
      </div>
      <p className="mt-2 text-[10.5px] text-faint">Approximate list prices; real usage is shown live.</p>
    </div>
  )
}

export function TaskForm() {
  const { localPath, llm, mode } = useApp()
  const s = useSession()
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<'' | 'estimate' | 'start'>('')

  useEffect(() => {
    if (!s.picked) return
    s.set({ goal: `#${s.picked.number} ${s.picked.title}`, branch: `sakai/issue-${s.picked.number}-${slug(s.picked.title)}`, estimate: null })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.picked?.number])
  useEffect(() => {
    if (localPath && !s.testCommand) void post<{ command: string | null }>('/tests/detect', { root: localPath }).then((r) => r.command && s.set({ testCommand: r.command })).catch(() => undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localPath])

  const issueText = () => `${s.goal}\n\n${s.picked?.body ?? ''}\n\n${s.notes}`
  const ready = !!localPath && s.goal.trim().length > 0

  async function estimate() {
    setErr(''); setBusy('estimate')
    try {
      const cfg = await resolveLlm()
      const est = await post<Estimate>('/estimate', { root: localPath, issueText: issueText(), provider: llm!.provider, model: llm!.model, llm: cfg, withTips: true })
      s.set({ estimate: est, stepLimit: Math.min(100, Math.max(15, Math.round(est.steps * 1.5))), testCommand: s.testCommand || est.testCommand || '' })
    } catch (e) { setErr(cleanErr(e)) } finally { setBusy('') }
  }

  async function solve() {
    setErr(''); setBusy('start')
    try {
      const branch = s.branch || `sakai/task-${Date.now().toString(36)}`
      await post('/git/branch', { root: localPath, name: branch }).catch(() => undefined)
      s.set({ branch, problems: [], agentView: 'chat', debug: [] })
      s.log(`$ sakai solve — ${llm!.provider}/${llm!.model} on ${branch}`)
      await startSession(localPath!, 'solve', { issue: { number: s.picked?.number, title: s.goal, body: s.picked?.body ?? '' }, notes: s.notes, testCommand: s.testCommand || undefined, maxSteps: s.stepLimit, timeLimitMin: s.timeLimitMin })
    } catch (e) { setErr(cleanErr(e)); s.set({ agentView: 'task' }) } finally { setBusy('') }
  }

  return (
    <div className="h-full overflow-auto px-4 py-4 space-y-3.5">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{s.picked ? `Solve #${s.picked.number}` : 'New task'}</h2>
        <p className="text-[12px] text-muted mt-0.5">{mode === 'github' && s.issues.length ? 'Pick an issue or describe your own task.' : 'Describe the bug or feature. Sakai will fix it and run your tests.'}</p>
      </div>
      {mode === 'github' && s.issues.length > 0 && (
        <Field label="GitHub issue">
          <select value={s.picked?.number ?? ''} onChange={(e) => { const i = s.issues.find((x) => x.number === Number(e.target.value)) ?? null; s.set(i ? { picked: i } : { picked: null, goal: '', estimate: null }) }} className={`${inp} h-8`}>
            <option value="">Custom task…</option>
            {s.issues.map((i) => <option key={i.number} value={i.number}>#{i.number} {i.title}</option>)}
          </select>
        </Field>
      )}
      <Field label="What should Sakai solve?"><textarea rows={3} value={s.goal} onChange={(e) => s.set({ goal: e.target.value })} className={`${inp} py-2 resize-none`} placeholder="e.g. subtract() returns the wrong sign" /></Field>
      {s.picked?.body && <details className="text-[12px]"><summary className="cursor-pointer text-muted hover:text-fg">Issue description</summary><pre className="mt-2 whitespace-pre-wrap font-sans leading-relaxed text-fg/90 selectable max-h-48 overflow-auto">{s.picked.body}</pre></details>}
      <Field label="Extra guidance (files, constraints, expected behaviour)"><textarea rows={2} value={s.notes} onChange={(e) => s.set({ notes: e.target.value })} className={`${inp} py-2 resize-none`} /></Field>
      <div className="grid grid-cols-[1fr_74px_74px] gap-2.5">
        <Field label="Test command"><input value={s.testCommand} onChange={(e) => s.set({ testCommand: e.target.value })} className={`${inp} h-8 font-mono`} placeholder="npm test" /></Field>
        <Field label="Step limit"><input type="number" min={5} max={100} value={s.stepLimit} onChange={(e) => s.set({ stepLimit: Math.max(5, Math.min(100, Number(e.target.value) || 30)) })} className={`${inp} h-8`} /></Field>
        <Field label="Time limit (min)"><input type="number" min={3} max={15} value={s.timeLimitMin} onChange={(e) => s.set({ timeLimitMin: Math.max(3, Math.min(15, Number(e.target.value) || 8)) })} className={`${inp} h-8`} /></Field>
      </div>
      <Field label="Branch"><input value={s.branch} onChange={(e) => s.set({ branch: e.target.value })} className={`${inp} h-8 font-mono`} placeholder="sakai/fix" /></Field>
      <p className="text-[10.5px] text-faint leading-snug">A step is one model call; the step limit is a cost safety cap. Typical fixes take 10–25. The time limit (3–15 min, default 8) is a hard wall-clock stop; your changes are kept.</p>
      {llm && isSmallModel(llm.model) && <p className="text-[12px] text-sakai border border-sakai/40 bg-sakai/10 rounded-md px-3 py-2">{llm.model} is too small to drive an agent reliably. Use a 7B+ coder model or a hosted model.</p>}
      {s.estimate && <EstimateCard e={s.estimate} provider={llm!.provider} model={llm!.model} />}
      {err && <p className="text-sakai text-[12px] whitespace-pre-wrap">{err}</p>}
      <div className="flex gap-2 pt-1">
        <Button variant="ghost" className="flex-1 h-9" disabled={!ready || busy !== ''} onClick={estimate}>{busy === 'estimate' ? 'Estimating…' : 'Estimate cost & time'}</Button>
        <Button className="flex-1 h-9" disabled={!ready || busy !== ''} onClick={solve}>{busy === 'start' ? 'Starting…' : 'Solve'}</Button>
      </div>
      <button onClick={() => s.set({ agentView: 'chat' })} className="block mx-auto text-[12px] text-muted hover:text-ink underline underline-offset-4">Back to chat</button>
    </div>
  )
}
