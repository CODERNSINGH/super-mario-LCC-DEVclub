import { useEffect, useState } from 'react'
import { Check, Eye, EyeOff, Loader2, TriangleAlert } from 'lucide-react'
import { useApp } from '../store'
import { Onboard } from '../components/Onboard'
import { Button } from '../components/ui'
import { BrandTile } from '../ui/brand'
import { isSmallModel } from '../lib/api'

/** Live model list minus non-chat models; curated defaults come first. Falls back to the curated list. */
const NON_CHAT = /whisper|tts|guard|embed|transcri|orpheus|playai|moderation|safeguard/i
function usable(live: string[] | undefined, curated: string[]): string[] {
  if (!live?.length) return curated
  const chat = live.filter((m) => !NON_CHAT.test(m))
  const first = curated.filter((m) => chat.includes(m))
  return [...first, ...chat.filter((m) => !first.includes(m))]
}

type P = Awaited<ReturnType<typeof window.sakai.llm.providers>>[number]
const ORDER = ['groq', 'deepseek', 'qwen', 'openai', 'anthropic', 'ollama', 'lmstudio']
const TAG: Record<string, string> = { groq: 'Fast · free tier', deepseek: 'Evaluation model', qwen: 'Evaluation model', openai: 'ChatGPT / GPT-4.1', anthropic: 'Claude', ollama: 'Runs on this Mac', lmstudio: 'Runs on this Mac' }
const NAME: Record<string, string> = { openai: 'OpenAI', qwen: 'Qwen', lmstudio: 'LM Studio', ollama: 'Ollama' }

export function LlmScreen() {
  const { mode, llm, set } = useApp()
  const [providers, setProviders] = useState<P[]>([])
  const [sel, setSel] = useState<P | null>(null)
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [model, setModel] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; message: string; models?: string[] } | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => { void window.sakai.llm.providers().then((l) => setProviders([...l].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)))) }, [])

  async function test(p: P, k: string) {
    setTesting(true)
    const r = await window.sakai.llm.test(p.id, k)
    setStatus(r); setTesting(false)
    if (r.ok) { const list = usable(r.models, p.models); setModel((m) => (list.includes(m) ? m : list[0] ?? m)) }
  }

  async function choose(p: P) {
    setSel(p); setKey(''); setStatus(null); setModel(p.models[0] ?? '')
    if (!p.needsKey) return void (await test(p, ''))
    const saved = await window.sakai.llm.key(p.id) // Keychain or dev .env
    if (saved) { setKey(saved); await test(p, saved) }
  }

  async function finish() {
    if (sel?.needsKey && key) await window.sakai.secret.set(`llm:${sel.id}`, key)
    set({ llm: { provider: sel!.id, model }, step: 'workspace' })
  }

  const options = usable(status?.models, sel?.models ?? [])

  return (
    <Onboard step="llm" title="Bring your own model" subtitle="Sakai runs on the model you choose. Keys stay in your macOS Keychain and go only to that provider.">
      <div className="grid grid-cols-2 gap-2">
        {providers.map((p) => (
          <button key={p.id} onClick={() => choose(p)} className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${sel?.id === p.id ? 'border-sakai bg-sakai/10' : 'border-line bg-panel/80 hover:border-line2 hover:bg-raised'}`}>
            <BrandTile id={p.id} size={36} />
            <span className="min-w-0"><span className="block text-ink text-[13px] font-medium truncate">{NAME[p.id] ?? p.name.replace(/ \(.*\)/, '')}</span><span className="block text-[11px] text-muted truncate">{TAG[p.id] ?? ''}</span></span>
            {llm?.provider === p.id && sel?.id !== p.id && <Check size={14} className="ml-auto text-sakai" />}
          </button>
        ))}
      </div>

      {sel && (
        <div className="mt-3 rounded-xl border border-line bg-panel p-3.5 space-y-3 fade">
          {sel.note && <p className="text-xs text-muted">{sel.note}</p>}
          {sel.needsKey && (
            <div className="flex gap-2">
              <div className="flex-1 flex items-center h-9 rounded-md bg-bg border border-line focus-within:border-sakai">
                <input type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && key && test(sel, key)} placeholder={`${NAME[sel.id] ?? sel.name} API key`} spellCheck={false} className="flex-1 h-full px-3 bg-transparent outline-none font-mono text-xs text-ink placeholder:text-faint" />
                <button onClick={() => setShow(!show)} className="px-2 text-muted hover:text-ink">{show ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              </div>
              <Button variant="ghost" disabled={!key || testing} onClick={() => test(sel, key)}>{testing ? <Loader2 size={14} className="spin" /> : 'Test'}</Button>
            </div>
          )}
          {!sel.needsKey && testing && <p className="text-xs text-muted flex items-center gap-2"><Loader2 size={13} className="spin" />Looking for {sel.name}…</p>}
          {status && <p className={`text-xs flex items-center gap-1.5 ${status.ok ? 'text-fg' : 'text-sakai'}`}><span className={`w-1.5 h-1.5 rounded-full ${status.ok ? 'bg-white' : 'bg-sakai'}`} />{status.message}</p>}
          {status?.ok && isSmallModel(model) && <p className="text-xs text-sakai flex gap-1.5"><TriangleAlert size={13} className="shrink-0 mt-0.5" />{model} is very small. Agents need a 7B+ coder model (e.g. qwen2.5-coder:7b) or a hosted model to work reliably.</p>}
          {status?.ok && (
            <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full h-9 px-2 rounded-md bg-bg border border-line text-xs text-ink outline-none focus:border-sakai">
              {options.map((m) => <option key={m}>{m}</option>)}
            </select>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted leading-relaxed">You pay your provider directly for usage. Sakai shows an estimate before every run. Local models (Ollama, LM Studio) are free.</p>
      <div className="mt-4 flex gap-2">
        <Button variant="ghost" onClick={() => set({ step: mode === 'github' ? 'github' : 'repo' })}>Back</Button>
        <Button className="flex-1" disabled={!status?.ok || !model} onClick={finish}>Open workspace</Button>
      </div>
    </Onboard>
  )
}
