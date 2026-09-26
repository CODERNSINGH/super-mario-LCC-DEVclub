import express from 'express'
import cors from 'cors'
import { runAgent } from './agent/loop.js'
import { estimate } from './estimate.js'
import { changedFiles, commitPushPr, createBranch, currentDiff, originalContent } from './git.js'
import { detectTestCommand, listDir, readRepoFile } from './repo/info.js'
import { runShell, safePath } from './tools/shell.js'
import { writeFile } from 'node:fs/promises'

const app = express()
app.use(cors(), express.json({ limit: '4mb' }))

const wrap = (fn: express.RequestHandler): express.RequestHandler => async (req, res, next) => {
  try { await fn(req, res, next) } catch (e) {
    console.error('[server error]', e)
    res.status(500).json({ error: (e as Error).message })
  }
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

// Server-sent events stream of one agent run.
app.post('/run', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.flushHeaders()
  const ac = new AbortController()
  res.on('close', () => ac.abort())
  const send = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`)
  try {
    const { root, llm, issue, notes, testCommand, maxSteps } = req.body
    const result = await runAgent({ root, llm, issue, notes, testCommand, maxSteps, onEvent: send, signal: ac.signal })
    send({ type: 'done', data: result })
  } catch (e) {
    send({ type: 'error', data: (e as Error).message })
  }
  res.end()
})

const port = Number(process.env.SAKAI_SERVER_PORT ?? 4477)
app.listen(port, '127.0.0.1', () => console.log(`sakai-server listening on :${port}`))
