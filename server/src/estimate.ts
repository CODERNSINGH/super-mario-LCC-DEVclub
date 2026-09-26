import { complete, type LlmConfig } from './llm/client.js'
import { trackedFiles, detectTestCommand } from './repo/info.js'

/** Approximate public list prices, USD per 1M tokens [input, output]. Local models are free. */
const PRICES: Record<string, [number, number]> = {
  'deepseek-chat': [0.27, 1.1], 'deepseek-reasoner': [0.55, 2.19],
  'qwen3-coder-plus': [1.0, 5.0], 'qwen-max': [1.6, 6.4],
  'gpt-4.1': [2, 8], 'gpt-4.1-mini': [0.4, 1.6],
  'claude-sonnet-5': [3, 15], 'claude-haiku-4-5-20251001': [1, 5],
  'openai/gpt-oss-120b': [0.15, 0.75], 'openai/gpt-oss-20b': [0.075, 0.3], 'llama-3.3-70b-versatile': [0.59, 0.79], 'llama-3.1-8b-instant': [0.05, 0.08], 'qwen/qwen3-32b': [0.29, 0.59],
}
/** Approximate generation speed (tokens/sec) used only for time estimates. */
const SPEED: Record<string, number> = { groq: 300, deepseek: 45, qwen: 55, openai: 80, anthropic: 70, ollama: 25, lmstudio: 25 }

export interface Estimate {
  repoTokens: number; steps: number; inputTokens: number; outputTokens: number
  costUsd: number; minutes: number; complexity: 'small' | 'medium' | 'large'
  testCommand: string | null; tips: string[]; priced: boolean
}

export async function estimate(root: string, issueText: string, provider: string, model: string, llm?: LlmConfig): Promise<Estimate> {
  const files = await trackedFiles(root)
  const repoTokens = Math.round(files.reduce((s, f) => s + f.size, 0) / 4)
  const issueTokens = Math.round(issueText.length / 4)
  const complexity = issueTokens > 700 || repoTokens > 2_000_000 ? 'large' : issueTokens > 200 || repoTokens > 300_000 ? 'medium' : 'small'
  const steps = { small: 14, medium: 24, large: 36 }[complexity]

  // Context grows each turn (history accumulates); output is short tool calls with reasoning.
  const base = 1500 + issueTokens
  const perStep = 900
  const inputTokens = Math.round(steps * base + perStep * (steps * (steps + 1)) / 2 * 0.6)
  const outputTokens = steps * 380
  const price = PRICES[model]
  const costUsd = price ? (inputTokens * price[0] + outputTokens * price[1]) / 1e6 : 0
  const speed = SPEED[provider] ?? 50
  const minutes = Math.max(1, Math.round((outputTokens / speed + steps * 6) / 60))
  const testCommand = await detectTestCommand(root)

  let tips = [
    'Point Sakai at the failing test or file in the notes to skip exploration steps.',
    repoTokens > 500_000 ? 'Large repository: exploration dominates cost. Naming the module cuts tokens noticeably.' : 'Small repository: a cheaper model is usually enough.',
    testCommand ? `Test command detected (${testCommand}); scoping it to one test file saves time.` : 'No test command detected; provide one so Sakai can verify its fix.',
  ]
  if (llm) {
    try {
      const r = await complete(llm, [
        { role: 'system', content: 'You give terse cost/time optimisation advice for an AI coding agent run. Reply with exactly 3 bullet lines starting with "- ". No preamble.' },
        { role: 'user', content: `Issue:\n${issueText.slice(0, 1500)}\n\nRepo ≈ ${repoTokens} tokens, ${files.length} files. Model ${model}. Estimated ${steps} steps, ${inputTokens} input tokens.` },
      ])
      const bullets = r.text.split('\n').filter((l) => l.trim().startsWith('-')).map((l) => l.replace(/^-\s*/, '').trim()).slice(0, 3)
      if (bullets.length) tips = bullets
    } catch { /* keep heuristic tips */ }
  }
  return { repoTokens, steps, inputTokens, outputTokens, costUsd, minutes, complexity, testCommand, tips, priced: !!price || speed === 25 }
}
