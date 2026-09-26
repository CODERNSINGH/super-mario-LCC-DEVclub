import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { SERVER_PORT } from './env'

let child: ChildProcess | null = null

/** Runs the harness server as a child process using Electron's bundled Node. */
export async function startServer(): Promise<void> {
  const entry = app.isPackaged ? join(process.resourcesPath, 'server/index.js') : join(__dirname, '../../../server/dist/index.js')
  if (!existsSync(entry)) { console.error(`[sakai] server not built: ${entry} (run npm run build -w server)`); return }
  child = spawn(process.execPath, [entry], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', SAKAI_SERVER_PORT: String(SERVER_PORT()) },
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  child.on('exit', () => { child = null })
  const url = `http://127.0.0.1:${SERVER_PORT()}/health`
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(url)).ok) return } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150))
  }
}

export function stopServer(): void { child?.kill(); child = null }
