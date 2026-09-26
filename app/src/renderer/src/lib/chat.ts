import { create } from 'zustand'
import { post, resolveLlm, sessionUrl } from './api'
import { useSession } from './session'
import { useApp } from '../store'
import { onAgentEdit, refreshChanges } from './diff'

export interface ToolCall { tool: string; args: Record<string, string> }
export type Item =
  | { kind: 'task'; id: string; title: string; body: string; number?: number }
  | { kind: 'user'; id: string; text: string; pending?: boolean }
  | { kind: 'ai'; id: string; text: string; thinking: string; streaming: boolean }
  | { kind: 'tool'; id: string; call: ToolCall; out?: string; edit?: { path: string; old: string; new: string }; running: boolean }
  | { kind: 'result'; id: string; finished: boolean; summary: string }
  | { kind: 'error'; id: string; text: string }
  | { kind: 'note'; id: string; text: string }
  | { kind: 'phase'; id: string; label: string }

export interface Usage { inputTokens: number; outputTokens: number; steps: number }
export interface Chat { sessionId: string | null; mode: 'solve' | 'chat'; items: Item[]; phase: 'idle' | 'running'; usage: Usage; status: string; startedAt: number | null; limitMin: number }

const blank = (): Chat => ({ sessionId: null, mode: 'chat', items: [], phase: 'idle', usage: { inputTokens: 0, outputTokens: 0, steps: 0 }, status: '', startedAt: null, limitMin: 8 })

interface Store { chats: Record<string, Chat>; patch: (root: string, f: (c: Chat) => Chat) => void }
export const useChatStore = create<Store>((set) => ({
  chats: {},
  patch: (root, f) => set((s) => ({ chats: { ...s.chats, [root]: f(s.chats[root] ?? blank()) } })),
}))

export const useChat = (root: string | null): Chat => useChatStore((s) => (root ? s.chats[root] : undefined)) ?? blank()

let uid = 0
const nid = () => `i${++uid}`
const streams = new Map<string, AbortController>()

type Ev =
  | { type: 'status' | 'thinking' | 'token' | 'assistant' | 'user' | 'error'; data: string }
  | { type: 'tool'; data: { call: ToolCall; out?: string; edit?: { path: string; old: string; new: string } } }
  | { type: 'usage'; data: Usage }
  | { type: 'phase'; data: 'running' | 'idle' }
  | { type: 'done'; data: { finished: boolean; summary: string; inputTokens: number; outputTokens: number; steps: number } }

export const PHASE = /^(Preparing environment|Running baseline tests|Running the issue reproduction|Finding relevant code|Running tests|Starting a fresh attempt)/

/** Applies one server event to a chat. Pure and idempotent enough to replay history from scratch. */
export function reduce(c: Chat, e: Ev): Chat {
  const items = [...c.items]
  const last = items[items.length - 1]
  const streamingAi = (): Extract<Item, { kind: 'ai' }> => {
    if (last?.kind === 'ai' && last.streaming) return { ...last }
    return { kind: 'ai', id: nid(), text: '', thinking: '', streaming: true }
  }
  const putAi = (ai: Extract<Item, { kind: 'ai' }>) => { if (last?.kind === 'ai' && last.streaming) items[items.length - 1] = ai; else items.push(ai) }
  const closeAi = () => { const l = items[items.length - 1]; if (l?.kind === 'ai' && l.streaming) items[items.length - 1] = { ...l, streaming: false } }

  switch (e.type) {
    case 'status': {
      if (PHASE.test(e.data) && !(last?.kind === 'phase' && last.label === e.data)) items.push({ kind: 'phase', id: nid(), label: e.data })
      return { ...c, items, status: e.data }
    }
    case 'phase': if (e.data === 'idle') closeAi(); return { ...c, items, phase: e.data, status: e.data === 'idle' ? '' : c.status, startedAt: e.data === 'idle' ? null : c.startedAt ?? Date.now() }
    case 'usage': return { ...c, usage: e.data }
    case 'thinking': { const a = streamingAi(); a.thinking += e.data; putAi(a); return { ...c, items } }
    case 'token': { const a = streamingAi(); a.text += e.data; putAi(a); return { ...c, items } }
    case 'assistant': {
      const a = streamingAi(); a.text = e.data; a.streaming = false
      putAi(a)
      return { ...c, items }
    }
    case 'user': {
      const i = items.findIndex((x) => x.kind === 'user' && x.pending && x.text === e.data)
      if (i >= 0) items[i] = { ...(items[i] as Extract<Item, { kind: 'user' }>), pending: false }
      else items.push({ kind: 'user', id: nid(), text: e.data })
      return { ...c, items }
    }
    case 'tool': {
      closeAi()
      const t = e.data
      const runningIdx = [...items].reverse().findIndex((x) => x.kind === 'tool' && x.running && JSON.stringify(x.call) === JSON.stringify(t.call))
      if (t.out !== undefined && runningIdx >= 0) {
        const idx = items.length - 1 - runningIdx
        items[idx] = { ...(items[idx] as Extract<Item, { kind: 'tool' }>), out: t.out, edit: t.edit, running: false }
      } else items.push({ kind: 'tool', id: nid(), call: t.call, out: t.out, edit: t.edit, running: t.out === undefined })
      return { ...c, items }
    }
    case 'done': closeAi(); items.push({ kind: 'result', id: nid(), finished: e.data.finished, summary: e.data.summary }); return { ...c, items, usage: { inputTokens: e.data.inputTokens, outputTokens: e.data.outputTokens, steps: e.data.steps } }
    case 'error': closeAi(); items.push({ kind: 'error', id: nid(), text: e.data }); return { ...c, items }
  }
}

