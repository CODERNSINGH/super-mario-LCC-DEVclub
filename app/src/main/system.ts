import { ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { gitInstalled } from './git'

function nodeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const p = spawn('node', ['--version'], { stdio: 'ignore' })
      p.on('error', () => resolve(false))
      p.on('close', (c) => resolve(c === 0))
    } catch { resolve(false) }
  })
}

async function online(): Promise<boolean> {
  try { await fetch('https://api.github.com/zen', { method: 'HEAD', signal: AbortSignal.timeout(4000) }); return true } catch { return false }
}

export function registerSystemIpc(): void {
  // Used by the renderer's first-run banner: missing git blocks cloning/committing, missing node blocks JS test runs.
  ipcMain.handle('system:check', async () => {
    const [git, node, net] = await Promise.all([gitInstalled(), nodeAvailable(), online()])
    return { git, node, online: net }
  })
}
