import { useEffect, useState } from 'react'
import { FolderOpen, FlaskConical, ArrowRight, TriangleAlert } from 'lucide-react'
import { useApp } from '../store'
import { Onboard } from '../components/Onboard'
import { Button } from '../components/ui'
import { GithubMark } from '../ui/brand'
import { getRecent } from '../lib/recent'
import { system, type SystemCheck } from '../lib/bridge'
import { openDemoProject, pickAndOpenFolder, openLocalFolder } from '../lib/actions'

export function RepoScreen() {
  const { repoInput, set } = useApp()
  const [err, setErr] = useState('')
  const [sys, setSys] = useState<SystemCheck | null>(null)
  const recent = getRecent().slice(0, 3)

  useEffect(() => { void system.check().then(setSys).catch(() => undefined) }, [])

  async function next() {
    const repo = await window.sakai.repo.parse(repoInput)
    if (!repo) return setErr('Enter a GitHub URL like https://github.com/owner/repo, or owner/repo')
    set({ repo, mode: 'github', localPath: null, step: 'github' })
  }

  const option = (icon: React.ReactNode, title: string, desc: string, onClick: () => void) => (
    <button onClick={onClick} className="group text-left p-3.5 rounded-xl border border-line bg-panel/80 hover:border-sakai/70 hover:bg-raised transition-all">
      <span className="text-sakai">{icon}</span>
      <div className="mt-2 text-ink font-medium text-[13px] flex items-center gap-1">{title}<ArrowRight size={13} className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" /></div>
      <div className="mt-0.5 text-[12px] text-muted leading-snug">{desc}</div>
    </button>
  )

  return (
    <Onboard hero step="repo" title="Fix GitHub issues, autonomously." subtitle="Point Sakai at a repository. It reads the code, edits it, runs your tests and hands you a verified change.">
      {sys && (!sys.git || !sys.online) && (
        <div className="mb-3 flex gap-2 items-start rounded-lg border border-sakai/50 bg-sakai/10 px-3 py-2 text-[12px] text-fg">
          <TriangleAlert size={14} className="text-sakai mt-0.5 shrink-0" />
          <span>{!sys.git ? <>Git isn’t installed. Open Terminal and run <span className="font-mono text-ink">xcode-select --install</span>, then reopen Sakai.</> : 'You appear to be offline — GitHub and hosted models need a connection (local folders and Ollama still work).'}</span>
        </div>
      )}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 h-11 px-3 rounded-lg bg-panel border border-line focus-within:border-sakai transition-colors">
          <span className="text-muted"><GithubMark size={16} /></span>
          <input autoFocus value={repoInput} onChange={(e) => { set({ repoInput: e.target.value }); setErr('') }} onKeyDown={(e) => e.key === 'Enter' && next()} placeholder="https://github.com/owner/repo" spellCheck={false}
            className="flex-1 bg-transparent outline-none font-mono text-[13px] text-ink placeholder:text-faint" />
        </div>
        <Button className="h-11 px-5" onClick={next} disabled={!repoInput.trim()}>Continue</Button>
      </div>
      {err && <p className="mt-2 text-sakai text-xs">{err}</p>}

      <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-widest text-faint"><span className="flex-1 h-px bg-line" />or skip GitHub<span className="flex-1 h-px bg-line" /></div>
      <div className="grid grid-cols-2 gap-3">
        {option(<FolderOpen size={20} strokeWidth={1.6} />, 'Open a local folder', 'No login needed. Test Sakai on any project on your Mac.', () => void pickAndOpenFolder())}
        {option(<FlaskConical size={20} strokeWidth={1.6} />, 'Try the demo project', 'A small calculator with planted bugs to solve.', () => void openDemoProject())}
      </div>

      {recent.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-widest text-faint mb-1.5">Recent</div>
          {recent.map((r) => (
            <button key={r.value} onClick={() => r.kind === 'github' ? set({ repoInput: r.value }) : void openLocalFolder(r.value)} className="flex items-center gap-2 w-full h-8 px-2 rounded-md hover:bg-panel text-left">
              <span className="text-faint">{r.kind === 'github' ? <GithubMark size={13} /> : <FolderOpen size={13} />}</span>
              <span className="font-mono text-[12px] text-fg truncate">{r.value}</span>
            </button>
          ))}
        </div>
      )}
    </Onboard>
  )
}
