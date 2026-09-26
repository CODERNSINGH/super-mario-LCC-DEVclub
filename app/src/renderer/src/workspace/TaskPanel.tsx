import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import { useSession, type Estimate } from '../lib/session'
import { cleanErr, isSmallModel, post, resolveLlm, streamRun } from '../lib/api'
import { Button, Card } from '../components/ui'

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n))

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs text-muted mb-1.5">{label}</span>{children}</label>
}
const input = 'w-full px-3 rounded-md bg-panel border border-line focus:border-sakai outline-none text-[13px] text-ink placeholder:text-muted'

function EstimateCard({ e, provider, model }: { e: Estimate; provider: string; model: string }) {
  const free = ['ollama', 'lmstudio'].includes(provider)
  const stat = (k: string, v: string) => <div><div className="text-[11px] uppercase tracking-wider text-muted">{k}</div><div className="text-ink text-lg font-semibold mt-0.5">{v}</div></div>
  return (
    <Card className="p-4 fade">
      <div className="grid grid-cols-4 gap-4">
        {stat('Est. cost', free ? 'Free (local)' : e.priced ? `$${e.costUsd.toFixed(e.costUsd < 0.1 ? 3 : 2)}` : 'n/a')}
        {stat('Tokens', `${fmt(e.inputTokens + e.outputTokens)}`)}
        {stat('Time', `~${e.minutes} min`)}
        {stat('Steps', `≤ ${e.steps}`)}
      </div>
      <div className="mt-3 text-xs text-muted">{model} · repo ≈ {fmt(e.repoTokens)} tokens · complexity {e.complexity} · tests: <span className="font-mono">{e.testCommand ?? 'not detected'}</span></div>
      <div className="mt-3 border-t border-line pt-3">
        <div className="text-[11px] uppercase tracking-wider text-muted mb-1.5">Optimization</div>
        <ul className="space-y-1 text-[12.5px]">{e.tips.map((t) => <li key={t}>· {t}</li>)}</ul>
      </div>
      <p className="mt-3 text-[11px] text-muted">Estimates use approximate list prices and typical step counts; actual usage is shown live during the run.</p>
    </Card>
  )
}

