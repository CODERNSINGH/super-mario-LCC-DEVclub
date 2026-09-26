/**
 * Batch evaluation: run the agent over a list of issues and report pass/fail.
 * Usage: tsx scripts/eval.ts cases.json
 * cases.json: [{ "repo": "owner/name", "issue": {"title","body"}, "testCommand": "npm test", "provider": "deepseek", "model": "deepseek-chat" }]
 */
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { runAgent } from '../src/agent/loop.js'

const BASES: Record<string, { baseUrl: string; key: string; kind: 'openai' | 'anthropic' | 'ollama' }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', key: 'DEEPSEEK_API_KEY', kind: 'openai' },
  qwen: { baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', key: 'DASHSCOPE_API_KEY', kind: 'openai' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', key: 'GROQ_API_KEY', kind: 'openai' },
}

const cases = JSON.parse(readFileSync(process.argv[2] ?? 'cases.json', 'utf8')) as { repo: string; issue: { title: string; body: string }; testCommand?: string; provider: string; model: string }[]
for (const c of cases) {
  const dir = mkdtempSync(join(tmpdir(), 'sakai-eval-'))
  execSync(`git clone --depth 1 https://github.com/${c.repo}.git ${dir}`, { stdio: 'ignore' })
  const b = BASES[c.provider]
  const t0 = Date.now()
  const r = await runAgent({ root: dir, issue: c.issue, testCommand: c.testCommand, llm: { baseUrl: b.baseUrl, apiKey: process.env[b.key], model: c.model, kind: b.kind }, onEvent: () => undefined })
  console.log(JSON.stringify({ repo: c.repo, title: c.issue.title, finished: r.finished, steps: r.steps, tokens: r.inputTokens + r.outputTokens, seconds: Math.round((Date.now() - t0) / 1000) }))
}
