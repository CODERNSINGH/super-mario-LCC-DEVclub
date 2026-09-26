import { useEffect, useState } from 'react'
import { useApp } from '../store'
import { Button, Card, Steps } from '../components/ui'

/** Live model list minus non-chat models; curated defaults come first. Falls back to the curated list. */
const NON_CHAT = /whisper|tts|guard|embed|transcri|orpheus|playai|moderation|safeguard/i
function usable(live: string[] | undefined, curated: string[]): string[] {
  if (!live?.length) return curated
  const chat = live.filter((m) => !NON_CHAT.test(m))
  const first = curated.filter((m) => chat.includes(m))
  return [...first, ...chat.filter((m) => !first.includes(m))]
}

type P = Awaited<ReturnType<typeof window.sakai.llm.providers>>[number]

export function LlmScreen() {
  const set = useApp((s) => s.set)
  const [providers, setProviders] = useState<P[]>([])
  const [sel, setSel] = useState<P | null>(null)
  const [key, setKey] = useState('')
  const [model, setModel] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; message: string; models?: string[] } | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => { void window.sakai.llm.providers().then(setProviders) }, [])

  async function choose(p: P) {
    setSel(p); setKey(''); setStatus(null); setModel(p.models[0] ?? '')
    if (!p.needsKey) return void (await test(p, ''))
    const saved = await window.sakai.llm.key(p.id) // Keychain or .env
    if (saved) { setKey(saved); await test(p, saved) }
  }

  async function test(p = sel!, k = key) {
    setTesting(true)
    const r = await window.sakai.llm.test(p.id, k)
    setStatus(r); setTesting(false)
    if (r.ok) {
      const list = usable(r.models, p.models)
      if (list.length && !list.includes(model)) setModel(list[0])
    }
  }

  async function finish() {
    if (sel?.needsKey) await window.sakai.secret.set(`llm:${sel.id}`, key)
    set({ llm: { provider: sel!.id, model }, step: 'workspace' })
  }

  const modelOptions = usable(status?.models, sel?.models ?? [])

  return (
    <div>
      <h1 className="text-2xl text-ink font-semibold">Connect a language model</h1>
      <p className="mt-2 text-muted">Bring your own model. Sakai works with hosted APIs or models running on this Mac.</p>
      <div className="mt-6"><Steps current={2} /></div>

      <div className="grid grid-cols-2 gap-2">
        {providers.map((p) => (
          <button key={p.id} onClick={() => choose(p)} className={`text-left px-3 h-11 rounded-lg border bg-panel transition-colors ${sel?.id === p.id ? 'border-sakai text-ink' : 'border-line hover:border-[#2c2c32]'}`}>{p.name}</button>
        ))}
      </div>

      {sel && (
        <Card className="mt-4 p-4 fade space-y-3">
          {sel.note && <p className="text-xs text-muted">{sel.note}</p>}
          {sel.needsKey && (
            <div className="flex gap-2">
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="API key" className="flex-1 h-9 px-3 rounded-md bg-bg border border-line focus:border-sakai outline-none font-mono text-xs text-ink" />
              <Button variant="ghost" disabled={!key || testing} onClick={() => test()}>{testing ? 'Testing…' : 'Test'}</Button>
            </div>
          )}
          {!sel.needsKey && testing && <p className="text-xs text-muted">Looking for {sel.name}…</p>}
          {status && <p className={`text-xs ${status.ok ? 'text-fg' : 'text-sakai'}`}>{status.ok ? '● ' : '○ '}{status.message}</p>}
          {status?.ok && (
            <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full h-9 px-2 rounded-md bg-bg border border-line text-xs text-ink outline-none">
              {modelOptions.map((m) => <option key={m}>{m}</option>)}
            </select>
          )}
        </Card>
      )}

      <p className="mt-4 text-[11px] text-muted leading-relaxed">Your API key stays on this Mac in the macOS Keychain and is sent only to the provider you choose. Usage is billed by your provider; Sakai shows an estimate before every run. Local models (Ollama, LM Studio) are free.</p>

      <div className="mt-4 flex gap-2">
        <Button variant="ghost" onClick={() => set({ step: 'github' })}>Back</Button>
        <Button className="flex-1" disabled={!status?.ok || !model} onClick={finish}>Open workspace</Button>
      </div>
    </div>
  )
}
