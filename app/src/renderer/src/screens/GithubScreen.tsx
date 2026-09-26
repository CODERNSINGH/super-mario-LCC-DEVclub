import { useEffect, useState } from 'react'
import { useApp } from '../store'
import { Button, Card, Steps } from '../components/ui'
import { cleanErr } from '../lib/api'

const SOON = ['AWS', 'Google Cloud', 'Azure', 'GitLab', 'Bitbucket', 'Jira', 'Linear', 'Sentry']

export function GithubScreen() {
  const { user, set } = useApp()
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { void window.sakai.github.user().then((u) => u && set({ user: u })) }, [set])

  async function connect() {
    setBusy(true); setErr('')
    try {
      const dc = await window.sakai.github.start()
      setCode(dc.user_code)
      set({ user: await window.sakai.github.poll(dc) })
    } catch (e) { setErr(cleanErr(e)) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <h1 className="text-2xl text-ink font-semibold">Connect your accounts</h1>
      <p className="mt-2 text-muted">Sakai uses your GitHub authorization for cloning, branches and pull requests.</p>
      <div className="mt-6"><Steps current={1} /></div>

      <Card className="p-4 flex items-center gap-3">
        {user ? <img src={user.avatar_url} className="w-9 h-9 rounded-full" /> : <div className="w-9 h-9 rounded-full bg-raised border border-line" />}
        <div className="flex-1">
          <div className="text-ink font-medium">GitHub</div>
          <div className="text-xs text-muted">{user ? `Connected as ${user.login}` : code ? <>Enter code <span className="font-mono text-ink">{code}</span> in your browser…</> : 'Full repo access via OAuth'}</div>
        </div>
        {!user && <Button onClick={connect} disabled={busy}>{busy ? 'Waiting…' : 'Connect'}</Button>}
      </Card>
      {err && <p className="mt-2 text-sakai text-xs">{err}</p>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {SOON.map((n) => (
          <Card key={n} className="px-3 h-11 flex items-center justify-between opacity-60">
            <span>{n}</span><span className="text-[10px] uppercase tracking-wider text-muted border border-line rounded px-1.5 py-0.5">Coming soon</span>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        <Button variant="ghost" onClick={() => set({ step: 'repo' })}>Back</Button>
        <Button className="flex-1" disabled={!user} onClick={() => set({ step: 'llm' })}>Continue</Button>
      </div>
    </div>
  )
}
