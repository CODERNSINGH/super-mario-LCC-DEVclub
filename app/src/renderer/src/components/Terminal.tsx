import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useSession } from '../lib/session'

export function Terminal({ cwd, visible }: { cwd: string | null; visible: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const idRef = useRef(0)
  const cwdRef = useRef(cwd)

  useEffect(() => {
    const term = new XTerm({
      fontFamily: '"SF Mono", Menlo, monospace', fontSize: 12, cursorBlink: true, allowProposedApi: true,
      theme: { background: '#111113', foreground: '#d8d8da', cursor: '#bc002d', selectionBackground: '#bc002d55', black: '#111113', red: '#bc002d' },
    })
    const fit = new FitAddon()
    fitRef.current = fit
    term.loadAddon(fit)
    term.open(host.current!)
    fit.fit()
    let id = 0
    let off = () => {}
    void window.sakai.term.create(cwd, term.cols, term.rows).then((i) => {
      id = i
      idRef.current = i
      useSession.getState().set({ termId: i })
      off = window.sakai.term.onData((tid, d) => { if (tid === id) term.write(d) })
      term.onData((d) => window.sakai.term.write(id, d))
      term.onResize(({ cols, rows }) => window.sakai.term.resize(id, cols, rows))
    })
    const ro = new ResizeObserver(() => { try { fit.fit() } catch { /* hidden */ } })
    ro.observe(host.current!)
    return () => { ro.disconnect(); off(); if (id) window.sakai.term.kill(id); term.dispose() }
  }, []) // one shell for the whole session; cwd changes are handled below

  // When the repo finishes cloning, move the existing shell there instead of replacing it (keeps user's typing/history).
  useEffect(() => {
    if (cwd && cwd !== cwdRef.current && idRef.current) {
      window.sakai.term.write(idRef.current, `cd '${cwd.replace(/'/g, `'\\''`)}' && clear\r`)
      cwdRef.current = cwd
    }
  }, [cwd])

  useEffect(() => { if (visible) requestAnimationFrame(() => fitRef.current?.fit()) }, [visible])

  return <div ref={host} className="h-full w-full px-3 py-1" />
}
