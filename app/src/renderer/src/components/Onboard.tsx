import type { ReactNode } from 'react'
import { useApp, type Step } from '../store'
import { Logo } from './ui'
import logo from '../assets/logo.png'

const STEPS: { id: Step; label: string }[] = [{ id: 'repo', label: 'Project' }, { id: 'github', label: 'GitHub' }, { id: 'llm', label: 'Model' }]

/** Shared frame for the three onboarding screens: dotted grid, red aura, mascot and a labelled stepper. */
export function Onboard({ step, title, subtitle, children, hero = false }: { step: Step; title: string; subtitle: string; children: ReactNode; hero?: boolean }) {
  const mode = useApp((s) => s.mode)
  const idx = STEPS.findIndex((s) => s.id === step)
  return (
    <div className="h-full flex flex-col bg-bg grid-bg relative overflow-hidden">
      <div className="pointer-events-none absolute left-1/2 top-[-120px] -translate-x-1/2 w-[760px] h-[520px] rounded-full glow" style={{ background: 'radial-gradient(closest-side, rgba(188,0,45,.28), rgba(188,0,45,0))' }} />
      <div className="drag h-11 shrink-0 flex items-center justify-between pl-[84px] pr-4 relative">
        <Logo size={20} />
        <ol className="no-drag flex items-center gap-1.5 text-[11px]">
          {STEPS.map((s, i) => {
            const skipped = s.id === 'github' && mode === 'local' && idx > 1
            return (
              <li key={s.id} className="flex items-center gap-1.5">
                <span className={`h-5 px-2 rounded-full border flex items-center ${i === idx ? 'border-sakai text-ink bg-sakai/15' : i < idx ? 'border-line2 text-fg' : 'border-line text-faint'}`}>
                  {i < idx && !skipped ? '✓ ' : ''}{skipped ? 'Skipped' : s.label}
                </span>
                {i < STEPS.length - 1 && <span className="w-4 h-px bg-line2" />}
              </li>
            )
          })}
        </ol>
      </div>
      <main className="flex-1 overflow-auto relative">
        <div className="min-h-full grid place-items-center px-8 py-6">
          <div key={step} className="w-full max-w-[560px] fade">
            <div className="flex flex-col items-center text-center">
              <img src={logo} alt="" width={hero ? 104 : 64} height={hero ? 104 : 64} className={`pop select-none ${hero ? 'float' : ''}`} draggable={false} />
              <h1 className={`mt-3 text-ink font-semibold tracking-tight ${hero ? 'text-[28px]' : 'text-2xl'}`}>{title}</h1>
              <p className="mt-2 text-muted text-[13.5px] leading-relaxed max-w-[460px]">{subtitle}</p>
            </div>
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </main>
    </div>
  )
}
