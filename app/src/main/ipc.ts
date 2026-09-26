import { ipcMain } from 'electron'
import { fetchUser, listIssues, pollDeviceFlow, startDeviceFlow, type DeviceCode } from './github'
import { deleteSecret, getSecret, setSecret } from './store'
import { registerRepoIpc } from './repo'
import { registerLlmIpc } from './llm'
import { registerTerminalIpc } from './terminal'
import { SERVER_PORT } from './env'

export function registerIpc(): void {
  ipcMain.handle('github:start', () => startDeviceFlow())
  ipcMain.handle('github:poll', async (_e, code: DeviceCode) => {
    const token = await pollDeviceFlow(code)
    setSecret('github', token)
    return fetchUser(token)
  })
  ipcMain.handle('github:user', async () => {
    const t = getSecret('github')
    return t ? fetchUser(t).catch(() => null) : null
  })
  ipcMain.handle('github:token', () => getSecret('github'))
  ipcMain.handle('github:signout', () => deleteSecret('github'))
  ipcMain.handle('github:issues', (_e, repo: string) => {
    const t = getSecret('github')
    if (!t) throw new Error('Not signed in')
    return listIssues(t, repo)
  })
  ipcMain.handle('secret:set', (_e, k: string, v: string) => setSecret(k, v))
  ipcMain.handle('secret:get', (_e, k: string) => getSecret(k))
  registerRepoIpc(getSecret)
  registerLlmIpc()
  registerTerminalIpc()
  ipcMain.handle('server:url', () => `http://127.0.0.1:${SERVER_PORT()}`)
}
