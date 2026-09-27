import { useEffect, useRef, useState } from 'react'
import { useApp, PROFILES } from '../store'
import { Mascot } from './Mascot'

/** Three-card audience selector. `compact` renders a smaller inline variant for Settings. */
export function ProfilePicker({ compact = false }: { compact?: boolean }) {
  const profile = useApp((s) => s.profile)
  const setProfile = useApp((s) => s.setProfile)
  return (
    <div role="radiogroup" aria-label="Who's coding today?" className="grid grid-cols-3 gap-2.5">
      {PROFILES.map((p) => {
        const on = p.id === profile
        return (
          <button key={p.id} role="radio" aria-checked={on} onClick={() => setProfile(p.id)}
            className={`flex flex-col items-start justify-start text-left rounded-xl border transition-all ${compact ? 'p-2.5' : 'p-3.5'} ${on ? 'border-sakai bg-sakai/10 shadow-[0_0_0_1px_var(--color-sakai),0_0_24px_rgba(188,0,45,.35)]' : 'border-line bg-panel/80 hover:border-line2 hover:bg-raised'}`}>
            <Mascot profile={p.id} size={compact ? 52 : 72} animate={on} />
            <div className="mt-1 text-ink font-medium text-[13px]">{p.name}</div>
            <div className="mt-0.5 text-[11.5px] text-muted leading-snug">{p.blurb}</div>
          </button>
        )
      })}
    </div>
  )
}

/** Status-bar chip: click opens a small menu to switch profile. */
export function ProfileChip({ cell }: { cell: string }) {
  const profile = useApp((s) => s.profile)
  const setProfile = useApp((s) => s.setProfile)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])
  const cur = PROFILES.find((p) => p.id === profile)!
  return (
    <div ref={ref} className="relative h-full">
      <button className={cell} title="Audience profile" onClick={() => setOpen(!open)}><Mascot size={16} animate={false} />{cur.name}</button>
      {open && (
        <div className="absolute bottom-[24px] right-0 w-[230px] rounded-lg border border-line2 bg-panel text-fg shadow-[0_10px_40px_rgba(0,0,0,.7)] py-1 z-50 fadein">
          {PROFILES.map((p) => (
            <button key={p.id} onClick={() => { setProfile(p.id); setOpen(false) }} className={`w-full px-3 py-1.5 text-left flex items-start gap-2 hover:bg-hover ${p.id === profile ? 'text-ink' : ''}`}>
              <Mascot profile={p.id} size={22} animate={false} />
              <span><span className="block text-[12.5px]">{p.name}{p.id === profile ? '  ✓' : ''}</span><span className="block text-[11px] text-muted">{p.blurb}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
