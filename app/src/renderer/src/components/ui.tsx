import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div style={{ width: size, height: size }} className="rounded-full bg-sakai grid place-items-center text-ink font-semibold">S</div>
      <span className="text-ink text-[15px] font-semibold tracking-wide">Sakai</span>
    </div>
  )
}

export function Button({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const base = 'h-9 px-4 rounded-md text-[13px] font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none no-drag'
  const v = variant === 'primary' ? 'bg-sakai hover:bg-sakai-hover text-ink' : 'border border-line bg-raised hover:border-[#2c2c32] text-fg'
  return <button className={`${base} ${v} ${className}`} {...p} />
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-panel border border-line rounded-lg ${className}`}>{children}</div>
}

export function Steps({ current }: { current: number }) {
  return (
    <div className="flex gap-1.5 mb-6">
      {[0, 1, 2].map((i) => <div key={i} className={`h-0.5 flex-1 rounded ${i <= current ? 'bg-sakai' : 'bg-line'}`} />)}
    </div>
  )
}
