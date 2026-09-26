import { useState } from 'react'
import { useApp } from '../store'
import { Button, Logo, Steps } from '../components/ui'
import { getRecent } from '../lib/recent'

export function RepoScreen() {
  const { repoInput, set } = useApp()
  const [err, setErr] = useState('')

  async function next() {
    const repo = await window.sakai.repo.parse(repoInput)
    if (!repo) return setErr('Enter a GitHub URL or owner/name')
    set({ repo, step: 'github' })
  }

  return (
    <div>
      <Logo size={36} />
      <h1 className="mt-8 text-2xl text-ink font-semibold">Which repository should Sakai work on?</h1>
      <p className="mt-2 text-muted">Paste a GitHub link. Sakai will clone it, read its open issues and solve the one you pick.</p>
      <div className="mt-6"><Steps current={0} /></div>
      <input
        autoFocus
        value={repoInput}
        onChange={(e) => { set({ repoInput: e.target.value }); setErr('') }}
        onKeyDown={(e) => e.key === 'Enter' && next()}
        placeholder="https://github.com/owner/repo"
        className="w-full h-10 px-3 rounded-md bg-panel border border-line focus:border-sakai outline-none font-mono text-[13px] text-ink placeholder:text-muted"
      />
      {err && <p className="mt-2 text-sakai text-xs">{err}</p>}
      {getRecent().length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wider text-muted mb-1.5">Recent</div>
          {getRecent().map((r) => <button key={r} onClick={() => set({ repoInput: r })} className="block w-full text-left h-8 px-3 rounded hover:bg-panel font-mono text-xs">{r}</button>)}
        </div>
      )}
      <Button className="mt-5 w-full" onClick={next} disabled={!repoInput.trim()}>Continue</Button>
    </div>
  )
}
