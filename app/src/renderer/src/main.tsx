import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { useApp } from './store'
import { useSession } from './lib/session'

if (import.meta.env.DEV) Object.assign(window, { __app: useApp, __session: useSession })

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
