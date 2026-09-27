import { useCallback, useEffect, useState } from 'react'
import { Loader2, RotateCw } from 'lucide-react'
import { useApp, PROFILES } from '../../store'
import { post, resolveLlm } from '../../lib/api'
import { sendMessage, type Item } from '../../lib/chat'
import { useHighlights, getStreak, setStreak, type LearnResult } from '../../lib/learn'
import { Md } from './Md'

const TITLE = { swe: 'Understand this fix', student: 'Your turn: what went wrong?', vibe: 'What to watch out for' } as const

function Skeleton() {
  return <div className="space-y-2 animate-pulse" aria-label="Loading">{[90, 70, 82, 50].map((w, i) => <div key={i} className="h-3 rounded bg-line2" style={{ width: `${w}%` }} />)}</div>
}

function Mcq({ m }: { m: NonNullable<LearnResult['mcq']> }) {
  const [pick, setPick] = useState<number | null>(null)
  const [streak, setS] = useState(getStreak)
  const answer = (i: number) => {
    if (pick !== null) return
    setPick(i)
    const n = i === m.answerIndex ? streak + 1 : 0
    setStreak(n); setS(n)
  }
  const right = pick === m.answerIndex
  return (
    <div className="rounded-lg border border-line2 bg-bg/60 p-3">
      <div className="flex items-center text-[10.5px] uppercase tracking-wider text-muted"><span>Quick quiz</span><span className="ml-auto text-fg">Streak {streak} {streak >= 3 ? '🔥' : ''}</span></div>
      <p className="mt-1.5 text-[13px] text-ink leading-snug">{m.question}</p>
      <div className="mt-2 space-y-1.5">
        {m.options.map((o, i) => {
          const cls = pick === null ? 'border-line2 bg-raised hover:border-sakai text-fg' : i === m.answerIndex ? 'border-white bg-white/10 text-ink' : i === pick ? 'border-sakai bg-sakai/20 text-ink' : 'border-line opacity-50'
          return <button key={i} disabled={pick !== null} onClick={() => answer(i)} className={`w-full text-left px-3 py-1.5 rounded-md border text-[12.5px] ${cls}`}>{o}{pick !== null && i === m.answerIndex ? '  ✓' : ''}</button>
        })}
      </div>
      {pick !== null && <p className="mt-2 text-[12.5px] text-fg fade"><span className="text-ink font-semibold">{right ? 'Nailed it! 🎉 ' : 'Close, but no cigar. '}</span>{m.why}</p>}
    </div>
  )
}

const SEV = { high: 'bg-sakai text-ink', medium: 'bg-[#b8860b] text-black', low: 'bg-line2 text-fg' } as const

/** Profile-tailored explanation shown under the result card once a solve run finishes with a diff. */
export function LearnCard({ root, items }: { root: string; items: Item[] }) {
  const profile = useApp((s) => s.profile)
  const [data, setData] = useState<LearnResult | null>(null)
  const [state, setState] = useState<'load' | 'ok' | 'err' | 'none'>('load')
  const setHl = useHighlights((s) => s.set)
  const task = items.find((i) => i.kind === 'task') as Extract<Item, { kind: 'task' }> | undefined
  const summary = (items.filter((i) => i.kind === 'result').pop() as Extract<Item, { kind: 'result' }> | undefined)?.summary ?? ''
  const api = PROFILES.find((p) => p.id === profile)!.api

  const run = useCallback(async () => {
    setState('load')
    try {
      const { diff } = await post<{ diff: string }>('/git/diff', { root })
      if (!diff.trim()) return setState('none')
      const llm = await resolveLlm()
      const r = await post<LearnResult>('/learn', { llm, profile: api, issue: { title: task?.title ?? summary.slice(0, 80), body: task?.body ?? '' }, diff, summary })
      setData(r); setState('ok')
      if (profile !== 'swe') setHl(r.highlights ?? [])
    } catch { setState('err') }
  }, [root, api, profile, task?.title, task?.body, summary, setHl])
  useEffect(() => { void run(); return () => setHl([]) }, [run]) // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'none') return null
  return (
    <div className="rounded-xl border border-line2 bg-panel overflow-hidden fade">
      <div className="px-3 h-8 flex items-center gap-2 text-[12px] text-ink border-b border-line"><span className="text-[14px]">{PROFILES.find((p) => p.id === profile)!.emoji}</span>{TITLE[profile]}</div>
      <div className="p-3 space-y-3">
        {state === 'load' && <><div className="flex items-center gap-2 text-[12px] text-muted"><Loader2 size={13} className="spin text-sakai" />Reading the diff…</div><Skeleton /></>}
        {state === 'err' && (
          <div className="text-[12.5px] text-fg">Sakai’s tutor tripped over its shoelaces. <button onClick={() => void run()} className="ml-1 inline-flex items-center gap-1 text-sakai hover:underline"><RotateCw size={11} />Try again</button></div>
        )}
        {state === 'ok' && data && (
          <>
            {profile === 'student' && data.mcq && <Mcq m={data.mcq} />}
            {profile === 'swe' && data.rootCause && <div><div className="text-[10.5px] uppercase tracking-wider text-muted mb-0.5">Root cause</div><Md text={data.rootCause} /></div>}
            <div>{profile !== 'vibe' && <div className="text-[10.5px] uppercase tracking-wider text-muted mb-0.5">{profile === 'swe' ? 'What changed' : 'Explanation'}</div>}<Md text={data.explanation} /></div>
            {profile === 'student' && data.concepts?.length > 0 && <div className="flex flex-wrap gap-1.5">{data.concepts.map((c) => <span key={c} className="h-5 px-2 rounded-full border border-line2 text-[11px] text-fg flex items-center">{c}</span>)}</div>}
            {profile !== 'student' && data.risks?.length > 0 && (
              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-muted mb-1">{profile === 'vibe' ? 'Watch-outs' : 'Risks'}</div>
                <div className="space-y-2">
                  {data.risks.map((r, i) => (
                    <div key={i} className="rounded-lg border border-line2 bg-bg/60 p-2.5">
                      <div className="flex items-center gap-2"><span className={`h-[16px] px-1.5 rounded text-[10px] font-semibold uppercase flex items-center ${SEV[r.severity] ?? SEV.low}`}>{r.severity}</span><span className="text-[12.5px] text-ink font-medium">{r.title}</span></div>
                      <p className="mt-1 text-[12px] text-fg/90 leading-snug">{r.detail}</p>
                      {profile === 'vibe' && <button onClick={() => void sendMessage(root, `Please fix this weakness: ${r.title} — ${r.detail}`)} className="mt-1.5 h-6 px-2.5 rounded border border-line2 hover:border-sakai bg-raised text-[11.5px] text-fg">Ask Sakai to fix this</button>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {profile !== 'swe' && (data.highlights?.length ?? 0) > 0 && <p className="text-[11px] text-muted">Changed lines that matter are underlined in red in your open files.</p>}
          </>
        )}
      </div>
    </div>
  )
}
