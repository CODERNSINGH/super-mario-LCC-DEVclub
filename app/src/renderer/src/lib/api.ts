import { useApp } from '../store'

let base = ''
async function url() { return base || (base = await window.sakai.serverUrl()) }

export async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${await url()}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data as T
}

export interface LlmConfig { baseUrl: string; apiKey?: string; model: string; kind: 'openai' | 'anthropic' | 'ollama' }

/** Resolves the user's chosen provider into a concrete server config (key from Keychain or .env). */
export async function resolveLlm(): Promise<LlmConfig> {
  const choice = useApp.getState().llm
  if (!choice) throw new Error('No model selected')
  const providers = await window.sakai.llm.providers()
  const p = providers.find((x) => x.id === choice.provider)!
  const apiKey = await window.sakai.llm.key(p.id)
  return { baseUrl: p.baseUrl, apiKey, model: choice.model, kind: p.kind as LlmConfig['kind'] }
}

export type AgentEvent =
  | { type: 'status' | 'assistant' | 'error'; data: string }
  | { type: 'tool'; data: { call: { tool: string; args: Record<string, string> }; out: string } }
  | { type: 'usage'; data: { inputTokens: number; outputTokens: number; steps: number } }
  | { type: 'done'; data: { finished: boolean; summary: string; inputTokens: number; outputTokens: number; steps: number } }

export async function streamRun(body: unknown, onEvent: (e: AgentEvent) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch(`${await url()}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  if (!res.body) throw new Error('No stream')
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2)
      if (chunk.startsWith('data: ')) onEvent(JSON.parse(chunk.slice(6)))
    }
  }
}

/** Strips Electron's IPC wrapper from error messages. */
export const cleanErr = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
