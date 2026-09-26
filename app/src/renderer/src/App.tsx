import { useApp } from './store'
import { RepoScreen } from './screens/RepoScreen'
import { GithubScreen } from './screens/GithubScreen'
import { LlmScreen } from './screens/LlmScreen'
import { Workspace } from './workspace/Workspace'

export function App() {
  const step = useApp((s) => s.step)
  if (step === 'workspace') return <Workspace />
  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="drag h-10 shrink-0 border-b border-line" />
      <main className="flex-1 grid place-items-center p-8 overflow-auto">
        <div className="pop w-full max-w-[520px]">
          {step === 'repo' && <RepoScreen />}
          {step === 'github' && <GithubScreen />}
          {step === 'llm' && <LlmScreen />}
        </div>
      </main>
    </div>
  )
}
