import { useSession } from '../lib/session'
import { Button } from './ui'

export function Modal() {
  const m = useSession((s) => s.modal)
  const set = useSession((s) => s.set)
  if (!m) return null
  const close = () => set({ modal: null })
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 fadein" onMouseDown={close}>
      <div className="pop w-[420px] bg-panel border border-line2 rounded-xl p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-ink text-[15px] font-semibold">{m.title}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-fg/90">{m.body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>{m.cancel ?? 'Cancel'}</Button>
          <Button autoFocus onClick={() => { close(); m.onConfirm() }}>{m.confirm}</Button>
        </div>
      </div>
    </div>
  )
}
