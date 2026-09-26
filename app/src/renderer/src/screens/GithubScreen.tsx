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
  const [hasOAuth, setHasOAuth] = useState(false)
  const [mode, setMode] = useState<'pat' | 'oauth'>('pat')
  const [tokenInput, setTokenInput] = useState('')
  const [clientIdInput, setClientIdInput] = useState('')
  const [showConfig, setShowConfig] = useState(false)

  useEffect(() => {
    void window.sakai.github.user().then((u) => u && set({ user: u }))
    void window.sakai.github.hasOAuth().then((configured) => {
      setHasOAuth(configured)
      if (configured) setMode('oauth')
    })
    void window.sakai.github.getClientId().then((id) => id && setClientIdInput(id))
  }, [set])

  async function connectOAuth() {
    setBusy(true); setErr('')
    try {
      if (clientIdInput.trim()) {
        await window.sakai.github.setClientId(clientIdInput.trim())
        setHasOAuth(true)
      }
      const dc = await window.sakai.github.start()
      setCode(dc.user_code)
      const u = await window.sakai.github.poll(dc)
      set({ user: u })
      setCode(null)
    } catch (e) {
      setErr(cleanErr(e))
    } finally {
      setBusy(false)
    }
  }

  async function connectPat() {
    const trimmed = tokenInput.trim()
    if (!trimmed) {
      setErr('Please paste a GitHub Personal Access Token')
      return
    }
    setBusy(true); setErr('')
    try {
      const u = await window.sakai.github.loginWithToken(trimmed)
      set({ user: u })
      setTokenInput('')
    } catch (e) {
      setErr(cleanErr(e))
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    await window.sakai.github.signOut()
    set({ user: null })
    setCode(null)
    setErr('')
  }

  return (
    <div>
      <h1 className="text-2xl text-ink font-semibold">Connect your accounts</h1>
      <p className="mt-2 text-muted">Sakai uses GitHub authorization for cloning private repos, branches and opening pull requests.</p>
      <div className="mt-6"><Steps current={1} /></div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          {user ? (
            <img src={user.avatar_url} alt={user.login} className="w-10 h-10 rounded-full border border-line object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-raised border border-line flex items-center justify-center text-muted font-semibold">
              GH
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-ink font-medium flex items-center gap-2">
              GitHub
              {user && <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono">Connected</span>}
            </div>
            <div className="text-xs text-muted truncate">
              {user ? (
                `Connected as @${user.login}`
              ) : code ? (
                <>Enter code <span className="font-mono text-ink font-semibold">{code}</span> in your browser…</>
              ) : (
                'Full repo access via Personal Access Token or OAuth'
              )}
            </div>
          </div>
          {user && (
            <Button variant="ghost" onClick={disconnect} className="h-8 px-2.5 text-xs">
              Disconnect
            </Button>
          )}
        </div>

        {!user && (
          <div className="pt-2 border-t border-line space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex bg-raised p-0.5 rounded-md border border-line text-xs">
                <button
                  type="button"
                  onClick={() => { setMode('pat'); setErr('') }}
                  className={`px-3 py-1 rounded transition-colors ${mode === 'pat' ? 'bg-panel text-ink font-medium shadow-sm' : 'text-muted hover:text-fg'}`}
                >
                  Personal Access Token (Recommended)
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('oauth'); setErr('') }}
                  className={`px-3 py-1 rounded transition-colors ${mode === 'oauth' ? 'bg-panel text-ink font-medium shadow-sm' : 'text-muted hover:text-fg'}`}
                >
                  OAuth Device Flow
                </button>
              </div>
            </div>

            {mode === 'pat' ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => { setTokenInput(e.target.value); setErr('') }}
                    onKeyDown={(e) => e.key === 'Enter' && connectPat()}
                    placeholder="ghp_... or github_pat_..."
                    className="flex-1 h-9 px-3 rounded-md bg-raised border border-line focus:border-sakai outline-none font-mono text-[12.5px] text-ink placeholder:text-muted"
                  />
                  <Button onClick={connectPat} disabled={busy || !tokenInput.trim()}>
                    {busy ? 'Verifying…' : 'Connect'}
                  </Button>
                </div>
                <div className="flex items-center justify-between text-[11.5px] text-muted">
                  <span>Classic or fine-grained token with <code className="text-ink">repo</code> scope.</span>
                  <button
                    type="button"
                    onClick={() => window.open('https://github.com/settings/tokens', '_blank')}
                    className="text-sakai hover:underline"
                  >
                    Generate token ↗
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {hasOAuth ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">Authorizes in your browser via GitHub Device Code.</span>
                    <Button onClick={connectOAuth} disabled={busy}>
                      {busy ? (code ? 'Waiting for browser…' : 'Starting…') : 'Connect in Browser'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[12px] text-muted">
                      OAuth App Client ID is not configured. Enter a Client ID (with Device Flow enabled) or use the Personal Access Token tab above.
                    </p>
                    <div className="flex gap-2">
                      <input
                        value={clientIdInput}
                        onChange={(e) => { setClientIdInput(e.target.value); setErr('') }}
                        placeholder="GitHub OAuth Client ID"
                        className="flex-1 h-9 px-3 rounded-md bg-raised border border-line focus:border-sakai outline-none font-mono text-[12.5px] text-ink placeholder:text-muted"
                      />
                      <Button onClick={connectOAuth} disabled={busy || !clientIdInput.trim()}>
                        {busy ? 'Connecting…' : 'Save & Connect'}
                      </Button>
                    </div>
                  </div>
                )}
                {hasOAuth && !showConfig && (
                  <button
                    type="button"
                    onClick={() => setShowConfig(true)}
                    className="text-[11px] text-muted hover:text-fg underline block"
                  >
                    Change OAuth Client ID
                  </button>
                )}
                {hasOAuth && showConfig && (
                  <div className="flex gap-2 pt-1">
                    <input
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                      placeholder="New Client ID"
                      className="flex-1 h-8 px-2 rounded-md bg-raised border border-line focus:border-sakai outline-none font-mono text-xs text-ink"
                    />
                    <Button
                      variant="ghost"
                      className="h-8 text-xs px-2.5"
                      onClick={async () => {
                        await window.sakai.github.setClientId(clientIdInput.trim())
                        setShowConfig(false)
                      }}
                    >
                      Save
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {err && <p className="mt-2 text-sakai text-xs whitespace-pre-wrap">{err}</p>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {SOON.map((n) => (
          <Card key={n} className="px-3 h-11 flex items-center justify-between opacity-60">
            <span>{n}</span><span className="text-[10px] uppercase tracking-wider text-muted border border-line rounded px-1.5 py-0.5">Coming soon</span>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-2">
        <Button variant="ghost" onClick={() => set({ step: 'repo' })}>Back</Button>
        {user ? (
          <Button className="flex-1" onClick={() => set({ step: 'llm' })}>Continue</Button>
        ) : (
          <Button variant="ghost" className="flex-1" onClick={() => set({ step: 'llm' })}>
            Skip for now (public repos only) →
          </Button>
        )}
      </div>
    </div>
  )
}
