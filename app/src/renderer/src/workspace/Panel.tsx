import { useEffect, useRef } from 'react'
import { Maximize2, Minimize2, X, CircleX, TriangleAlert, Plus } from 'lucide-react'
import { useSession, type PanelTab } from '../lib/session'
import { useApp } from '../store'
import { Terminal } from '../components/Terminal'
import * as A from '../lib/actions'

const TABS: { id: PanelTab; label: string }[] = [{ id: 'problems', label: 'Problems' }, { id: 'output', label: 'Output' }, { id: 'debug', label: 'Debug Console' }, { id: 'terminal', label: 'Terminal' }]

export function Panel() {
  const s = useSession()
  const localPath = useApp((a) => a.localPath)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView() }, [s.logs.length, s.debug.length, s.panel])
  const line = (l: string, i: number) => <div key={i} className={`whitespace-pre-wrap leading-[18px] ${l.startsWith('✗') ? 'text-sakai' : l.startsWith('$') || l.startsWith('✓') ? 'text-ink' : l.startsWith('!') ? 'text-fg' : 'text-fg/80'}`}>{l}</div>
  return (
    <div className="flex flex-col min-h-0 h-full bg-panel border-t border-line">
      <div className="h-[35px] shrink-0 px-2 flex items-center gap-0.5 border-b border-line overflow-hidden">
        <div className="flex min-w-0 h-full overflow-hidden">{TABS.map((t) => (
          <button key={t.id} onClick={() => s.set({ panel: t.id })} className={`h-full px-2 text-[11px] uppercase tracking-wide relative flex items-center gap-1.5 whitespace-nowrap shrink-0 ${s.panel === t.id ? 'text-ink' : 'text-muted hover:text-fg'}`}>
            {t.label}
            {t.id === 'problems' && s.problems.length > 0 && <span className="min-w-[16px] h-4 px-1 rounded-full bg-sakai text-ink text-[10px] grid place-items-center">{s.problems.length}</span>}
            {s.panel === t.id && <span className="absolute left-2 right-2 bottom-0 h-px bg-sakai" />}
          </button>
        ))}</div>
        <span className="ml-auto flex items-center gap-1 text-muted shrink-0">
          {s.cloneFailed && <button onClick={() => window.dispatchEvent(new Event('sakai:retry'))} className="h-5 px-2 mr-1 rounded bg-sakai text-ink text-[11px] normal-case tracking-normal">Retry</button>}
          {s.panel === 'terminal' && <button title="New Terminal" onClick={A.openTerminal} className="w-6 h-6 grid place-items-center hover:text-ink"><Plus size={14} /></button>}
          <button title={s.panelMax ? 'Restore Panel Size' : 'Maximize Panel Size'} onClick={() => s.set({ panelMax: !s.panelMax })} className="w-6 h-6 grid place-items-center hover:text-ink">{s.panelMax ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
          <button title="Close Panel" onClick={() => s.set({ panelOpen: false, panelMax: false })} className="w-6 h-6 grid place-items-center hover:text-ink"><X size={14} /></button>
        </span>
      </div>
      <div className="flex-1 min-h-0 relative">
        {(s.panel === 'output' || s.panel === 'debug') && (
          <div className="absolute inset-0 overflow-auto px-4 py-2 font-mono text-[12px] selectable">
            {(s.panel === 'output' ? s.logs : s.debug).map(line)}
            {(s.panel === 'output' ? s.logs : s.debug).length === 0 && <p className="text-faint font-sans">{s.panel === 'output' ? 'Sakai output will appear here.' : 'Agent tool calls stream here while it works.'}</p>}
            <div ref={end} />
          </div>
        )}
        {s.panel === 'problems' && (
          <div className="absolute inset-0 overflow-auto py-1">
            {s.problems.length === 0 && <p className="px-4 py-2 text-[12.5px] text-muted">No problems have been detected in the workspace.</p>}
            {s.problems.map((p, i) => <div key={i} className="row h-auto py-1 items-start">{p.severity === 'error' ? <CircleX size={14} className="text-sakai mt-0.5 shrink-0" /> : <TriangleAlert size={14} className="text-fg mt-0.5 shrink-0" />}<span className="text-[12.5px] text-fg whitespace-normal">{p.message}</span><span className="ml-2 text-[11px] text-faint">{p.source}</span></div>)}
          </div>
        )}
        <div className={`absolute inset-0 ${s.panel === 'terminal' ? '' : 'invisible'}`}><Terminal cwd={localPath} visible={s.panel === 'terminal' && s.panelOpen} /></div>
      </div>
    </div>
  )
}
