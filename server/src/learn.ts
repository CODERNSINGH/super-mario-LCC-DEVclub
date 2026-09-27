import { complete, type LlmConfig } from './llm/client.js'

export type Profile = 'developer' | 'student' | 'vibe'

export interface LearnCard {
  explanation: string
  rootCause: string
  /** Students: a "what went wrong?" question. */
  mcq?: { question: string; options: string[]; answerIndex: number; why: string }
  /** Vibe coders (and devs): weaknesses even when the code "works". */
  risks: { severity: 'high' | 'medium' | 'low'; title: string; detail: string }[]
  concepts: string[]
  /** Lines (from the NEW code) worth highlighting, as short code excerpts. */
  highlights: string[]
}

const STYLE: Record<Profile, string> = {
  developer: 'The reader is an experienced developer. Be formal, crisp and precise (no fluff, no emojis). Give the root cause, why the fix is correct, edge cases and regression risks. Skip the mcq (set "mcq": null).',
  student: 'The reader is a CS student practising logic. Be brief and encouraging with a light, humorous tone. Explain the reasoning behind the error in 2-3 short sentences, name the underlying concept(s), and write ONE multiple-choice question ("what went wrong here?") with exactly 4 plausible options, one correct, plus a one-sentence "why". Do not reveal the answer in the question.',
  vibe: 'The reader is a non-technical "vibe coder". Use plain everyday words, no jargon, a friendly humorous tone. Explain in 2 sentences what was broken and what changed. Then list potential weaknesses or risks in the changed/related code even if it "works" (security holes, missing input checks, fragile assumptions, no tests) with severity high/medium/low. Set "mcq": null.',
}

const SYSTEM = (p: Profile) => `You explain code fixes. ${STYLE[p]}
Reply with ONLY one JSON object, no markdown fences, shaped exactly:
{"rootCause": string, "explanation": string, "mcq": {"question": string, "options": [string,string,string,string], "answerIndex": number, "why": string} | null, "risks": [{"severity": "high"|"medium"|"low", "title": string, "detail": string}], "concepts": [string], "highlights": [string]}
"highlights" are short verbatim excerpts (under 80 chars) of the changed lines in the NEW code. Keep "risks" to at most 4 items and only real, specific ones. Never invent code that is not in the diff.`

function extractJson(text: string): unknown {
  const t = text.replace(/<think>[\s\S]*?<\/think>/g, '')
  const start = t.indexOf('{'), end = t.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const raw = t.slice(start, end + 1)
  for (const cand of [raw, raw.replace(/,\s*([}\]])/g, '$1')]) { try { return JSON.parse(cand) } catch { /* try next */ } }
  return null
}

export async function learn(input: { llm: LlmConfig; profile: Profile; issue: { title: string; body?: string }; diff: string; summary?: string }): Promise<LearnCard> {
  const p: Profile = input.profile === 'student' || input.profile === 'vibe' ? input.profile : 'developer'
  const r = await complete({ ...input.llm, native: false }, [
    { role: 'system', content: SYSTEM(p) },
    { role: 'user', content: `Issue: ${input.issue.title}\n${(input.issue.body ?? '').slice(0, 1500)}\n\nAgent's summary: ${input.summary ?? '(none)'}\n\nDiff:\n${input.diff.slice(0, 12_000)}` },
  ])
  const j = extractJson(r.text) as Partial<LearnCard> | null
  const opts = j?.mcq?.options
  const mcq = p === 'student' && j?.mcq && Array.isArray(opts) && opts.length === 4 && Number.isInteger(j.mcq.answerIndex) && j.mcq.answerIndex >= 0 && j.mcq.answerIndex < 4 ? j.mcq : undefined
  return {
    explanation: String(j?.explanation ?? (j ? '' : r.text.slice(0, 600))),
    rootCause: String(j?.rootCause ?? ''),
    mcq,
    risks: Array.isArray(j?.risks) ? j!.risks!.slice(0, 4).filter((x) => x && x.title) : [],
    concepts: Array.isArray(j?.concepts) ? j!.concepts!.slice(0, 5).map(String) : [],
    highlights: Array.isArray(j?.highlights) ? j!.highlights!.slice(0, 6).map(String) : [],
  }
}
