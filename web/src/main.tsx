import { createRoot } from 'react-dom/client'
import './index.css'

const steps = ['Connect GitHub', 'Pick a model', 'Choose an issue', 'Review the verified pull request']

createRoot(document.getElementById('root')!).render(
  <main className="max-w-3xl mx-auto px-6 py-24">
    <div className="flex items-center gap-2.5 mb-16"><div className="w-7 h-7 rounded-full bg-sakai grid place-items-center text-white font-semibold">S</div><span className="text-white font-semibold">Sakai</span></div>
    <h1 className="text-5xl font-semibold text-white leading-tight">An autonomous engineer for your GitHub issues.</h1>
    <p className="mt-6 text-lg text-muted">Sakai clones your repository, finds the root cause, edits the code, runs your tests and opens a verified pull request — with any model, including local ones.</p>
    <a href="#" className="inline-block mt-10 h-11 leading-[44px] px-6 rounded-md bg-sakai text-white font-medium">Download for macOS</a>
    <ol className="mt-20 grid gap-3">
      {steps.map((s, i) => <li key={s} className="flex gap-4 items-center bg-panel border border-line rounded-lg px-5 h-14"><span className="text-sakai font-mono">0{i + 1}</span>{s}</li>)}
    </ol>
  </main>,
)
