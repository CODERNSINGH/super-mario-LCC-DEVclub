import { X, ChevronRight, Sparkles, Terminal as TermIcon, FileSearch, Command, FolderOpen, GitBranch, FlaskConical, Plug } from 'lucide-react'
import { useApp } from '../store'
import { useSession } from '../lib/session'
import { FileView, DiffView } from '../components/Editors'
import { FileIcon } from '../ui/icons'
import { Button } from '../components/ui'
import * as A from '../lib/actions'
import { getRecent, clearRecent } from '../lib/recent'
import { Mascot } from '../ui/Mascot'
import { ProfilePicker } from '../ui/ProfilePicker'
import { TipToast } from './Tips'

function Breadcrumbs({ path, diff }: { path: string; diff?: boolean }) {
  const { repo, localPath } = useApp()
  const parts = [repo?.split('/')[1] ?? localPath?.split('/').pop() ?? '', ...path.split('/')]
  return (
    <div className="h-[22px] shrink-0 px-3 flex items-center gap-0.5 text-[12px] text-muted bg-bg border-b border-line/60 overflow-hidden whitespace-nowrap">
      {parts.map((p, i) => <span key={i} className="flex items-center gap-0.5">{i > 0 && <ChevronRight size={12} className="text-faint" />}<span className={i === parts.length - 1 ? 'text-fg' : ''}>{p}</span></span>)}
      {diff && <span className="ml-2 text-[10px] uppercase tracking-wider text-sakai">working tree</span>}
    </div>
  )
}

function Watermark() {
  const rows: [string, string, React.ReactNode][] = [['Show All Commands', '⇧⌘P', <Command size={13} />], ['Go to File', '⌘P', <FileSearch size={13} />], ['Toggle Terminal', '⌃`', <TermIcon size={13} />], ['Ask Sakai', '⌥⌘B', <Sparkles size={13} />]]
  return (
    <div className="h-full grid place-items-center">
      <div className="flex flex-col items-center opacity-90">
        <Mascot size={120} className="opacity-40" />
        <div className="mt-6 space-y-2">{rows.map(([l, k, ic]) => <div key={l} className="flex items-center gap-6 text-[12.5px] text-muted"><span className="w-44 flex items-center gap-2">{ic}{l}</span><span className="kbd">{k}</span></div>)}</div>
      </div>
    </div>
  )
}

function Welcome() {
  const { repo, mode, localPath } = useApp()
  const recent = getRecent()
  const tile = (icon: React.ReactNode, title: string, sub: string, fn: () => void) => (
    <button onClick={fn} className="group flex items-center gap-3 text-left p-3 rounded-lg border border-line bg-panel hover:border-sakai/70 hover:bg-raised transition-colors">
      <span className="w-9 h-9 grid place-items-center rounded-md bg-sakai/15 text-sakai">{icon}</span>
      <span><span className="block text-ink text-[13px] font-medium">{title}</span><span className="block text-[12px] text-muted">{sub}</span></span>
    </button>
  )
  const steps = [['1', 'Connect a model', 'Groq, DeepSeek, Qwen, OpenAI, Anthropic — or Ollama / LM Studio locally.'], ['2', 'Pick or describe a task', 'Choose a GitHub issue or type what to build or fix.'], ['3', 'Review the verified diff', 'Sakai edits, runs your tests, then you open a PR or commit locally.']]
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-[860px] mx-auto px-10 py-10 fade">
        <div className="flex items-center gap-5"><Mascot size={96} /><div><h1 className="text-[30px] font-semibold text-ink tracking-tight">Sakai</h1><p className="text-muted text-[14px]">An autonomous engineer for your repository{repo ? ` — ${repo}` : localPath ? ` — ${localPath.split('/').pop()}` : ''}</p></div></div>
        <div className="mt-8 grid grid-cols-[1.2fr_1fr] gap-10">
          <div>
            <h2 className="text-[13px] font-semibold text-ink mb-3">Start</h2>
            <div className="grid gap-2">
              {tile(<Sparkles size={18} />, 'New task', 'Describe a bug or feature for Sakai to solve', A.newTask)}
              {tile(<FolderOpen size={18} />, 'Open folder…', 'Work on any project on this Mac — no login needed', () => void A.pickAndOpenFolder())}
              {tile(<GitBranch size={18} />, 'Clone from GitHub…', 'Pick a repository and solve its issues', A.closeFolder)}
              {tile(<FlaskConical size={18} />, 'Try the demo project', 'A tiny calculator with planted bugs', () => void A.openDemoProject())}
            </div>
            {mode === 'local' && !localPath && <p className="mt-3 text-[12px] text-sakai">No folder is open. Choose “Open folder…” to begin.</p>}
          </div>
          <div>
            <div className="flex items-center justify-between mb-3"><h2 className="text-[13px] font-semibold text-ink">Recent</h2>{recent.length > 0 && <button onClick={() => { clearRecent(); A.openWelcome() }} className="text-[11px] text-muted hover:text-ink">Clear</button>}</div>
            {recent.length === 0 && <p className="text-[12.5px] text-faint">Nothing yet.</p>}
            {recent.map((r) => <button key={r.value} onClick={() => (r.kind === 'local' ? void A.openLocalFolder(r.value) : useApp.getState().set({ repoInput: r.value, step: 'repo' }))} className="block w-full text-left h-7 truncate text-[12.5px] text-sakai hover:underline underline-offset-2 font-mono">{r.value.replace(/^\/Users\/[^/]+/, '~')}</button>)}
            <h2 className="text-[13px] font-semibold text-ink mt-7 mb-3">Walkthrough</h2>
            <div className="space-y-2">{steps.map(([n, t, d]) => <div key={n} className="flex gap-3 p-2.5 rounded-lg border border-line bg-panel/60"><span className="w-5 h-5 shrink-0 rounded-full bg-sakai text-ink text-[11px] font-semibold grid place-items-center">{n}</span><div><div className="text-[12.5px] text-ink">{t}</div><div className="text-[11.5px] text-muted leading-snug">{d}</div></div></div>)}</div>
          </div>
        </div>
        <div className="mt-10 text-[11.5px] text-faint flex items-center gap-1.5"><Plug size={12} />Integrations for AWS, GitLab, Jira and more are coming soon.</div>
      </div>
    </div>
  )
}

