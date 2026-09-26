export interface Message { role: 'system' | 'user' | 'assistant'; content: string }
export interface LlmConfig { baseUrl: string; apiKey?: string; model: string; kind: 'openai' | 'anthropic' | 'ollama' }
export interface Completion { text: string; inputTokens: number; outputTokens: number }

/** Provider-agnostic chat completion. Text-in/text-out: tool calls are parsed from the reply (works on every model). */
export async function complete(cfg: LlmConfig, messages: Message[], signal?: AbortSignal): Promise<Completion> {
  const base = cfg.baseUrl.replace(/\/$/, '')
  if (cfg.kind === 'anthropic') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
    const res = await fetch(`${base}/messages`, {
      method: 'POST', signal,
      headers: { 'x-api-key': cfg.apiKey ?? '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, max_tokens: 4096, system, messages: messages.filter((m) => m.role !== 'system') }),
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
    const d = (await res.json()) as { content: { text: string }[]; usage: { input_tokens: number; output_tokens: number } }
    return { text: d.content.map((c) => c.text).join(''), inputTokens: d.usage.input_tokens, outputTokens: d.usage.output_tokens }
  }
  const url = cfg.kind === 'ollama' ? `${base}/v1/chat/completions` : `${base}/chat/completions`
  const res = await fetch(url, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({ model: cfg.model, messages, temperature: 0.1 }),
  })
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`)
  const d = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } }
  return { text: d.choices[0].message.content ?? '', inputTokens: d.usage?.prompt_tokens ?? 0, outputTokens: d.usage?.completion_tokens ?? 0 }
}
