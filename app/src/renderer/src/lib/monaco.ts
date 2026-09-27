import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import cssWorker from 'monaco-editor/language/css/css.worker.js?worker'
import htmlWorker from 'monaco-editor/language/html/html.worker.js?worker'

self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    return new editorWorker()
  },
}

loader.config({ monaco })

monaco.editor.defineTheme('sakai', {
  base: 'vs-dark', inherit: true, rules: [],
  colors: {
    'editor.background': '#0b0b0c', 'editorGutter.background': '#0b0b0c',
    'editor.lineHighlightBackground': '#131316', 'editorLineNumber.foreground': '#4a4a52', 'editorLineNumber.activeForeground': '#d8d8da',
    'editor.selectionBackground': '#bc002d55', 'editorCursor.foreground': '#bc002d',
    'editorWidget.background': '#111113', 'editorWidget.border': '#1f1f23',
    'diffEditor.insertedTextBackground': '#2ea04366', 'diffEditor.removedTextBackground': '#e5484d66',
    'diffEditor.insertedLineBackground': '#2ea04326', 'diffEditor.removedLineBackground': '#e5484d26',
    'diffEditorGutter.insertedLineBackground': '#2ea04355', 'diffEditorGutter.removedLineBackground': '#e5484d55',
    'diffEditor.border': '#1f1f23', 'diffEditor.diagonalFill': '#1f1f23',
    'scrollbarSlider.background': '#26262b80',
  },
})

export const langFor = (path: string): string => {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return ({ ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', json: 'json', py: 'python', go: 'go', rs: 'rust', java: 'java', md: 'markdown', css: 'css', html: 'html', yml: 'yaml', yaml: 'yaml', sh: 'shell', rb: 'ruby', php: 'php', c: 'c', cpp: 'cpp', cs: 'csharp', kt: 'kotlin', swift: 'swift' } as Record<string, string>)[ext] ?? 'plaintext'
}

// Shared handle to the focused editor so menus/search/outline can drive it.
import type { editor } from 'monaco-editor'
export const editorRef: { current: editor.IStandaloneCodeEditor | null; pending: { path: string; line: number } | null } = { current: null, pending: null }
export function revealLine(path: string, line: number) {
  editorRef.pending = { path, line }
  editorRef.current?.revealLineInCenter(line)
}
export function runEditorAction(id: string) { editorRef.current?.focus(); void editorRef.current?.getAction(id)?.run() }
