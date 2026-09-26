import { ipcMain, type WebContents } from 'electron'
import * as pty from 'node-pty'
import { homedir } from 'node:os'

interface Session { pty: pty.IPty; owner: WebContents }
const sessions = new Map<number, Session>()
let nextId = 1

/** Never send to a window/webContents that has been closed or reloaded away (shell output can outlive it). */
const send = (wc: WebContents, channel: string, ...args: unknown[]): void => {
  if (!wc.isDestroyed()) wc.send(channel, ...args)
}

function dispose(id: number): void {
  const s = sessions.get(id)
  if (!s) return
  sessions.delete(id)
  try { s.pty.kill() } catch { /* already exited */ }
}

export function registerTerminalIpc(): void {
  ipcMain.handle('term:create', (e, cwd: string | null, cols: number, rows: number) => {
    const id = nextId++
    const owner = e.sender
    const p = pty.spawn(process.env.SHELL || '/bin/zsh', ['-l'], { name: 'xterm-256color', cols, rows, cwd: cwd || homedir(), env: process.env as Record<string, string> })
    sessions.set(id, { pty: p, owner })
    p.onData((d) => send(owner, 'term:data', id, d))
    p.onExit(() => { sessions.delete(id); send(owner, 'term:exit', id) })
    // Clean up shells when their window closes or the renderer reloads (e.g. dev hot reload), so none leak.
    owner.once('destroyed', () => dispose(id))
    const onNav = (details: { isMainFrame?: boolean }): void => { if (details.isMainFrame !== false) { owner.removeListener('did-start-navigation', onNav); dispose(id) } }
    owner.on('did-start-navigation', onNav)
    return id
  })
  ipcMain.on('term:write', (_e, id: number, data: string) => { try { sessions.get(id)?.pty.write(data) } catch { /* closed */ } })
  ipcMain.on('term:resize', (_e, id: number, cols: number, rows: number) => { try { sessions.get(id)?.pty.resize(cols, rows) } catch { /* closed */ } })
  ipcMain.on('term:kill', (_e, id: number) => dispose(id))
}

export function killAllTerminals(): void { [...sessions.keys()].forEach(dispose) }
