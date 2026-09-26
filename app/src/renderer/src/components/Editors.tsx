import { useEffect, useRef, useState } from 'react'
import Editor, { DiffEditor } from '@monaco-editor/react'
import '../lib/monaco'
import { langFor } from '../lib/monaco'
import { post } from '../lib/api'
import { useApp } from '../store'
import { useSession } from '../lib/session'

const opts = { fontSize: 13, fontFamily: '"SF Mono", Menlo, monospace', minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 10 } }

export function FileView({ path }: { path: string }) {
  const root = useApp((s) => s.localPath)!
  const [content, setContent] = useState<string | null>(null)
  const latest = useRef('')
  useEffect(() => { void post<{ content: string }>('/fs/read', { root, path }).then((r) => setContent(r.content)).catch((e) => setContent(`// ${e.message}`)) }, [root, path])
  if (content === null) return <div className="p-6 text-muted">Loading…</div>
  const id = `file:${path}`
  return (
    <Editor
      theme="sakai" path={path} language={langFor(path)} value={content} options={{ ...opts, readOnly: false }}
      onChange={(v) => { latest.current = v ?? ''; const st = useSession.getState(); if (!st.dirty[id]) st.set({ dirty: { ...st.dirty, [id]: true } }) }}
      onMount={(ed, m) => ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, async () => {
        await post('/fs/write', { root, path, content: ed.getValue() })
        const st = useSession.getState(); st.set({ dirty: { ...st.dirty, [id]: false } }); st.log(`✓ Saved ${path}`)
      })}
    />
  )
}

export function DiffView({ path }: { path: string }) {
  const root = useApp((s) => s.localPath)!
  const [pair, setPair] = useState<[string, string] | null>(null)
  useEffect(() => {
    void Promise.all([post<{ content: string }>('/git/original', { root, path }), post<{ content: string }>('/fs/read', { root, path }).catch(() => ({ content: '' }))]).then(([a, b]) => setPair([a.content, b.content]))
  }, [root, path])
  if (!pair) return <div className="p-6 text-muted">Loading diff…</div>
  return <DiffEditor theme="sakai" language={langFor(path)} original={pair[0]} modified={pair[1]} options={{ ...opts, readOnly: true, renderSideBySide: true }} />
}
