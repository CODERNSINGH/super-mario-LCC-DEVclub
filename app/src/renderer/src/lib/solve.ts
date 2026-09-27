import { useApp } from '../store'
import { useSession, type Issue } from './session'
import { useChatStore, startSession } from './chat'
import { cleanErr, post } from './api'

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

/** One-click solve: same flow as the task form, with sensible defaults. */
export async function solveIssue(issue: Issue): Promise<void> {
  const app = useApp.getState()
  const S = useSession.getState()
  const root = app.localPath
  if (!root || !app.llm) { S.log('✗ Open a repository and connect a model first.'); return }
  if (useChatStore.getState().chats[root]?.phase === 'running') return // one run at a time
  const goal = `#${issue.number} ${issue.title}`
  const branch = `sakai/issue-${issue.number}-${slug(issue.title)}`
  S.set({ picked: issue, goal, branch, notes: '', estimate: null, agentView: 'chat', problems: [], debug: [], solving: issue.number })
  try {
    let testCommand = S.testCommand
    if (!testCommand) testCommand = (await post<{ command: string | null }>('/tests/detect', { root }).catch(() => ({ command: null }))).command ?? ''
    await post('/git/branch', { root, name: branch }).catch(() => undefined)
    S.log(`$ sakai solve #${issue.number} — ${app.llm.provider}/${app.llm.model}`)
    await startSession(root, 'solve', { issue: { number: issue.number, title: goal, body: issue.body ?? '' }, testCommand: testCommand || undefined, maxSteps: S.stepLimit, timeLimitMin: S.timeLimitMin })
  } catch (e) {
    S.log(`✗ ${cleanErr(e)}`)
    useSession.getState().set({ solving: null, agentView: 'task' })
  }
}
