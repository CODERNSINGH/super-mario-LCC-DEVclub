import { create } from 'zustand'

export interface LearnResult {
  explanation: string; rootCause: string
  mcq?: { question: string; options: string[]; answerIndex: number; why: string }
  risks: { severity: 'high' | 'medium' | 'low'; title: string; detail: string }[]
  concepts: string[]; highlights: string[]
}

/** Strings from the latest "learn" card; editors underline changed lines that contain them. */
export const useHighlights = create<{ terms: string[]; set: (t: string[]) => void }>((set) => ({ terms: [], set: (terms) => set({ terms }) }))

export const getStreak = (): number => { try { return Number(localStorage.getItem('sakai.streak') ?? 0) || 0 } catch { return 0 } }
export const setStreak = (n: number): void => { try { localStorage.setItem('sakai.streak', String(n)) } catch { /* ignore */ } }