function SettingsTab() {
  const { user, llm, repo, localPath, set, tipsOn, setTipsOn } = useApp()
  const s = useSession()
  const row = (k: string, v: string, action?: React.ReactNode) => <div className="flex items-center gap-4 py-3 border-b border-line"><div className="w-40 text-muted text-[12.5px]">{k}</div><div className="flex-1 text-ink text-[13px] break-all selectable">{v}</div>{action}</div>
  return (
    <div className="h-full overflow-auto"><div className="max-w-[720px] mx-auto px-10 py-10 fade">
      <h1 className="text-[22px] font-semibold text-ink mb-6">Settings</h1>
      {row('GitHub account', user ? `@${user.login}` : 'Not connected', user ? <Button variant="ghost" className="h-7 text-xs" onClick={async () => { await window.sakai.github.signOut(); set({ user: null }) }}>Sign out</Button> : <Button variant="ghost" className="h-7 text-xs" onClick={() => set({ step: 'github' })}>Sign in</Button>)}
      {row('Repository', repo ?? '—')}
      {row('Local path', localPath ?? '—')}
      {row('Model', llm ? `${llm.provider} · ${llm.model}` : '—', <Button variant="ghost" className="h-7 text-xs" onClick={A.changeModel}>Change</Button>)}
      <div className="py-3 border-b border-line"><div className="text-muted text-[12.5px] mb-2">Who's coding today?</div><ProfilePicker compact /></div>
      {row('Learning pop-ups', tipsOn ? 'On — short tips while Sakai works.' : 'Off', <Button variant="ghost" className="h-7 text-xs" onClick={() => setTipsOn(!tipsOn)}>{tipsOn ? 'Turn off' : 'Turn on'}</Button>)}
      {row('Default step limit', String(s.stepLimit))}
      {row('Layout', 'Panel sizes are saved automatically.', <Button variant="ghost" className="h-7 text-xs" onClick={() => { try { localStorage.removeItem('sakai.layout') } catch { /* ignore */ } s.set({ sideW: 264, agentW: 400, panelH: 220 }) }}>Reset</Button>)}
      <p className="mt-6 text-[12px] text-muted leading-relaxed">API keys and your GitHub token are stored only on this Mac, in the app’s private data folder. Model usage is billed by your provider.</p>
    </div></div>
  )
}

export function EditorArea() {
  const s = useSession()
  const root = useApp((a) => a.localPath)
  const tab = s.tabs.find((t) => t.id === s.active)
  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-bg">
      <div className="h-[35px] shrink-0 flex bg-panel border-b border-line overflow-x-auto overflow-y-hidden">
        {s.tabs.map((t) => {
          const on = t.id === s.active
          return (
            <div key={t.id} onClick={() => s.set({ active: t.id })} onAuxClick={() => s.closeTab(t.id)} className={`group relative h-full pl-3 pr-1.5 flex items-center gap-2 border-r border-line text-[13px] shrink-0 cursor-default ${on ? 'bg-bg text-ink' : 'text-muted hover:text-fg'}`}>
              {on && <span className="absolute top-0 left-0 right-0 h-[2px] bg-sakai" />}
              {t.kind === 'welcome' ? <Mascot size={16} animate={false} /> : t.kind === 'settings' ? <span className="text-[11px]">⚙</span> : <FileIcon name={t.title.replace(/ \(.*\)$/, '')} />}
              <span className={t.kind === 'diff' ? 'italic' : ''}>{t.title}</span>
              {t.kind === 'diff' && <span title="Changed by Sakai — live diff" className="w-1.5 h-1.5 rounded-full bg-add" />}
              <button onClick={(e) => { e.stopPropagation(); s.closeTab(t.id) }} className={`w-5 h-5 grid place-items-center rounded hover:bg-line2 ${s.dirty[t.id] ? '' : on ? '' : 'opacity-0 group-hover:opacity-100'}`}>
                {s.dirty[t.id] ? <span className="w-2 h-2 rounded-full bg-fg group-hover:hidden" /> : null}<X size={13} className={s.dirty[t.id] ? 'hidden group-hover:block' : ''} />
              </button>
            </div>
          )
        })}
      </div>
      {tab && (tab.kind === 'file' || tab.kind === 'diff') && <Breadcrumbs path={tab.path!} diff={tab.kind === 'diff'} />}
      <div className="flex-1 min-h-0 relative">
        {!tab ? <Watermark /> : tab.kind === 'welcome' ? <Welcome /> : tab.kind === 'settings' ? <SettingsTab /> : tab.kind === 'file' ? <FileView key={tab.id} path={tab.path!} /> : <DiffView key={tab.id} path={tab.path!} />}
        <TipToast root={root} />
      </div>
    </div>
  )
}
