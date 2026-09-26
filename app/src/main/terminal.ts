import { ipcMain, BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import { homedir } from 'node:os'

const sessions = new Map<number, pty.IPty>()
let nextId = 1

export function registerTerminalIpc(): void {
  ipcMain.handle('term:create', (e, cwd: string | null, cols: number, rows: number) => {
    const id = nextId++
    const p = pty.spawn(process.env.SHELL || '/bin/zsh', ['-l'], { name: 'xterm-256color', cols, rows, cwd: cwd || homedir(), env: process.env as Record<string, string> })
    const win = BrowserWindow.fromWebContents(e.sender)
    p.onData((d) => win?.webContents.send('term:data', id, d))
    p.onExit(() => { sessions.delete(id); win?.webContents.send('term:exit', id) })
    sessions.set(id, p)
    return id
  })
  ipcMain.on('term:write', (_e, id: number, data: string) => sessions.get(id)?.write(data))
  ipcMain.on('term:resize', (_e, id: number, cols: number, rows: number) => { try { sessions.get(id)?.resize(cols, rows) } catch { /* closed */ } })
  ipcMain.on('term:kill', (_e, id: number) => { sessions.get(id)?.kill(); sessions.delete(id) })
}

export function killAllTerminals(): void { sessions.forEach((p) => p.kill()); sessions.clear() }
