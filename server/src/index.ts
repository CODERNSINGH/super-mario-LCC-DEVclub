import express from 'express'
import cors from 'cors'
import { estimate } from './estimate.js'
import { changedFiles, commitLocal, commitPushPr, createBranch, currentDiff, originalContent } from './git.js'
import { detectTestCommand, listDir, readRepoFile } from './repo/info.js'
import { runShell, safePath } from './tools/shell.js'
import { SessionStore } from './agent/session.js'
import { existsSync, statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'

const app = express()
app.use(cors(), express.json({ limit: '4mb' }))

const wrap = (fn: express.RequestHandler): express.RequestHandler => async (req, res, next) => {
  try { await fn(req, res, next) } catch (e) { res.status(500).json({ error: (e as Error).message }) }
}

app.get('/health', (_q, r) => { r.json({ ok: true }) })

app.post('/estimate', wrap(async (q, r) => {
  const { root, issueText, provider, model, llm, withTips } = q.body
  r.json(await estimate(root, issueText, provider, model, withTips ? llm : undefined))
}))

app.post('/tests/detect', wrap(async (q, r) => { r.json({ command: await detectTestCommand(q.body.root) }) }))
app.post('/fs/list', wrap(async (q, r) => { r.json(await listDir(q.body.root, q.body.path ?? '')) }))
app.post('/fs/read', wrap(async (q, r) => { r.json({ content: await readRepoFile(q.body.root, q.body.path) }) }))
app.post('/fs/write', wrap(async (q, r) => { await writeFile(safePath(q.body.root, q.body.path), q.body.content); r.json({ ok: true }) }))
app.post('/git/changes', wrap(async (q, r) => { r.json({ files: await changedFiles(q.body.root) }) }))
app.post('/git/diff', wrap(async (q, r) => { r.json({ diff: await currentDiff(q.body.root) }) }))
app.post('/git/original', wrap(async (q, r) => { r.json({ content: await originalContent(q.body.root, q.body.path) }) }))
app.post('/git/branch', wrap(async (q, r) => { await createBranch(q.body.root, q.body.name); r.json({ ok: true }) }))
app.post('/git/reset', wrap(async (q, r) => { await runShell(q.body.root, 'git checkout -- . && git clean -fd'); r.json({ ok: true }) }))
app.post('/git/pr', wrap(async (q, r) => { r.json(await commitPushPr(q.body)) }))

app.post('/git/commit', wrap(async (q, r) => { r.json(await commitLocal(q.body)) }))

// ── Live sessions: streaming, steering and follow-up chat ─────────────────────────────────────────
const sessions = new SessionStore()

const sseHeaders = (res: express.Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
}

app.post('/session', wrap(async (q, r) => {
  const { root, llm, mode, issue, notes, testCommand, maxSteps, timeLimitMin, text } = q.body ?? {}
  if (!root || !existsSync(root) || !statSync(root).isDirectory()) { r.status(400).json({ error: 'root must be an existing directory' }); return }
  if (!llm?.baseUrl || !llm?.model) { r.status(400).json({ error: 'llm config (baseUrl, model) is required' }); return }
  const m = mode === 'chat' ? 'chat' : 'solve'
  if (m === 'solve' && !issue?.title) { r.status(400).json({ error: 'solve mode needs issue {title, body}' }); return }
  const s = sessions.create({ root, llm, mode: m, issue, notes, testCommand, maxSteps, timeLimitMin })
  s.start(typeof text === 'string' ? text : undefined)
  r.json({ id: s.id })
}))

app.get('/session/:id/events', (q, res) => {
  const s = sessions.get(String(q.params.id))
  if (!s) { res.status(404).json({ error: 'unknown session' }); return }
  sseHeaders(res)
  res.write(': connected\n\n')
  const unsub = s.subscribe((e) => res.write(`data: ${JSON.stringify({ type: e.type, data: e.data })}\n\n`))
  const beat = setInterval(() => res.write(': ping\n\n'), 15_000)
  res.on('close', () => { clearInterval(beat); unsub() })
})

app.post('/session/:id/message', wrap(async (q, r) => {
  const s = sessions.get(String(q.params.id))
  if (!s) { r.status(404).json({ error: 'unknown session' }); return }
  const text = typeof q.body?.text === 'string' ? q.body.text : ''
  if (!text.trim()) { r.status(400).json({ error: 'text is required' }); return }
  r.json(await s.send(text))
}))

app.post('/session/:id/stop', (q, r) => {
  const s = sessions.get(String(q.params.id))
  if (!s) { r.status(404).json({ error: 'unknown session' }); return }
  s.stop()
  r.json({ ok: true })
})

app.delete('/session/:id', (q, r) => { r.json({ ok: sessions.delete(String(q.params.id)) }) })

// Legacy one-shot stream (eval scripts, older clients): a session that lives for a single solve turn.
app.post('/run', async (req, res) => {
  sseHeaders(res)
  const { root, llm, issue, notes, testCommand, maxSteps, timeLimitMin } = req.body
  const s = sessions.create({ root, llm, mode: 'solve', issue, notes, testCommand, maxSteps, timeLimitMin })
  const HIDDEN = new Set(['token', 'thinking', 'phase', 'user'])
  const unsub = s.subscribe((e) => { if (!HIDDEN.has(e.type)) res.write(`data: ${JSON.stringify({ type: e.type, data: e.data })}\n\n`) })
  res.on('close', () => { s.stop(); unsub(); setTimeout(() => sessions.delete(s.id), 200) })
  s.start()
  await s.idle()
  unsub(); res.end(); sessions.delete(s.id)
})

const port = Number(process.env.SAKAI_SERVER_PORT ?? 4477)
app.listen(port, '127.0.0.1', () => console.log(`sakai-server listening on :${port}`))
