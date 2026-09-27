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
  const [stat, setStat] = useState<{ add: number; del: number; hunks: number }>({ add: 0, del: 0, hunks: 0 })
  const [cur, setCur] = useState(0)
  const [inline, setInline] = useState(false)
  const ed = useRef<import('monaco-editor').editor.IStandaloneDiffEditor | null>(null)
  const rev = useSession((s) => s.rev)
  useEffect(() => {
    void Promise.all([post<{ content: string }>('/git/original', { root, path }), post<{ content: string }>('/fs/read', { root, path }).catch(() => ({ content: '' }))]).then(([a, b]) => setPair([a.content, b.content]))
  }, [root, path, rev])

  const measure = () => {
    const changes = ed.current?.getLineChanges() ?? []
    setStat({
      hunks: changes.length,
      add: changes.reduce((n, c) => n + (c.modifiedEndLineNumber === 0 ? 0 : c.modifiedEndLineNumber - c.modifiedStartLineNumber + 1), 0),
      del: changes.reduce((n, c) => n + (c.originalEndLineNumber === 0 ? 0 : c.originalEndLineNumber - c.originalStartLineNumber + 1), 0),
    })
  }
  const go = (dir: 'next' | 'previous') => { ed.current?.goToDiff(dir); setCur((c) => Math.max(1, Math.min(stat.hunks, c + (dir === 'next' ? 1 : -1)))) }

  if (!pair) return <div className="p-6 text-muted">Loading diff…</div>
  const btn = 'h-6 px-2 rounded border border-line hover:border-sakai text-[11px] text-fg'
  return (
    <div className="h-full flex flex-col">
      <div className="h-8 shrink-0 px-3 flex items-center gap-3 border-b border-line bg-panel text-[12px]">
        <span className="font-mono text-ink truncate">{path}</span>
        <span className="font-mono text-[#3fb950] font-semibold">+{stat.add}</span>
        <span className="font-mono text-[#e5484d] font-semibold">−{stat.del}</span>
        <span className="text-muted">{stat.hunks} {stat.hunks === 1 ? 'change' : 'changes'}</span>
        <span className="flex-1" />
        <button className={btn} onClick={() => go('previous')} title="Previous change (⇧F3)">↑ Prev</button>
        <button className={btn} onClick={() => go('next')} title="Next change (F3)">↓ Next{stat.hunks ? ` (${Math.min(cur + 1, stat.hunks)}/${stat.hunks})` : ''}</button>
        <button className={btn} onClick={() => setInline((v) => !v)}>{inline ? 'Side by side' : 'Inline'}</button>
      </div>
      <div className="flex-1 min-h-0">
        <DiffEditor
          theme="sakai" language={langFor(path)} original={pair[0]} modified={pair[1]} keepCurrentOriginalModel keepCurrentModifiedModel
          options={{ ...opts, readOnly: true, renderSideBySide: !inline, useInlineViewWhenSpaceIsLimited: false, renderSideBySideInlineBreakpoint: 200, renderIndicators: true, ignoreTrimWhitespace: false, minimap: { enabled: false }, hideUnchangedRegions: { enabled: false } }}
          onMount={(e) => {
            ed.current = e
            // Jump to the first change as soon as the diff is computed, so the user lands on what changed.
            const d = e.onDidUpdateDiff(() => { measure(); setCur(1); if ((e.getLineChanges() ?? []).length) e.revealFirstDiff(); })
            e.onDidDispose(() => d.dispose())
          }}
        />
      </div>
    </div>
  )
}
