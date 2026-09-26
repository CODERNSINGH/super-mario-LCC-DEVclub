import { useApp } from './store'
import { RepoScreen } from './screens/RepoScreen'
import { GithubScreen } from './screens/GithubScreen'
import { LlmScreen } from './screens/LlmScreen'
import { Workspace } from './workspace/Workspace'
import { Modal } from './components/Modal'

export function App() {
  const step = useApp((s) => s.step)
  return (
    <div className="h-full pop">
      {step === 'workspace' ? <Workspace /> : step === 'repo' ? <RepoScreen /> : step === 'github' ? <GithubScreen /> : <LlmScreen />}
      <Modal />
    </div>
  )
}
