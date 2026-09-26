import { useEffect, useRef, type ReactNode } from 'react'

export type MenuItem = { label: string; shortcut?: string; action?: () => void; disabled?: boolean; sep?: boolean; checked?: boolean }

/** VS Code-style dropdown list. */
export function Menu({ items, onClose, className = '' }: { items: MenuItem[]; onClose: () => void; className?: string }) {
  return (
    <div className={`min-w-[230px] py-1 bg-panel border border-line2 rounded-lg shadow-[0_8px_30px_rgba(0,0,0,.6)] fadein ${className}`} onMouseDown={(e) => e.stopPropagation()}>
      {items.map((it, i) => it.sep ? <div key={i} className="my-1 h-px bg-line" /> : (
        <button key={i} disabled={it.disabled} onClick={() => { onClose(); it.action?.() }} className="w-full h-[26px] px-3 flex items-center gap-2 text-left text-[12.5px] hover:bg-sakai/25 hover:text-ink disabled:opacity-40 disabled:pointer-events-none">
          <span className="w-3 text-[11px]">{it.checked ? '✓' : ''}</span>
          <span className="flex-1">{it.label}</span>
          {it.shortcut && <span className="kbd">{it.shortcut}</span>}
        </button>
      ))}
    </div>
  )
}

/** Closes when clicking anywhere outside `children`. */
export function useOutside(onOutside: () => void, active: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!active) return
    const h = (e: MouseEvent) => { if (ref.current && !(e.target instanceof Node && ref.current.contains(e.target))) onOutside() }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onOutside() }
    window.addEventListener('mousedown', h); window.addEventListener('keydown', k); window.addEventListener('blur', onOutside)
    return () => { window.removeEventListener('mousedown', h); window.removeEventListener('keydown', k); window.removeEventListener('blur', onOutside) }
  }, [active, onOutside])
  return ref
}

export function Popover({ open, onClose, trigger, menu, side = 'right-bottom' }: { open: boolean; onClose: () => void; trigger: ReactNode; menu: ReactNode; side?: 'right-bottom' | 'below' }) {
  const ref = useOutside(onClose, open)
  return (
    <div ref={ref} className="relative">
      {trigger}
      {open && <div className={`absolute z-50 ${side === 'right-bottom' ? 'left-full bottom-0 ml-1' : 'top-full left-0 mt-1'}`}>{menu}</div>}
    </div>
  )
}
