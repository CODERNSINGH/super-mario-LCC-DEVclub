import { useState } from 'react'
import { useApp } from '../store'
import { useSession } from '../lib/session'
import { addQuick, removeQuick, runInTerminal, useQuick } from '../lib/quick'
import { Button } from '../components/ui'

const inp = 'w-full h-8 px-2 rounded-md bg-bg border border-line focus:border-sakai outline-none text-[12px] text-ink'

/** Customizable one-click terminal commands. */
export function QuickPane() {
  const cmds = useQuick()
  const s = useSession()
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  return (
    <div className="px-3 space-y-3">
      <p className="text-[11.5px] text-muted leading-relaxed">One-click commands run in the integrated terminal. Add your own — they are saved on this machine.</p>
      {s.testCommand && (
        <button onClick={() => runInTerminal(s.set, s.termId, s.testCommand)} className="w-full text-left px-3 py-2 rounded-md border border-line hover:border-sakai">
          <div className="text-ink">Run tests</div><div className="font-mono text-[11px] text-muted truncate">{s.testCommand}</div>
        </button>
      )}
      {cmds.map((c) => (
        <div key={c.id} className="group flex items-stretch gap-1">
          <button onClick={() => runInTerminal(s.set, s.termId, c.command)} className="flex-1 min-w-0 text-left px-3 py-2 rounded-md border border-line hover:border-sakai">
            <div className="text-ink">{c.name}</div><div className="font-mono text-[11px] text-muted truncate">{c.command}</div>
          </button>
          {!c.builtin && <button onClick={() => removeQuick(c.id)} className="px-2 text-muted hover:text-sakai" title="Remove">×</button>}
        </div>
      ))}
      <div className="border-t border-line pt-3 space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-muted">Add command</div>
        <input className={inp} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={`${inp} font-mono`} placeholder="npm run lint" value={command} onChange={(e) => setCommand(e.target.value)} />
        <Button variant="ghost" className="w-full h-8" disabled={!name.trim() || !command.trim()} onClick={() => { addQuick(name.trim(), command.trim()); setName(''); setCommand('') }}>Add</Button>
      </div>
    </div>
  )
}

export function SettingsPane() {
  const { user, llm, repo, localPath, set } = useApp()
  const row = (k: string, v: string) => <div className="py-2 border-b border-line"><div className="text-[11px] uppercase tracking-wider text-muted">{k}</div><div className="text-ink mt-0.5 break-all">{v}</div></div>
  return (
    <div className="px-4">
      {row('GitHub', user ? `@${user.login}` : 'Not connected')}
      {row('Repository', repo ?? '—')}
      {row('Local path', localPath ?? '—')}
      {row('Model', llm ? `${llm.provider} · ${llm.model}` : '—')}
      <div className="mt-4 space-y-2">
        <Button variant="ghost" className="w-full" onClick={() => set({ step: 'llm' })}>Change model</Button>
        <Button variant="ghost" className="w-full" onClick={() => set({ step: 'repo' })}>Open another repository</Button>
        <Button variant="ghost" className="w-full" onClick={async () => { await window.sakai.github.signOut(); set({ user: null, step: 'repo' }) }}>Sign out of GitHub</Button>
      </div>
      <p className="mt-4 text-[11px] text-muted">Keys are stored in the macOS Keychain. Sakai never sends your code anywhere except the model provider you selected.</p>
    </div>
  )
}
