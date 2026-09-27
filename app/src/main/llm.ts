import { ipcMain } from 'electron'
import { getSecret } from './store'

export interface ProviderDef {
  id: string
  name: string
  kind: 'openai' | 'anthropic' | 'ollama'
  baseUrl: string
  needsKey: boolean
  models: string[]
  note?: string
}

export const PROVIDERS: ProviderDef[] = [
  { id: 'groq', name: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', needsKey: true, models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'qwen/qwen3-32b'], note: 'Fast free tier — good for trying Sakai.' },
  { id: 'deepseek', name: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', needsKey: true, models: ['deepseek-v4-pro', 'deepseek-flash', 'deepseek-chat', 'deepseek-reasoner'], note: 'Direct DeepSeek API (api.deepseek.com), no third-party gateway. V4-Pro = strongest; Flash (V4.1) = fast and cheap; both have 1M context and tool calls.' },
  { id: 'qwen', name: 'Qwen (Alibaba Cloud, Intl)', kind: 'openai', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', needsKey: true, models: ['qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-max', 'qwen3.7-plus', 'qwen3.7-flash', 'qwen3.6-plus', 'qwen3.5-plus', 'qwen3-max', 'qwen3-coder-plus', 'qwen-plus'], note: 'Direct Alibaba Cloud Model Studio API (international). If your account shows a workspace-specific endpoint, paste it under Custom endpoint.' },
  { id: 'qwen-cn', name: 'Qwen (Alibaba Cloud, China)', kind: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', needsKey: true, models: ['qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-max', 'qwen3.7-plus', 'qwen3.7-flash', 'qwen3.6-plus', 'qwen3.5-plus', 'qwen3-max', 'qwen3-coder-plus', 'qwen-plus'], note: 'Direct API (China region). Qwen keys are region-specific; use this for China-region keys, or paste your workspace endpoint under Custom endpoint.' },
  { id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', needsKey: true, models: ['gpt-4.1', 'gpt-4.1-mini'] },
  { id: 'anthropic', name: 'Anthropic', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', needsKey: true, models: ['claude-sonnet-5', 'claude-haiku-4-5-20251001'] },
  { id: 'ollama', name: 'Ollama (local)', kind: 'ollama', baseUrl: 'http://localhost:11434', needsKey: false, models: [], note: 'Detected automatically if Ollama is running.' },
  { id: 'lmstudio', name: 'LM Studio (local)', kind: 'openai', baseUrl: 'http://localhost:1234/v1', needsKey: false, models: [], note: 'Start the LM Studio local server first.' },
]

export interface TestResult { ok: boolean; message: string; models?: string[] }

export async function testProvider(id: string, apiKey: string, baseUrl?: string): Promise<TestResult> {
  const p = PROVIDERS.find((x) => x.id === id)
  if (!p) return { ok: false, message: 'Unknown provider' }
  const base = (baseUrl || p.baseUrl).replace(/\/$/, '')
  try {
    let res: Response
    if (p.kind === 'ollama') {
      res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) })
      if (!res.ok) return { ok: false, message: `Ollama responded ${res.status}` }
      const data = (await res.json()) as { models: { name: string }[] }
      const models = data.models.map((m) => m.name)
      return models.length ? { ok: true, message: `Connected — ${models.length} model(s)`, models } : { ok: false, message: 'Ollama is running but has no models. Run: ollama pull qwen2.5-coder' }
    }
    if (p.kind === 'anthropic') {
      res = await fetch(`${base}/models`, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(8000) })
    } else {
      res = await fetch(`${base}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, signal: AbortSignal.timeout(8000) })
    }
    if (res.status === 401 || res.status === 403) return { ok: false, message: 'API key rejected' }
    if (!res.ok) return { ok: false, message: `Provider responded ${res.status}` }
    const data = (await res.json()) as { data?: { id: string }[] }
    return { ok: true, message: 'Connected', models: data.data?.map((m) => m.id) }
  } catch (e) {
    return { ok: false, message: p.kind === 'ollama' || id === 'lmstudio' ? 'Not reachable — is it running?' : `Network error: ${(e as Error).message}` }
  }
}

/** Provider ids that AI_PROVIDER may name, and the model used when AI_MODEL is not set. */
const EVAL_DEFAULT_MODEL: Record<string, string> = { deepseek: 'deepseek-v4-pro', qwen: 'qwen3.8-max', 'qwen-cn': 'qwen3.8-max', groq: 'openai/gpt-oss-120b', openai: 'gpt-4.1', anthropic: 'claude-sonnet-5' }

/** Evaluation/headless mode: credentials come ONLY from the environment (AI_API_KEY), never from files. */
export function evalConfig(): { provider: string; model: string; baseUrl?: string } | null {
  if (!process.env.AI_API_KEY) return null
  const provider = (process.env.AI_PROVIDER || 'deepseek').toLowerCase()
  return { provider, model: process.env.AI_MODEL || EVAL_DEFAULT_MODEL[provider] || 'deepseek-v4-pro', baseUrl: process.env.AI_BASE_URL || undefined }
}

const ENV_KEYS: Record<string, string> = { groq: 'GROQ_API_KEY', deepseek: 'DEEPSEEK_API_KEY', qwen: 'DASHSCOPE_API_KEY', 'qwen-cn': 'DASHSCOPE_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' }

export function registerLlmIpc(): void {
  ipcMain.handle('llm:evalConfig', () => evalConfig())
  ipcMain.handle('llm:key', (_e, id: string) => (process.env.AI_API_KEY && evalConfig()?.provider === id ? process.env.AI_API_KEY : '') || getSecret(`llm:${id}`) || (ENV_KEYS[id] ? process.env[ENV_KEYS[id]] ?? '' : ''))
  ipcMain.handle('llm:envKey', (_e, id: string) => (ENV_KEYS[id] ? process.env[ENV_KEYS[id]] ?? '' : ''))
  ipcMain.handle('llm:providers', () =>
    PROVIDERS.map((p) => (p.id === 'ollama' && process.env.OLLAMA_HOST ? { ...p, baseUrl: process.env.OLLAMA_HOST } : p.id === 'lmstudio' && process.env.LMSTUDIO_HOST ? { ...p, baseUrl: process.env.LMSTUDIO_HOST } : p)))
  ipcMain.handle('llm:test', (_e, id: string, key: string, baseUrl?: string) => testProvider(id, key, baseUrl))
}
