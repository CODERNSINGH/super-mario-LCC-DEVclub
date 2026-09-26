import { ipcMain } from 'electron'
import {
  fetchUser,
  listIssues,
  pollDeviceFlow,
  startDeviceFlow,
  hasOAuthConfig,
  getClientId,
  setClientId,
  type DeviceCode,
} from './github'
import { deleteSecret, getSecret, setSecret } from './store'
import { registerRepoIpc } from './repo'
import { registerLlmIpc } from './llm'
import { registerTerminalIpc } from './terminal'
import { SERVER_PORT } from './env'

export function registerIpc(): void {
  const savedClientId = getSecret('github_client_id')
  if (savedClientId) setClientId(savedClientId)

  ipcMain.handle('github:has-oauth', () => hasOAuthConfig())
  ipcMain.handle('github:get-client-id', () => getClientId())
  ipcMain.handle('github:set-client-id', (_e, id: string) => {
    setClientId(id)
    setSecret('github_client_id', id)
    return true
  })
  ipcMain.handle('github:start', () => startDeviceFlow())
  ipcMain.handle('github:poll', async (_e, code: DeviceCode) => {
    const token = await pollDeviceFlow(code)
    setSecret('github', token)
    return fetchUser(token)
  })
  ipcMain.handle('github:token-login', async (_e, token: string) => {
    const trimmed = (token ?? '').trim()
    if (!trimmed) throw new Error('Please enter a GitHub personal access token')
    const user = await fetchUser(trimmed)
    setSecret('github', trimmed)
    return user
  })
  ipcMain.handle('github:user', async () => {
    const t = getSecret('github')
    return t ? fetchUser(t).catch(() => null) : null
  })
  ipcMain.handle('github:token', () => getSecret('github'))
  ipcMain.handle('github:signout', () => deleteSecret('github'))
  ipcMain.handle('github:issues', (_e, repo: string) => {
    const t = getSecret('github')
    return listIssues(t, repo)
  })
  ipcMain.handle('secret:set', (_e, k: string, v: string) => setSecret(k, v))
  ipcMain.handle('secret:get', (_e, k: string) => getSecret(k))
  registerRepoIpc(getSecret)
  registerLlmIpc()
  registerTerminalIpc()
  ipcMain.handle('server:url', () => `http://127.0.0.1:${SERVER_PORT()}`)
}
