import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { useApp } from './store'
import { useSession } from './lib/session'
import * as chat from './lib/chat'

if (import.meta.env.DEV) Object.assign(window, { __app: useApp, __session: useSession, __chat: chat })

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
