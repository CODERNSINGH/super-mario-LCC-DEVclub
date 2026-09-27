import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useApp } from '../store'
import { useChat, useChatStore } from '../lib/chat'
import { nextTip, contextTip, type Tip, type CtxKind } from '../lib/tips'
import { Mascot } from '../ui/Mascot'
import { TipArt, textFx } from '../ui/TipArt'

const SHOW_MS = 9000, EVERY_MS = 15000, FIRST_MS = 6000
const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '')
export const pushTip = (tip?: Tip) => window.dispatchEvent(new CustomEvent('sakai:tip', { detail: tip }))
if (import.meta.env.DEV) (window as unknown as { __tip: () => void }).__tip = () => pushTip()

function kindOf(call: { tool: string; args: Record<string, string> }, out: string): CtxKind | null {
  const o = strip(out)
  if (/FAILING \(exit/.test(o) || /^exit [1-9]/.test(o)) return 'test-fail'
  if (/ALL PASS/.test(o)) return 'test-pass'
  if (call.tool === 'search') return 'search'
  if (call.tool === 'replace' || call.tool === 'write_file') return 'edit'
  return null
}

/** Bottom-right toast host over the editor area; shows at most one Sakai Tip at a time while the agent works. */
export function TipToast({ root }: { root: string | null }) {
  const profile = useApp((s) => s.profile)
  const tipsOn = useApp((s) => s.tipsOn)
  const setTipsOn = useApp((s) => s.setTipsOn)
  const running = useChat(root).phase === 'running'
  const [tip, setTip] = useState<Tip | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<number | null>(null)
  const st = useRef({ nextAt: 0, hideAt: 0, hover: false, open: false, tip: null as Tip | null, lastCtx: 0, seen: 0 })
  st.current.open = open; st.current.tip = tip

  const show = (t: Tip) => {
    const s = st.current
    s.hideAt = Date.now() + SHOW_MS; s.nextAt = Date.now() + EVERY_MS
    setLeaving(false); setOpen(false); setPick(null); setTip(t)
  }
  const dismiss = () => { setLeaving(true); setTimeout(() => { if (st.current.tip) { setTip(null); setLeaving(false); setOpen(false) } }, 400) }

  useEffect(() => {
    if (!running || !tipsOn) { setTip(null); return }
    const s = st.current
    s.nextAt = Date.now() + FIRST_MS
    const id = setInterval(() => {
      const now = Date.now()
      if (!s.tip && now >= s.nextAt) show(nextTip(useApp.getState().profile))
      else if (s.tip && !s.hover && !s.open && now >= s.hideAt) dismiss()
    }, 500)
    const unsub = useChatStore.subscribe((state) => {
      const items = state.chats[root ?? '']?.items ?? []
      if (items.length === s.seen) return
      const fresh = items.slice(s.seen); s.seen = items.length
      const last = [...fresh].reverse().find((i) => i.kind === 'tool' && i.out !== undefined)
      if (!last || last.kind !== 'tool' || s.tip || Date.now() - s.lastCtx < 25000 || Math.random() > 0.35) return
      const k = kindOf(last.call, last.out ?? '')
      if (k) { s.lastCtx = Date.now(); show(contextTip(k)) }
    })
    s.seen = (useChatStore.getState().chats[root ?? '']?.items ?? []).length
    return () => { clearInterval(id); unsub() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, tipsOn, root])

  useEffect(() => {
    const h = (e: Event) => { const t = (e as CustomEvent<Tip | undefined>).detail ?? nextTip(useApp.getState().profile); show(t) }
    window.addEventListener('sakai:tip', h)
    return () => window.removeEventListener('sakai:tip', h)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!tip) return null
  const quiz = tip.quiz
  const btn = 'h-6 px-2.5 rounded text-[11px] font-medium border border-line2 bg-raised hover:border-sakai text-fg'
  return (
    <div className={`absolute right-3 bottom-3 z-30 ${open || quiz ? 'w-[340px]' : 'w-[290px]'} max-w-[calc(100%-24px)] ${leaving ? 'ta-out' : 'ta-in'}`}
      onMouseEnter={() => { st.current.hover = true }} onMouseLeave={() => { st.current.hover = false; st.current.hideAt = Date.now() + 3000 }} role="status" aria-live="polite">
      <div className={`relative rounded-xl border bg-panel/95 backdrop-blur shadow-[0_10px_40px_rgba(0,0,0,.6)] overflow-hidden ${open ? 'border-sakai/70' : 'border-line2'}`}>
        <div onClick={() => setOpen(true)} className={open ? '' : 'cursor-pointer'}>
          <div className="px-3 pt-2 flex items-center text-[10px] uppercase tracking-widest text-faint"><Mascot size={22} talking={!leaving} className="mr-1.5" /><span className="text-sakai">Sakai Tips</span>
            <button aria-label="Dismiss" onClick={(e) => { e.stopPropagation(); dismiss() }} className="ml-auto w-5 h-5 grid place-items-center rounded hover:bg-hover hover:text-ink"><X size={12} /></button></div>
          <TipArt anim={tip.anim} />
          <div className="px-3.5 pb-3">
            <div className={`text-ink font-semibold leading-snug ${open ? 'text-[14px]' : 'text-[13px]'} ${textFx(tip.anim)}`}>{tip.title}</div>
            {!quiz && <p className={`mt-1 text-fg/90 leading-relaxed ${open ? 'text-[12.5px]' : 'text-[12px]'} ${textFx(tip.anim)}`}>{tip.body}</p>}
            {quiz && (
              <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                <p className="text-[12px] text-fg/90 leading-snug mb-1.5">{quiz.q}</p>
                <div className="space-y-1">
                  {quiz.options.map((o, i) => {
                    const done = pick !== null
                    const state = !done ? '' : i === quiz.answer ? 'border-white bg-white/10 text-ink' : i === pick ? 'border-sakai bg-sakai/20 text-ink' : 'opacity-50'
                    return <button key={o} disabled={done} onClick={() => { setPick(i); setOpen(true) }} className={`w-full text-left px-2.5 h-7 rounded-md border text-[12px] ${done ? state : 'border-line2 bg-raised hover:border-sakai text-fg'} ${state ? 'border' : ''}`}>{o}{done && i === quiz.answer ? '  ✓' : ''}</button>
                  })}
                </div>
                {pick !== null && <p className="mt-1.5 text-[12px] text-fg fade"><span className="text-ink font-semibold">{pick === quiz.answer ? 'Nailed it. ' : 'Not quite. '}</span>{quiz.why}</p>}
              </div>
            )}
          </div>
        </div>
        {open && (
          <div className="px-3.5 pb-3 flex gap-1.5 fade">
            <button className={btn} onClick={dismiss}>Got it</button>
            <button className={btn} onClick={() => show(nextTip(profile))}>Another one</button>
            <button className={`${btn} ml-auto text-muted`} onClick={() => { setTipsOn(false); dismiss() }}>Turn off tips</button>
          </div>
        )}
        {!open && !leaving && <div key={tip.id + st.current.hideAt} className="h-[2px] bg-sakai/70 ta-timer" style={{ animationDuration: `${SHOW_MS}ms` }} />}
      </div>
    </div>
  )
}
