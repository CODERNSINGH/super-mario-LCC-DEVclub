import { useEffect, useRef, useState } from 'react'
import Editor, { DiffEditor } from '@monaco-editor/react'
import '../lib/monaco'
import { editorRef, langFor } from '../lib/monaco'
import { post } from '../lib/api'
import { useApp } from '../store'
import { useSession } from '../lib/session'
import { invalidateFiles } from '../lib/files'
import { refreshChanges } from '../lib/diff'

const opts = {
  fontSize: 13, fontFamily: '"SF Mono", Menlo, monospace', fontLigatures: false,
  minimap: { enabled: true, renderCharacters: false, scale: 1 }, scrollBeyondLastLine: false, automaticLayout: true,
  padding: { top: 8 }, renderLineHighlight: 'all' as const, smoothScrolling: true, cursorBlinking: 'smooth' as const, bracketPairColorization: { enabled: true },
  guides: { indentation: true }, stickyScroll: { enabled: false },
}

export function FileView({ path }: { path: string }) {
  const root = useApp((s) => s.localPath)!
  const [content, setContent] = useState<string | null>(null)
  const ed = useRef<Parameters<NonNullable<React.ComponentProps<typeof Editor>['onMount']>>[0] | null>(null)
  const id = `file:${path}`

  const rev = useSession((s) => s.rev)
  const stat = useSession((s) => s.stats[path])
  const decos = useRef<string[]>([])
  useEffect(() => { void post<{ content: string }>('/fs/read', { root, path }).then((r) => {
    if (ed.current) { if (!useSession.getState().dirty[id] && ed.current.getValue() !== r.content) ed.current.setValue(r.content) } else setContent(r.content)
  }).catch((e) => { if (!ed.current) setContent(`// ${e.message}`) }) }, [root, path, rev, id])
  useEffect(() => {
    const e = ed.current
    if (!e || content === null) return
    const n = e.getModel()?.getLineCount() ?? 1
    const list: import('monaco-editor').editor.IModelDeltaDecoration[] = []
    for (const l of stat?.added ?? []) if (l <= n) list.push({ range: { startLineNumber: l, startColumn: 1, endLineNumber: l, endColumn: 1 }, options: { isWholeLine: true, className: 'sk-add-line', linesDecorationsClassName: 'sk-add-gutter' } })
    for (const l of new Set(stat?.removedAt ?? [])) list.push({ range: { startLineNumber: Math.min(l, n), startColumn: 1, endLineNumber: Math.min(l, n), endColumn: 1 }, options: { isWholeLine: true, className: 'sk-del-mark', linesDecorationsClassName: 'sk-del-gutter', hoverMessage: { value: 'Lines removed here' } } })
    decos.current = e.deltaDecorations(decos.current, list)
  }, [stat, content, rev])

  const save = async () => {
    if (!ed.current) return
    await post('/fs/write', { root, path, content: ed.current.getValue() })
    invalidateFiles(root)
    const st = useSession.getState(); st.set({ dirty: { ...st.dirty, [id]: false } }); st.log(`✓ Saved ${path}`)
  }
  useEffect(() => {
    const h = () => { if (useSession.getState().active === id) void save() }
    window.addEventListener('sakai:save', h)
    return () => window.removeEventListener('sakai:save', h)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, root, path])

  if (content === null) return <div className="p-6 text-muted">Loading…</div>
  return (
    <Editor
      theme="sakai" path={path} language={langFor(path)} defaultValue={content} options={opts}
      onChange={() => { const st = useSession.getState(); if (!st.dirty[id]) st.set({ dirty: { ...st.dirty, [id]: true } }) }}
      onMount={(e, m) => {
        ed.current = e; editorRef.current = e
        void refreshChanges(root, 0)
        e.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => void save())
        e.onDidChangeCursorPosition((c) => useSession.getState().set({ cursor: { line: c.position.lineNumber, col: c.position.column } }))
        e.onDidFocusEditorText(() => { editorRef.current = e })
        if (editorRef.pending?.path === path) { e.revealLineInCenter(editorRef.pending.line); e.setPosition({ lineNumber: editorRef.pending.line, column: 1 }); editorRef.pending = null }
        e.focus()
      }}
    />
  )
}

export function DiffView({ path }: { path: string }) {
  const root = useApp((s) => s.localPath)!
  const [pair, setPair] = useState<[string, string] | null>(null)
  const rev = useSession((s) => s.rev)
  useEffect(() => {
    void Promise.all([post<{ content: string }>('/git/original', { root, path }), post<{ content: string }>('/fs/read', { root, path }).catch(() => ({ content: '' }))]).then(([a, b]) => setPair([a.content, b.content]))
  }, [root, path, rev])
  if (!pair) return <div className="p-6 text-muted">Loading diff…</div>
  return <DiffEditor theme="sakai" language={langFor(path)} original={pair[0]} modified={pair[1]} keepCurrentOriginalModel keepCurrentModifiedModel options={{ ...opts, readOnly: true, renderSideBySide: true, minimap: { enabled: false } }} />
}
