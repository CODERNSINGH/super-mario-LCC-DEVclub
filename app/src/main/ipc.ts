import { ipcMain } from 'electron'
import { cancelDeviceFlow, checkToken, fetchUser, listIssues, openVerification, pollDeviceFlow, startDeviceFlow, type DeviceCode, type GhUser } from './github'
import { deleteSecret, getSecret, setSecret } from './store'
import { registerRepoIpc } from './repo'
import { registerLlmIpc } from './llm'
import { registerTerminalIpc } from './terminal'
import { registerLocalIpc } from './local'
import { registerSystemIpc } from './system'
import { SERVER_PORT } from './env'

export function registerIpc(): void {
  ipcMain.handle('github:start', () => startDeviceFlow())
  ipcMain.handle('github:poll', async (_e, code: DeviceCode) => {
    const token = await pollDeviceFlow(code)
    const user = await fetchUser(token)
    setSecret('github', token)
    setSecret('github_user', JSON.stringify(user))
    return user
  })
  ipcMain.handle('github:cancel', () => cancelDeviceFlow())
  ipcMain.handle('github:open', (_e, uri?: string) => openVerification(uri))
  // Signed-out is a normal state: no token, revoked token, or unreadable token all resolve to null (never throw).
  // Offline keeps the user signed in using the last known profile.
  ipcMain.handle('github:user', async () => {
    const t = getSecret('github')
    if (!t) return null
    const r = await checkToken(t)
    if (r.state === 'ok') { setSecret('github_user', JSON.stringify(r.user)); return r.user }
    if (r.state === 'invalid') { deleteSecret('github'); deleteSecret('github_user'); return null }
    const cached = getSecret('github_user')
    try { return cached ? (JSON.parse(cached) as GhUser) : null } catch { return null }
  })
  ipcMain.handle('github:token', () => getSecret('github'))
  ipcMain.handle('github:signout', () => { cancelDeviceFlow(); deleteSecret('github'); deleteSecret('github_user') })
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
  registerLocalIpc()
  registerSystemIpc()
  ipcMain.handle('server:url', () => `http://127.0.0.1:${SERVER_PORT()}`)
}
