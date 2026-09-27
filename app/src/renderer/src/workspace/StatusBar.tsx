import { Bell, GitBranch, RefreshCw, CircleX, TriangleAlert, Sparkles, Loader2 } from 'lucide-react'
import { useApp } from '../store'
import { useSession } from '../lib/session'
import { useChat } from '../lib/chat'
import { langFor } from '../lib/monaco'
import { ProfileChip } from '../ui/ProfilePicker'
import * as A from '../lib/actions'

const LANG: Record<string, string> = { typescript: 'TypeScript', javascript: 'JavaScript', json: 'JSON', markdown: 'Markdown', python: 'Python', plaintext: 'Plain Text', css: 'CSS', html: 'HTML', yaml: 'YAML', shell: 'Shell Script', go: 'Go', rust: 'Rust', java: 'Java' }

export function StatusBar() {
  const { llm, localPath } = useApp()
  const s = useSession()
  const chat = useChat(localPath)
  const tab = s.tabs.find((t) => t.id === s.active)
  const isFile = tab?.kind === 'file'
  const cell = 'h-full px-2 flex items-center gap-1 hover:bg-black/20'
  return (
    <footer className="h-[22px] shrink-0 bg-sakai text-ink text-[12px] flex items-center select-none">
      <button className={cell} title="Branch" onClick={() => A.showSide('scm')}><GitBranch size={13} />{s.branch || 'main'}</button>
      <button className={cell} title="Synchronize Changes" onClick={() => A.showSide('scm')}><RefreshCw size={12} /></button>
      <button className={cell} title="Problems" onClick={() => A.showPanel('problems')}><CircleX size={13} />{s.problems.filter((p) => p.severity === 'error').length}<TriangleAlert size={13} className="ml-1" />{s.problems.filter((p) => p.severity === 'warning').length}</button>
      {chat.phase === 'running' && <button className={`${cell} bg-black/20`} onClick={() => A.showPanel('output')}><Loader2 size={12} className="spin" /><span className="max-w-[320px] truncate">{s.activity || 'Sakai is working…'}</span></button>}
      <div className="flex-1" />
      {isFile && <><span className={cell}>Ln {s.cursor.line}, Col {s.cursor.col}</span><span className={cell}>Spaces: 2</span><span className={cell}>UTF-8</span><span className={cell}>LF</span><span className={cell}>{`{ } ${LANG[langFor(tab!.path!)] ?? 'Plain Text'}`}</span></>}
      <ProfileChip cell={cell} />
      <button className={cell} title="Change Model" onClick={A.changeModel}><Sparkles size={12} />{llm?.provider} · {llm?.model}</button>
      <button className={cell} title="Notifications"><Bell size={13} /></button>
    </footer>
  )
}
