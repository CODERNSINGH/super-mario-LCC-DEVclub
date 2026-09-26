import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store'
import { useSession } from '../lib/session'
import { allFiles } from '../lib/files'
import { runInTerminal, useQuick } from '../lib/quick'
import { useMenus } from './TitleBar'
import { FileIcon } from '../ui/icons'
import * as A from '../lib/actions'

const score = (q: string, s: string) => {
  if (!q) return 1
  const a = s.toLowerCase(), b = q.toLowerCase()
  if (a.includes(b)) return 100 - a.indexOf(b)
  let i = 0; for (const ch of a) if (ch === b[i]) i++
  return i === b.length ? 10 : 0
}

/** ⌘P quick-open files; type `>` (or ⇧⌘P) for commands — same model as VS Code. */
export function CommandPalette() {
  const s = useSession()
  const root = useApp((a) => a.localPath)
  const menus = useMenus()
  const quick = useQuick()
  const [q, setQ] = useState(s.palette === 'commands' ? '>' : '')
  const [i, setI] = useState(0)
  const [files, setFiles] = useState<string[]>([])
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); if (root) void allFiles(root).then(setFiles).catch(() => undefined) }, [root])

  const close = () => s.set({ palette: null })
  const cmdMode = q.startsWith('>')
  const term = cmdMode ? q.slice(1).trim() : q.trim()

  const items = useMemo(() => {
    if (cmdMode) {
      const all = [
        ...Object.entries(menus).flatMap(([m, list]) => list.filter((x) => x.action && !x.disabled).map((x) => ({ label: `${m}: ${x.label.replace(/…$/, '')}`, hint: x.shortcut, run: x.action! }))),
        ...quick.map((c) => ({ label: `Run: ${c.name}`, hint: c.command, run: () => runInTerminal(s.set, s.termId, c.command) })),
      ]
      const seen = new Set<string>()
      return all.filter((c) => !seen.has(c.label) && seen.add(c.label)).map((c) => ({ ...c, sc: score(term, c.label) })).filter((c) => c.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 40)
    }
    return files.map((f) => ({ label: f, hint: '', sc: score(term, f) + (f.split('/').pop()!.toLowerCase().includes(term.toLowerCase()) ? 50 : 0), run: () => A.openFile(f) })).filter((c) => c.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 40)
  }, [cmdMode, term, files, menus, quick]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = (n: number) => { const it = items[n]; if (it) { close(); it.run() } }
  return (
    <div className="fixed inset-0 z-[90] flex justify-center pt-[70px] bg-black/40 fadein" onMouseDown={close}>
      <div className="pop w-[600px] max-w-[92vw] h-fit bg-panel border border-line2 rounded-xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,.7)]" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setI(0) }} placeholder={cmdMode ? 'Type a command' : 'Search files by name (type > for commands)'} spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(x + 1, items.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(x - 1, 0)) }
            if (e.key === 'Enter') run(i)
          }}
          className="w-full h-11 px-4 bg-transparent border-b border-line outline-none text-[14px] text-ink placeholder:text-faint" />
        <div className="max-h-[340px] overflow-auto py-1">
          {items.map((c, n) => (
            <button key={c.label} onMouseMove={() => setI(n)} onClick={() => run(n)} className={`w-full h-[26px] px-4 flex items-center gap-2.5 text-left text-[13px] ${n === i ? 'bg-sakai/30 text-ink' : ''}`}>
              {!cmdMode && <FileIcon name={c.label.split('/').pop()!} size={13} />}
              <span className="truncate">{c.label}</span>
              {c.hint && <span className="ml-auto kbd truncate max-w-[160px]">{c.hint}</span>}
            </button>
          ))}
          {items.length === 0 && <p className="px-4 py-3 text-[12.5px] text-muted">{cmdMode || files.length ? 'No matching results' : 'Open a folder to search files.'}</p>}
        </div>
      </div>
    </div>
  )
}