export function TaskPanel() {
  const { repo, localPath, llm } = useApp()
  const s = useSession()
  const abort = useRef<AbortController | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const timeline = useRef<HTMLDivElement>(null)
  const estRef = useRef<HTMLDivElement>(null)

  // Prefill from the picked issue.
  useEffect(() => {
    if (!s.picked) return
    s.set({ goal: `#${s.picked.number} ${s.picked.title}`, branch: `sakai/issue-${s.picked.number}-${slug(s.picked.title)}`, estimate: null, phase: 'idle' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.picked?.number])

  useEffect(() => {
    if (localPath && !s.testCommand) void post<{ command: string | null }>('/tests/detect', { root: localPath }).then((r) => r.command && s.set({ testCommand: r.command }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localPath])

  useEffect(() => { timeline.current?.scrollTo({ top: timeline.current.scrollHeight }) }, [s.events.length])

  const issueText = () => `${s.goal}\n\n${s.picked?.body ?? ''}\n\n${s.notes}`
  const ready = !!localPath && s.goal.trim().length > 0

  async function doEstimate() {
    setErr(''); s.set({ phase: 'estimating' })
    try {
      const cfg = await resolveLlm()
      const est = await post<Estimate>('/estimate', { root: localPath, issueText: issueText(), provider: llm!.provider, model: llm!.model, llm: cfg, withTips: true })
      s.set({ estimate: est, stepLimit: Math.min(100, Math.max(15, Math.round(est.steps * 1.5))), phase: 'estimated', testCommand: s.testCommand || est.testCommand || '' })
      setTimeout(() => estRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
    } catch (e) { setErr(cleanErr(e)); s.set({ phase: 'idle' }) }
  }

  async function run() {
    setErr(''); s.set({ phase: 'running', events: [], usage: { inputTokens: 0, outputTokens: 0, steps: 0 }, summary: '', pr: null, panelOpen: true, panel: 'logs' })
    const ac = new AbortController(); abort.current = ac
    try {
      const cfg = await resolveLlm()
      if (s.branch) await post('/git/branch', { root: localPath, name: s.branch }).catch(() => undefined)
      s.log(`$ sakai run — ${llm!.provider}/${llm!.model}`)
      await streamRun({ root: localPath, llm: cfg, issue: { number: s.picked?.number, title: s.goal, body: s.picked?.body ?? '' }, notes: s.notes, testCommand: s.testCommand || undefined, maxSteps: s.stepLimit }, (ev) => {
        const st = useSession.getState()
        if (ev.type === 'usage') st.set({ usage: ev.data })
        if (ev.type === 'status') st.log(`· ${ev.data}`)
        if (ev.type === 'tool') st.log(`$ ${ev.data.call.tool} ${ev.data.call.args.command ?? ev.data.call.args.path ?? ev.data.call.args.pattern ?? ''}`)
        if (ev.type === 'done') st.set({ phase: ev.data.finished ? 'done' : 'failed', summary: ev.data.summary })
        if (ev.type === 'error') { st.set({ phase: 'failed' }); setErr(ev.data) }
        if (ev.type !== 'usage') st.set({ events: [...st.events, ev] })
      }, ac.signal)
      const { files } = await post<{ files: string[] }>('/git/changes', { root: localPath })
      s.set({ changed: files })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') { setErr(cleanErr(e)); s.set({ phase: 'failed' }) }
    }
  }

  function stop() { abort.current?.abort(); s.set({ phase: 'failed', summary: 'Stopped by user' }) }

  async function createPr() {
    setBusy(true); setErr('')
    try {
      const token = await window.sakai.github.token()
      const body = `${s.summary}\n\n${s.picked ? `Closes #${s.picked.number}\n\n` : ''}---\nResolved autonomously by Sakai (${llm!.provider}/${llm!.model}). Steps: ${s.usage.steps}, tokens: ${s.usage.inputTokens + s.usage.outputTokens}.`
      const pr = await post<{ url: string; number: number }>('/git/pr', { root: localPath, repo, token, branch: s.branch || `sakai/${Date.now()}`, title: s.picked ? `Fix #${s.picked.number}: ${s.picked.title}` : s.goal.slice(0, 70), body })
      s.set({ pr }); s.log(`✓ Pull request #${pr.number} opened: ${pr.url}`)
    } catch (e) { setErr(cleanErr(e)) } finally { setBusy(false) }
  }

  async function discard() {
    await post('/git/reset', { root: localPath }); s.set({ changed: [], phase: 'idle', events: [] }); s.log('✓ Discarded working tree changes')
  }

  const running = s.phase === 'running'
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto p-8 space-y-5">
        <div>
          <h2 className="text-xl text-ink font-semibold">{s.picked ? `Solve #${s.picked.number}` : 'New task'}</h2>
          <p className="text-muted mt-1">{s.picked ? 'Review the details Sakai will work from.' : 'Pick an issue from the sidebar, or describe what to solve.'}</p>
        </div>

        <Field label="What should Sakai solve?"><textarea rows={2} value={s.goal} onChange={(e) => s.set({ goal: e.target.value })} disabled={running} className={`${input} py-2`} placeholder="Describe the bug or feature" /></Field>
        {s.picked?.body && <details className="text-[12.5px]"><summary className="cursor-pointer text-muted">Issue description</summary><pre className="mt-2 whitespace-pre-wrap font-sans leading-relaxed">{s.picked.body}</pre></details>}
        <Field label="Extra guidance (files, constraints, expected behaviour)"><textarea rows={3} value={s.notes} onChange={(e) => s.set({ notes: e.target.value })} disabled={running} className={`${input} py-2`} /></Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Test command"><input value={s.testCommand} onChange={(e) => s.set({ testCommand: e.target.value })} disabled={running} className={`${input} h-9 font-mono text-xs`} placeholder="npm test" /></Field>
          <Field label="Step limit"><input type="number" min={5} max={100} value={s.stepLimit} onChange={(e) => s.set({ stepLimit: Math.max(5, Math.min(100, Number(e.target.value) || 30)) })} disabled={running} className={`${input} h-9 text-xs`} /></Field>
          <Field label="Branch"><input value={s.branch} onChange={(e) => s.set({ branch: e.target.value })} disabled={running} className={`${input} h-9 font-mono text-xs`} placeholder="sakai/fix" /></Field>
        </div>

        <p className="-mt-2 text-[11px] text-muted">Step limit = the most model calls Sakai may make before stopping (a cost safety cap; a step is one model call). Typical fixes take 10–25.</p>
        {llm && isSmallModel(llm.model) && <p className="text-[12px] text-sakai border border-line rounded-md px-3 py-2">{llm.model} is too small to drive an agent reliably and will likely get stuck. Use a 7B+ coder model or a hosted model (Groq, DeepSeek, Qwen).</p>}
        {s.estimate && <div ref={estRef}><EstimateCard e={s.estimate} provider={llm!.provider} model={llm!.model} /></div>}
        {err && <p className="text-sakai text-xs whitespace-pre-wrap">{err}</p>}

        <div className="flex gap-2">
          <Button variant="ghost" disabled={!ready || running || s.phase === 'estimating'} onClick={doEstimate}>{s.phase === 'estimating' ? 'Estimating…' : 'Estimate cost & time'}</Button>
          {running ? <Button onClick={stop}>Stop</Button> : <Button disabled={!ready} onClick={run}>{s.phase === 'idle' || s.phase === 'estimated' ? 'Solve' : 'Run again'}</Button>}
        </div>

        {s.events.length > 0 && (
          <Card className="overflow-hidden fade">
            <div className="h-9 px-4 flex items-center justify-between border-b border-line text-xs">
              <span className="text-ink">Agent run</span>
              <span className="text-muted font-mono">{s.usage.steps} steps · {fmt(s.usage.inputTokens + s.usage.outputTokens)} tokens{s.estimate?.priced ? '' : ''}</span>
            </div>
            <div ref={timeline} className="max-h-80 overflow-auto p-3 space-y-2 font-mono text-[12px]">
              {s.events.map((e, i) => e.type === 'assistant' ? (
                <div key={i} className="text-fg whitespace-pre-wrap">{e.data.replace(/```json[\s\S]*?```/g, '').trim().slice(0, 600)}</div>
              ) : e.type === 'tool' ? (
                <details key={i} className="border-l-2 border-line pl-3"><summary className="cursor-pointer text-muted">{e.data.call.tool} <span className="text-fg">{e.data.call.args.command ?? e.data.call.args.path ?? e.data.call.args.pattern ?? ''}</span></summary><pre className="mt-1 whitespace-pre-wrap text-muted max-h-48 overflow-auto">{e.data.out}</pre></details>
              ) : e.type === 'status' && /Invalid|retry/i.test(e.data) ? (
                <div key={i} className="text-sakai">{e.data}</div>
              ) : null)}
              {running && <div className="text-muted">working…</div>}
            </div>
          </Card>
        )}

        {(s.phase === 'done' || s.phase === 'failed') && (
          <Card className="p-4 fade">
            <div className={`text-sm font-medium ${s.phase === 'done' ? 'text-ink' : 'text-sakai'}`}>{s.phase === 'done' ? 'Verified fix ready' : 'Run did not finish'}</div>
            <p className="mt-1 text-[12.5px] whitespace-pre-wrap">{s.summary}</p>
            {s.changed.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.changed.map((f) => <button key={f} onClick={() => useSession.getState().openTab({ id: `diff:${f}`, kind: 'diff', title: `${f.split('/').pop()} (diff)`, path: f })} className="font-mono text-[11px] px-2 h-6 rounded border border-line hover:border-sakai">{f}</button>)}
              </div>
            )}
            <div className="mt-4 flex gap-2 items-center">
              {s.pr ? <a href={s.pr.url} target="_blank" className="text-sakai underline">Open pull request #{s.pr.number}</a> : <Button disabled={busy || !s.changed.length} onClick={createPr}>{busy ? 'Opening PR…' : 'Create pull request'}</Button>}
              <Button variant="ghost" disabled={!s.changed.length} onClick={discard}>Discard changes</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
