import { useEffect } from 'react'
import { useApp } from './store'
import { RepoScreen } from './screens/RepoScreen'
import { GithubScreen } from './screens/GithubScreen'
import { LlmScreen } from './screens/LlmScreen'
import { Workspace } from './workspace/Workspace'
import { Modal } from './components/Modal'

export function App() {
  const step = useApp((s) => s.step)
  const envAuto = useApp((s) => s.envAuto)
  // Evaluation mode: `AI_API_KEY` in the environment pre-connects the model, so the model step is skipped.
  useEffect(() => {
    void window.sakai.llm.evalConfig().then((c) => { if (c) useApp.getState().set({ llm: { provider: c.provider, model: c.model, baseUrl: c.baseUrl }, envAuto: true }) })
  }, [])
  useEffect(() => { if (envAuto && step === 'llm') useApp.getState().set({ step: 'workspace', envAuto: false }) }, [envAuto, step])
  return (
    <div className="h-full pop">
      {step === 'workspace' ? <Workspace /> : step === 'repo' ? <RepoScreen /> : step === 'github' ? <GithubScreen /> : <LlmScreen />}
      <Modal />
    </div>
  )
}
