import type { ButtonHTMLAttributes, ReactNode } from 'react'
import logo from '../assets/logo.png'

export function Logo({ size = 28, text = true }: { size?: number; text?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={logo} width={size} height={size} alt="" className="select-none" draggable={false} />
      {text && <span className="text-ink text-[15px] font-semibold tracking-wide">Sakai</span>}
    </div>
  )
}

export function Button({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'quiet' }) {
  const base = 'h-9 px-4 rounded-md text-[13px] font-medium transition-all disabled:opacity-40 disabled:pointer-events-none no-drag active:scale-[.98]'
  const v = variant === 'primary' ? 'bg-sakai hover:bg-sakai-hover text-ink shadow-[0_0_0_1px_rgba(255,255,255,.06)_inset]'
    : variant === 'ghost' ? 'border border-line2 bg-raised hover:border-faint text-fg'
    : 'text-muted hover:text-ink hover:bg-hover'
  return <button className={`${base} ${v} ${className}`} {...p} />
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-panel border border-line rounded-lg ${className}`}>{children}</div>
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>
}
