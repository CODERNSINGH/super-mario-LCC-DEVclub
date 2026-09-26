import { useEffect, useRef, useState } from 'react'
import { useSession } from '../lib/session'
import { useApp } from '../store'
import { runInTerminal, useQuick } from '../lib/quick'

export function CommandPalette() {
  const s = useSession()
  const app = useApp()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  const close = () => s.set({ palette: false })
  const quick = useQuick()
  const cmds = [
    { name: 'View: Show Issues', run: () => s.set({ side: 'issues' }) },
    { name: 'View: Show Explorer', run: () => s.set({ side: 'explorer' }) },
    { name: 'View: Show Changes', run: () => s.set({ side: 'changes' }) },
    { name: 'Terminal: Open Integrated Terminal', run: () => s.set({ panel: 'terminal', panelOpen: true }) },
    { name: 'View: Toggle Panel', run: () => s.set({ panelOpen: !s.panelOpen }) },
    { name: 'View: Show Quick Commands', run: () => s.set({ side: 'quick' }) },
    { name: 'View: Show Settings', run: () => s.set({ side: 'settings' }) },
    ...quick.map((c) => ({ name: `Run: ${c.name}`, run: () => runInTerminal(s.set, s.termId, c.command) })),
    { name: 'Task: Go to Task', run: () => s.set({ active: 'task' }) },
    { name: 'Model: Change Model', run: () => app.set({ step: 'llm' }) },
    { name: 'Repository: Open Another', run: () => app.set({ step: 'repo' }) },
    ...s.tabs.filter((t) => t.id !== 'task').map((t) => ({ name: `Close Tab: ${t.title}`, run: () => s.closeTab(t.id) })),
  ].filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="fixed inset-0 z-50 flex justify-center pt-24 bg-black/50" onMouseDown={close}>
      <div className="pop w-[520px] h-fit bg-panel border border-line rounded-lg overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setI(0) }} placeholder="Type a command"
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            if (e.key === 'ArrowDown') setI((x) => Math.min(x + 1, cmds.length - 1))
            if (e.key === 'ArrowUp') setI((x) => Math.max(x - 1, 0))
            if (e.key === 'Enter' && cmds[i]) { cmds[i].run(); close() }
          }}
          className="w-full h-11 px-4 bg-transparent border-b border-line outline-none text-ink" />
        <div className="max-h-72 overflow-auto py-1">
          {cmds.map((c, n) => <button key={c.name} onClick={() => { c.run(); close() }} className={`w-full text-left px-4 h-8 ${n === i ? 'bg-raised text-ink' : ''}`}>{c.name}</button>)}
        </div>
      </div>
    </div>
  )
}