const clip = (t: string, n = 3) => strip(t).split('\n').filter(Boolean).slice(0, n).join(' ⏎ ').slice(0, 300)
const strip = (t: string) => t.replace(/\u001b\[[0-9;]*m/g, '')
const WRITES = new Set(['replace', 'write_file', 'revert'])

/** Live activity for the status bar + Output/Debug panels: every event is logged with a timestamp. */
function mirror(e: Ev) {
  const s = useSession.getState()
  const log = (t: string, l?: 'info' | 'warn' | 'error') => s.log(t, l, true)
  switch (e.type) {
    case 'status':
      s.set({ activity: e.data })
      log(PHASE.test(e.data) ? `── Phase: ${e.data} ──` : `· ${e.data}`, /Invalid tool call|rejected/.test(e.data) ? 'warn' : 'info'); break
    case 'phase': log(`phase → ${e.data}`); if (e.data === 'idle') s.set({ activity: '' }); break
    case 'user': log(`user: ${e.data.slice(0, 200)}`); break
    case 'usage': log(`usage: ${e.data.inputTokens} in / ${e.data.outputTokens} out · ${e.data.steps} steps`); break
    case 'thinking': case 'token': break
    case 'assistant': s.dbg(`[assistant] ${e.data}`); break
    case 'tool': {
      const a = e.data.call.args
      const argStr = Object.entries(a).map(([k, v]) => `${k}=${JSON.stringify(String(v).slice(0, 80))}`).join(' ')
      if (e.data.out === undefined) { log(`$ ${e.data.call.tool} ${argStr}`); s.dbg(`[tool→] ${JSON.stringify(e.data.call)}`); break }
      const out = strip(e.data.out)
      log(`  ↳ ${e.data.call.tool}: ${clip(out)}`, /FAILING|exit [1-9]|error/i.test(out.slice(0, 200)) ? 'warn' : 'info')
      s.dbg(`[tool←] ${e.data.call.tool} ${argStr}\n${out.split('\n').slice(0, 12).join('\n')}`)
      const fails = [...out.matchAll(/^\s*●\s+(.+)$/gm)].map((m) => m[1].trim())
      if (fails.length) s.set({ problems: fails.map((message) => ({ message, source: 'tests', severity: 'error' as const })) })
      else if (/ALL PASS/.test(out)) s.set({ problems: [] })
      if (WRITES.has(e.data.call.tool) && a.path) onAgentEdit(a.path)
      break
    }
    case 'error': log(`✗ ${e.data}`, 'error'); s.set({ problems: [...s.problems, { message: e.data, source: 'agent', severity: 'error' }] }); break
    case 'done': log(e.data.finished ? `✓ ${e.data.summary}` : `${/^Time limit/.test(e.data.summary) ? '!' : '✗'} ${e.data.summary}`, e.data.finished ? 'info' : /^Time limit/.test(e.data.summary) ? 'warn' : 'error'); void refreshChanges(); break
  }
}

async function attach(root: string, id: string) {
  streams.get(root)?.abort()
  const ac = new AbortController(); streams.set(root, ac)
  useSession.setState((x) => ({ logs: x.logs.filter((l) => !l.agent), debug: [] })) // server replays history
  useChatStore.getState().patch(root, (c) => ({ ...c, items: c.items.filter((i) => i.kind === 'task'), sessionId: id })) // history is replayed by the server
  for (let attempt = 0; attempt < 5 && !ac.signal.aborted; attempt++) {
    try {
      const res = await fetch(`${await sessionUrl()}/session/${id}/events`, { signal: ac.signal })
      if (!res.body) throw new Error('no stream')
      const reader = res.body.getReader(), dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let i: number
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2)
          if (!chunk.startsWith('data: ')) continue
          const ev = JSON.parse(chunk.slice(6)) as Ev
          mirror(ev)
          useChatStore.getState().patch(root, (c) => reduce(c, ev))
        }
      }
      return
    } catch (e) {
      if (ac.signal.aborted) return
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
      useChatStore.getState().patch(root, (c) => ({ ...c, items: c.items.filter((i) => i.kind === 'task') })) // replay again
      if (attempt === 4) useChatStore.getState().patch(root, (c) => reduce(c, { type: 'error', data: `Lost connection to the agent: ${(e as Error).message}` }))
    }
  }
}

