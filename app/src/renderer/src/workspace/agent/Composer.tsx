import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, AtSign, Slash } from 'lucide-react'
import { useApp } from '../../store'
import { useSession } from '../../lib/session'
import { allFiles } from '../../lib/files'
import { sendMessage, stopSession, resetChat } from '../../lib/chat'
import { FileIcon } from '../../ui/icons'
import * as A from '../../lib/actions'

const SLASH = [
  { cmd: '/solve', desc: 'Open the task form to solve an issue' },
  { cmd: '/explain', desc: 'Explain this repository or a file' },
  { cmd: '/tests', desc: 'Run the tests and report results' },
  { cmd: '/stop', desc: 'Stop the agent' },
  { cmd: '/clear', desc: 'Start a fresh conversation' },
]

export function Composer({ running }: { running: boolean }) {
  const { localPath } = useApp()
  const s = useSession()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [sel, setSel] = useState(0)
  const ta = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (localPath) void allFiles(localPath).then(setFiles).catch(() => undefined) }, [localPath, s.ready])
  // Prefill from elsewhere ("Ask Sakai about…").
  useEffect(() => { if (s.composerText) { setText(s.composerText); s.set({ composerText: '' }); ta.current?.focus() } }, [s.composerText]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = ta.current; if (el) { el.style.height = '0px'; el.style.height = Math.min(el.scrollHeight, 150) + 'px' } }, [text])

  const slash = text.startsWith('/') && !text.includes(' ') ? SLASH.filter((c) => c.cmd.startsWith(text.toLowerCase())) : []
  const mention = /(?:^|\s)@([^\s@]*)$/.exec(text)
  const hits = useMemo(() => (mention ? files.filter((f) => f.toLowerCase().includes(mention[1].toLowerCase())).slice(0, 7) : []), [mention?.[1], files]) // eslint-disable-line react-hooks/exhaustive-deps
  const menu = slash.length ? 'slash' : hits.length ? 'file' : null
  const n = menu === 'slash' ? slash.length : hits.length

  function pickMention(f: string) { setText(text.replace(/@([^\s@]*)$/, `@${f} `)); setSel(0); ta.current?.focus() }

  async function submit() {
    const t = text.trim()
    if (!t || !localPath) return
    setText(''); setSel(0)
    const [cmd, ...rest] = t.split(/\s+/); const arg = rest.join(' ')
    if (cmd === '/solve') return void s.set({ agentView: 'task', goal: arg || s.goal })
    if (cmd === '/stop') return void stopSession(localPath)
    if (cmd === '/clear') return void resetChat(localPath)
    if (cmd === '/explain') return void sendMessage(localPath, arg ? `Explain: ${arg}` : 'Explain this repository: its purpose, structure and the main flow of the code.')
    if (cmd === '/tests') return void sendMessage(localPath, 'Run the test suite and summarise what passes and fails.')
    s.set({ agentView: 'chat' })
    await sendMessage(localPath, t)
  }

  function onKey(e: React.KeyboardEvent) {
    if (menu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setSel((x) => (x + (e.key === 'ArrowDown' ? 1 : -1) + n) % n); return }
    if (menu && (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey))) {
      e.preventDefault()
      if (menu === 'slash') { const c = slash[sel]; if (c.cmd === text.toLowerCase()) void submit(); else setText(c.cmd + ' ') } else pickMention(hits[sel])
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit() }
    if (e.key === 'Escape') setSel(0)
  }

  function onPaste(e: React.ClipboardEvent) {
    const m = e.clipboardData.getData('text').match(/github\.com\/[^/\s]+\/[^/\s]+\/issues\/(\d+)/)
    if (!m) return
    const issue = s.issues.find((i) => i.number === Number(m[1]))
    if (issue) { e.preventDefault(); s.set({ picked: issue, agentView: 'task' }) }
  }

  return (
    <div className="shrink-0 p-3 pt-1 relative">
      {menu && (
        <div className="absolute left-3 right-3 bottom-full mb-1 rounded-lg border border-line2 bg-panel shadow-[0_8px_30px_rgba(0,0,0,.6)] overflow-hidden fadein z-10">
          {menu === 'slash' ? slash.map((c, i) => <button key={c.cmd} onMouseDown={(e) => { e.preventDefault(); setText(c.cmd + ' '); ta.current?.focus() }} className={`w-full h-8 px-3 flex items-center gap-3 text-left text-[12.5px] ${i === sel ? 'bg-sakai/25' : 'hover:bg-hover'}`}><span className="font-mono text-ink">{c.cmd}</span><span className="text-muted text-[12px]">{c.desc}</span></button>)
            : hits.map((f, i) => <button key={f} onMouseDown={(e) => { e.preventDefault(); pickMention(f) }} className={`w-full h-7 px-3 flex items-center gap-2 text-left text-[12.5px] ${i === sel ? 'bg-sakai/25' : 'hover:bg-hover'}`}><FileIcon name={f.split('/').pop()!} size={13} /><span className="font-mono truncate text-ink">{f}</span></button>)}
        </div>
      )}
      <div className={`rounded-xl border bg-bg transition-colors ${localPath ? 'border-line2 focus-within:border-sakai' : 'border-line opacity-60'}`}>
        <textarea ref={ta} rows={1} value={text} disabled={!localPath} onChange={(e) => { setText(e.target.value); setSel(0) }} onKeyDown={onKey} onPaste={onPaste} spellCheck={false}
          placeholder={!localPath ? 'Open a folder to chat with Sakai' : running ? 'Sakai is working — type to guide it…' : 'Ask Sakai anything · / for commands · @ to mention a file'}
          className="w-full px-3 pt-2.5 pb-1 bg-transparent outline-none resize-none text-[13px] text-ink placeholder:text-faint leading-[1.5] max-h-[150px]" />
        <div className="flex items-center gap-1 px-2 pb-2">
          <button title="Mention a file" onClick={() => { setText((t) => t + (t && !t.endsWith(' ') ? ' @' : '@')); ta.current?.focus() }} className="w-6 h-6 grid place-items-center rounded text-muted hover:text-ink hover:bg-hover"><AtSign size={14} /></button>
          <button title="Commands" onClick={() => { setText('/'); ta.current?.focus() }} className="w-6 h-6 grid place-items-center rounded text-muted hover:text-ink hover:bg-hover"><Slash size={14} /></button>
          <button title="New task" onClick={A.newTask} className="h-6 px-2 rounded text-[11px] text-muted hover:text-ink hover:bg-hover">Task…</button>
          <span className="ml-auto text-[10.5px] text-faint mr-1 whitespace-nowrap overflow-hidden text-ellipsis min-w-0">{running ? '↵ queue message' : '↵ send · ⇧↵ newline'}</span>
          <button title="Send" disabled={!text.trim() || !localPath} onClick={() => void submit()} className="w-7 h-7 grid place-items-center rounded-lg bg-sakai text-ink disabled:opacity-30 hover:bg-sakai-hover"><ArrowUp size={15} /></button>
        </div>
      </div>
    </div>
  )
}
