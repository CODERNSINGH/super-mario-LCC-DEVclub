import { useApp } from '../store'
import { useSession, type Side, type PanelTab } from './session'
import { local } from './bridge'
import { pushRecent } from './recent'
import { resetChat, currentRoot } from './chat'

const S = () => useSession.getState()

export function toggleSidebar() { S().set({ sideOpen: !S().sideOpen }) }
export function toggleAgent() { S().set({ agentOpen: !S().agentOpen }) }
export function togglePanel() { S().set({ panelOpen: !S().panelOpen, panelMax: false }) }
export function showSide(view: Side) { const s = S(); s.set(s.side === view && s.sideOpen ? { sideOpen: false } : { side: view, sideOpen: true }) }
export function showPanel(tab: PanelTab) { S().set({ panel: tab, panelOpen: true }) }
export const openTerminal = () => showPanel('terminal')
export const openPalette = (mode: 'commands' | 'files' = 'commands') => S().set({ palette: mode })
export function openSettings() { S().openTab({ id: 'settings', kind: 'settings', title: 'Settings' }) }
export function openWelcome() { S().openTab({ id: 'welcome', kind: 'welcome', title: 'Welcome' }) }
export function openFile(path: string) { S().openTab({ id: `file:${path}`, kind: 'file', title: path.split('/').pop() ?? path, path }) }
export function openDiff(path: string) { S().openTab({ id: `diff:${path}`, kind: 'diff', title: `${path.split('/').pop()} (Working Tree)`, path }) }
export function newTask() { S().set({ agentOpen: true, agentView: 'task' }) }
export function newChat() { const r = currentRoot(); if (r) void resetChat(r); S().set({ agentOpen: true, agentView: 'chat' }) }
export function askAgent(text: string) { S().set({ agentOpen: true, agentView: 'chat', composerText: text }) }
export const changeModel = () => useApp.getState().set({ step: 'llm' })
export const closeFolder = () => useApp.getState().set({ step: 'repo' })

/** Switches the workspace to a local folder (no GitHub needed). */
export async function openLocalFolder(path: string): Promise<void> {
  const info = await local.inspect(path)
  const go = async () => {
    await local.ensureRepo(path)
    pushRecent({ kind: 'local', value: path })
    S().reset()
    useApp.getState().set({ mode: 'local', repo: null, localPath: path, step: useApp.getState().llm ? 'workspace' : 'llm' })
  }
  if (!info.isGitRepo) {
    S().set({ modal: { title: 'Initialize a Git repository?', body: `“${info.name}” is not a git repository. Sakai uses git to track and undo the agent’s changes, so it will run “git init” and create an initial commit here. Your files are not modified.`, confirm: 'Initialize', cancel: 'Cancel', onConfirm: () => void go() } })
    return
  }
  await go()
}

export async function pickAndOpenFolder(): Promise<void> {
  try {
    const p = await local.pickFolder()
    if (p) await openLocalFolder(p)
  } catch (e) { S().log(`✗ ${(e as Error).message}`) }
}

export async function openDemoProject(): Promise<void> {
  try { await openLocalFolder(await local.createDemo()) } catch (e) { S().log(`✗ ${(e as Error).message}`) }
}
