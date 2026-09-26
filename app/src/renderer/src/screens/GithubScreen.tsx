import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { useApp } from '../store'
import { Onboard } from '../components/Onboard'
import { Button } from '../components/ui'
import { BrandTile, GithubMark } from '../ui/brand'
import { cleanErr } from '../lib/api'

const SOON: [string, string][] = [['aws', 'AWS'], ['gcloud', 'Google Cloud'], ['azure', 'Azure'], ['gitlab', 'GitLab'], ['bitbucket', 'Bitbucket'], ['jira', 'Jira'], ['linear', 'Linear'], ['sentry', 'Sentry']]

export function GithubScreen() {
  const { user, repo, set } = useApp()
  const [code, setCode] = useState<{ user_code: string; verification_uri: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')
  const attempt = useRef(0)

  useEffect(() => { void window.sakai.github.user().then((u) => u && set({ user: u })) }, [set])

  async function connect() {
    const mine = ++attempt.current
    setBusy(true); setErr(''); setCode(null)
    try {
      const dc = await window.sakai.github.start()
      if (mine !== attempt.current) return
      setCode(dc)
      const u = await window.sakai.github.poll(dc)
      if (mine === attempt.current) set({ user: u })
    } catch (e) { if (mine === attempt.current) setErr(cleanErr(e)) } finally { if (mine === attempt.current) { setBusy(false); setCode(null) } }
  }
  const cancel = () => { attempt.current++; setBusy(false); setCode(null) }
  const copy = async () => { if (code) { await navigator.clipboard.writeText(code.user_code).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500) } }

  return (
    <Onboard step="github" title="Connect your GitHub" subtitle={repo ? `Sakai will clone ${repo} and open pull requests with your account. Nothing leaves your Mac except git and the GitHub API.` : 'Sakai uses your GitHub authorization to clone, push branches and open pull requests.'}>
      <div className="rounded-xl border border-line bg-panel overflow-hidden">
        <div className="p-4 flex items-center gap-3">
          {user ? <img src={user.avatar_url} className="w-11 h-11 rounded-full ring-2 ring-sakai/60" /> : <div className="w-11 h-11 rounded-full bg-white text-black grid place-items-center"><GithubMark size={26} /></div>}
          <div className="flex-1 min-w-0">
            <div className="text-ink font-medium flex items-center gap-1.5">{user ? (user.name || user.login) : 'GitHub'}{user && <Check size={14} className="text-sakai" />}</div>
            <div className="text-xs text-muted truncate">{user ? `Connected as @${user.login}` : 'Full repository access via OAuth (Device Flow)'}</div>
          </div>
          {!user && !busy && <Button onClick={connect}>Connect GitHub</Button>}
          {user && <Button variant="ghost" onClick={async () => { await window.sakai.github.signOut(); set({ user: null }) }}>Switch</Button>}
        </div>
        {busy && (
          <div className="border-t border-line p-4 fade bg-bg/60">
            {code ? (
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-widest text-muted">Enter this code on GitHub</div>
                <div className="mt-2 flex items-center justify-center gap-3">
                  <span className="font-mono text-[34px] leading-none tracking-[.18em] text-ink selectable">{code.user_code}</span>
                  <button onClick={copy} title="Copy code" className="w-8 h-8 grid place-items-center rounded-md border border-line2 hover:border-sakai text-muted hover:text-ink">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
                </div>
                <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted"><Loader2 size={13} className="spin" />Waiting for you to approve in the browser…</div>
                <div className="mt-3 flex justify-center gap-2">
                  <Button variant="ghost" className="h-8 text-xs" onClick={() => window.open(code.verification_uri)}><ExternalLink size={12} className="inline mr-1 -mt-0.5" />Open github.com/login/device</Button>
                  <Button variant="quiet" className="h-8 text-xs" onClick={cancel}>Cancel</Button>
                </div>
              </div>
            ) : <div className="flex items-center justify-center gap-2 text-xs text-muted py-2"><Loader2 size={13} className="spin" />Contacting GitHub…</div>}
          </div>
        )}
      </div>
      {err && <p className="mt-3 text-sakai text-[12.5px] leading-snug rounded-lg border border-sakai/40 bg-sakai/10 px-3 py-2 fade">{err}</p>}

      <div className="mt-5">
        <div className="text-[11px] uppercase tracking-widest text-faint mb-2">More integrations</div>
        <div className="grid grid-cols-4 gap-2">
          {SOON.map(([id, name]) => (
            <div key={id} className="flex flex-col items-center gap-1.5 py-2.5 rounded-lg border border-line bg-panel/60 opacity-80">
              <BrandTile id={id} size={32} />
              <span className="text-[11px] text-fg">{name}</span>
              <span className="text-[9px] uppercase tracking-wider text-faint">Coming soon</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2">
        <Button variant="ghost" onClick={() => set({ step: 'repo' })}>Back</Button>
        <Button className="flex-1" disabled={!user} onClick={() => set({ step: 'llm', mode: 'github' })}>Continue</Button>
      </div>
      <div className="mt-3 text-center">
        <button className="text-[12px] text-muted hover:text-ink underline underline-offset-4" onClick={() => set({ mode: 'local', repo: null, localPath: null, step: 'llm' })}>Skip for now — I’ll use a local folder</button>
      </div>
    </Onboard>
  )
}