export interface StartOpts { issue?: { number?: number; title: string; body: string }; notes?: string; testCommand?: string; maxSteps?: number; timeLimitMin?: number }

/** Creates a session ('solve' for an issue/task, 'chat' for conversation) and attaches to its event stream. */
export async function startSession(root: string, mode: 'solve' | 'chat', o: StartOpts = {}): Promise<string> {
  const llm = await resolveLlm()
  const { id } = await post<{ id: string }>('/session', { root, llm, mode, timeLimitMin: useSession.getState().timeLimitMin, ...o }, true)
  useChatStore.getState().patch(root, () => ({ ...blank(), mode, sessionId: id, phase: 'running', startedAt: Date.now(), limitMin: o.timeLimitMin ?? useSession.getState().timeLimitMin,
    items: o.issue ? [{ kind: 'task', id: nid(), title: o.issue.title, body: o.issue.body, number: o.issue.number }] : [] }))
  void attach(root, id)
  return id
}

export async function sendMessage(root: string, text: string): Promise<void> {
  const t = text.trim()
  if (!t) return
  let c = useChatStore.getState().chats[root]
  if (!c?.sessionId) { await startSession(root, 'chat'); c = useChatStore.getState().chats[root] }
  useChatStore.getState().patch(root, (x) => ({ ...x, items: [...x.items, { kind: 'user', id: nid(), text: t, pending: true }], phase: 'running', startedAt: x.startedAt ?? Date.now(), limitMin: useSession.getState().timeLimitMin }))
  try { await post(`/session/${c.sessionId}/message`, { text: t }, true) } catch (e) {
    useChatStore.getState().patch(root, (x) => reduce({ ...x, phase: 'idle' }, { type: 'error', data: (e as Error).message }))
  }
}

export async function stopSession(root: string): Promise<void> {
  const c = useChatStore.getState().chats[root]
  if (c?.sessionId) await post(`/session/${c.sessionId}/stop`, {}, true).catch(() => undefined)
  useChatStore.getState().patch(root, (x) => ({ ...x, phase: 'idle', status: '' }))
}

export async function resetChat(root: string): Promise<void> {
  const c = useChatStore.getState().chats[root]
  streams.get(root)?.abort(); streams.delete(root)
  if (c?.sessionId) await fetch(`${await sessionUrl()}/session/${c.sessionId}`, { method: 'DELETE' }).catch(() => undefined)
  useChatStore.getState().patch(root, () => blank())
}

/** Re-attach to a running/finished session after a remount (server replays history). */
export function reattach(root: string): void {
  const c = useChatStore.getState().chats[root]
  if (c?.sessionId && !streams.has(root)) void attach(root, c.sessionId)
}

export const currentRoot = () => useApp.getState().localPath
