import { randomUUID } from 'node:crypto'
import { newState, pushUserMessage, runTurn, type AgentEvent, type Mode, type SessionState } from './loop.js'
import type { LlmConfig } from '../llm/client.js'

export interface SessionInit {
  root: string
  llm: LlmConfig
  mode: Mode
  issue?: { number?: number; title: string; body: string }
  notes?: string
  testCommand?: string
  maxSteps?: number
  /** Optional whole-run wall-clock limit in minutes. Default: none (per-step watchdog only). */
  timeLimitMin?: number
  /** Audience for the final summary: developer (default) | student | vibe. */
  profile?: 'developer' | 'student' | 'vibe'
  /** Test seam: replace the model call. */
  deps?: Partial<SessionState['deps']>
}

type Listener = (e: AgentEvent) => void
const MAX_LOG = 20_000

/**
 * A long-lived conversation with the agent: replayable event log, live subscribers, a queue of user
 * messages that are injected before the next model call, and follow-up turns after the agent finishes.
 */
export class Session {
  readonly id = randomUUID()
  readonly mode: Mode
  readonly state: SessionState
  running = false
  lastActive = Date.now()
  private log: AgentEvent[] = []
  private listeners = new Set<Listener>()
  private queue: string[] = []
  private ac: AbortController | null = null
  private disposed = false
  private current: Promise<void> = Promise.resolve()
  private readonly maxSteps: number
  private readonly timeLimitMs: number

  constructor(init: SessionInit) {
    this.mode = init.mode
    this.maxSteps = init.maxSteps ?? 60
    // No whole-run limit by default (0 = none). Stuck steps are restarted individually by the loop's watchdog.
    this.timeLimitMs = init.timeLimitMin && init.timeLimitMin > 0 ? Math.min(120, init.timeLimitMin) * 60_000 : 0
    this.state = newState({ mode: init.mode, root: init.root, llm: init.llm, issue: init.issue, notes: init.notes, testCommand: init.testCommand, deps: init.deps })
  }

  /** Begins the first turn: solve sessions start working immediately; chat waits for the first message. */
  start(text?: string): void {
    if (this.mode === 'solve') this.runTurn('work')
    else if (text) void this.send(text)
  }

  /** Resolves when the current turn (if any) has finished — used by tests and one-shot callers. */
  idle(): Promise<void> { return this.current }

  emit(e: AgentEvent): void {
    this.lastActive = Date.now()
    // Coalesce streamed deltas in the replay log so reconnecting clients get compact history.
    const last = this.log[this.log.length - 1]
    if ((e.type === 'token' || e.type === 'thinking') && last?.type === e.type) last.data = String(last.data) + String(e.data)
    else this.log.push({ type: e.type, data: e.data })
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG)
    for (const l of this.listeners) l(e)
  }

  /** Replays everything so far, then streams live events. Returns an unsubscribe function. */
  subscribe(l: Listener): () => void {
    for (const e of this.log) l(e)
    this.listeners.add(l)
    return () => { this.listeners.delete(l) }
  }

  /** User message: injected before the next model call if a turn is running, otherwise starts a follow-up turn. */
  async send(text: string): Promise<{ queued: boolean }> {
    const t = text.trim()
    if (!t || this.disposed) return { queued: false }
    if (this.running) { this.queue.push(t); return { queued: true } }
    this.emit({ type: 'user', data: t })
    this.runTurn(this.mode === 'chat' ? 'chat' : 'followup', t)
    return { queued: false }
  }

  /** Aborts the running turn. Pending queued messages are dropped (the user chose to stop). */
  stop(): void { this.queue = []; this.ac?.abort() }

  dispose(): void {
    this.disposed = true
    this.stop()
    this.listeners.clear()
    this.queue = []
  }

  private runTurn(kind: 'work' | 'followup' | 'chat', text?: string): void {
    this.running = true
    const ac = new AbortController()
    this.ac = ac
    // Never run forever: user Stop OR the wall-clock deadline aborts the model call and the turn.
    const deadline = this.timeLimitMs ? AbortSignal.timeout(this.timeLimitMs) : new AbortController().signal
    const signal = this.timeLimitMs ? AbortSignal.any([ac.signal, deadline]) : ac.signal
    this.emit({ type: 'phase', data: 'running' })
    this.current = (async () => {
      try {
        if (text !== undefined && kind !== 'work') await pushUserMessage(this.state, text, kind)
        const result = await runTurn(this.state, {
          emit: (e) => this.emit(e),
          signal,
          drain: () => {
            const msgs = this.queue.splice(0)
            for (const m of msgs) this.emit({ type: 'user', data: m })
            return msgs
          },
          maxSteps: this.maxSteps,
        }, kind)
        this.state.turn++
        if (deadline.aborted && !ac.signal.aborted) result.summary = `Time limit reached (${this.timeLimitMs / 60_000} min) — stopped. Changes so far are kept; review the diff or send a message to continue.`
        this.emit({ type: 'done', data: result })
      } catch (e) {
        if (signal.aborted) this.emit({ type: 'done', data: { finished: false, summary: deadline.aborted && !ac.signal.aborted ? `Time limit reached (${this.timeLimitMs / 60_000} min) — stopped.` : 'Stopped by user', inputTokens: this.state.inT, outputTokens: this.state.outT, steps: 0 } })
        else this.emit({ type: 'error', data: (e as Error).message })
        this.state.turn++
      } finally {
        this.running = false
        this.ac = null
        this.emit({ type: 'phase', data: 'idle' })
        // Messages that arrived after the last model call of the turn become the next turn.
        if (this.queue.length && !this.disposed) {
          const next = this.queue.splice(0).join('\n\n')
          this.emit({ type: 'user', data: next })
          this.runTurn(this.mode === 'chat' ? 'chat' : 'followup', next)
        }
      }
    })()
  }
}

/** In-memory registry with idle eviction. */
export class SessionStore {
  private sessions = new Map<string, Session>()
  private timer: ReturnType<typeof setInterval>

  constructor(private ttlMs = 6 * 3600_000, private max = 30) {
    this.timer = setInterval(() => this.sweep(), 10 * 60_000)
    this.timer.unref()
  }

  create(init: SessionInit): Session {
    if (this.sessions.size >= this.max) this.sweep(true)
    const s = new Session(init)
    this.sessions.set(s.id, s)
    return s
  }
  get(id: string): Session | undefined { return this.sessions.get(id) }
  delete(id: string): boolean {
    const s = this.sessions.get(id)
    s?.dispose()
    return this.sessions.delete(id)
  }
  private sweep(force = false): void {
    const now = Date.now()
    const idle = [...this.sessions.values()].filter((s) => !s.running).sort((a, b) => a.lastActive - b.lastActive)
    for (const s of idle) if (force ? this.sessions.size >= this.max : now - s.lastActive > this.ttlMs) this.delete(s.id)
  }
}
