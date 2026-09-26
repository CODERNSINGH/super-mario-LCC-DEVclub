import { useState } from 'react'
import { PanelLeft, PanelBottom, PanelRight, Search, Sparkles } from 'lucide-react'
import { useApp } from '../store'
import { useSession } from '../lib/session'
import { Menu, useOutside, type MenuItem } from '../ui/menu'
import * as A from '../lib/actions'
import { runEditorAction } from '../lib/monaco'
import { getRecent } from '../lib/recent'
import { stopSession, currentRoot } from '../lib/chat'

export function useMenus(): Record<string, MenuItem[]> {
  const s = useSession()
  const app = useApp()
  const sep = { label: '', sep: true }
  const recents = getRecent().filter((r) => r.kind === 'local').slice(0, 5)
  const closeTab = () => s.closeTab(s.active)
  return {
    File: [
      { label: 'New Task', shortcut: '⌘N', action: A.newTask },
      { label: 'Open Folder…', shortcut: '⌘O', action: () => void A.pickAndOpenFolder() },
      { label: 'Open Demo Project', action: () => void A.openDemoProject() },
      ...(recents.length ? [sep, ...recents.map((r) => ({ label: r.value.replace(/^\/Users\/[^/]+/, '~'), action: () => void A.openLocalFolder(r.value) }))] : []),
      sep,
      { label: 'Save', shortcut: '⌘S', action: () => window.dispatchEvent(new Event('sakai:save')) },
      { label: 'Close Editor', shortcut: '⌘W', action: closeTab },
      { label: 'Close Folder', action: A.closeFolder },
      sep,
      { label: 'Settings', shortcut: '⌘,', action: A.openSettings },
    ],
    Edit: [
      { label: 'Undo', shortcut: '⌘Z', action: () => runEditorAction('undo') },
      { label: 'Redo', shortcut: '⇧⌘Z', action: () => runEditorAction('redo') },
      sep,
      { label: 'Find', shortcut: '⌘F', action: () => runEditorAction('actions.find') },
      { label: 'Replace', shortcut: '⌥⌘F', action: () => runEditorAction('editor.action.startFindReplace') },
      { label: 'Toggle Line Comment', shortcut: '⌘/', action: () => runEditorAction('editor.action.commentLine') },
      { label: 'Format Document', shortcut: '⇧⌥F', action: () => runEditorAction('editor.action.formatDocument') },
    ],
    Selection: [
      { label: 'Select All', shortcut: '⌘A', action: () => runEditorAction('editor.action.selectAll') },
      { label: 'Expand Selection', shortcut: '⌃⇧⌘→', action: () => runEditorAction('editor.action.smartSelect.expand') },
      { label: 'Copy Line Down', shortcut: '⇧⌥↓', action: () => runEditorAction('editor.action.copyLinesDownAction') },
      { label: 'Move Line Up', shortcut: '⌥↑', action: () => runEditorAction('editor.action.moveLinesUpAction') },
    ],
    View: [
      { label: 'Command Palette…', shortcut: '⇧⌘P', action: () => A.openPalette('commands') },
      { label: 'Quick Open…', shortcut: '⌘P', action: () => A.openPalette('files') },
      sep,
      { label: 'Explorer', shortcut: '⇧⌘E', action: () => A.showSide('explorer'), checked: s.side === 'explorer' && s.sideOpen },
      { label: 'Search', shortcut: '⇧⌘F', action: () => A.showSide('search'), checked: s.side === 'search' && s.sideOpen },
      { label: 'Source Control', shortcut: '⌃⇧G', action: () => A.showSide('scm'), checked: s.side === 'scm' && s.sideOpen },
      ...(app.mode === 'github' ? [{ label: 'Issues', action: () => A.showSide('issues'), checked: s.side === 'issues' && s.sideOpen }] : []),
      sep,
      { label: 'Problems', action: () => A.showPanel('problems') },
      { label: 'Output', action: () => A.showPanel('output') },
      { label: 'Debug Console', action: () => A.showPanel('debug') },
      { label: 'Terminal', shortcut: '⌃`', action: () => A.showPanel('terminal') },
      sep,
      { label: 'Toggle Sidebar', shortcut: '⌘B', action: A.toggleSidebar },
      { label: 'Toggle Panel', shortcut: '⌘J', action: A.togglePanel },
      { label: 'Toggle Sakai Agent', shortcut: '⌥⌘B', action: A.toggleAgent },
    ],
    Go: [
      { label: 'Go to File…', shortcut: '⌘P', action: () => A.openPalette('files') },
      { label: 'Go to Line…', shortcut: '⌃G', action: () => runEditorAction('editor.action.gotoLine') },
      { label: 'Go to Symbol…', shortcut: '⇧⌘O', action: () => runEditorAction('editor.action.quickOutline') },
    ],
    Run: [
      { label: 'Solve with Sakai…', shortcut: '⇧⌘R', action: A.newTask },
      { label: 'Run Tests in Terminal', action: () => { A.openTerminal(); if (s.termId && s.testCommand) window.sakai.term.write(s.termId, `${s.testCommand}\r`) } },
      { label: 'Stop Agent', action: () => { const r = currentRoot(); if (r) void stopSession(r) } },
    ],
    Terminal: [
      { label: 'New Terminal', shortcut: '⌃⇧`', action: A.openTerminal },
      { label: 'Toggle Terminal', shortcut: '⌃`', action: () => (s.panelOpen && s.panel === 'terminal' ? A.togglePanel() : A.openTerminal()) },
    ],
    Help: [
      { label: 'Welcome', action: A.openWelcome },
      { label: 'Show All Commands', shortcut: '⇧⌘P', action: () => A.openPalette('commands') },
      { label: 'Change Model…', action: A.changeModel },
      sep,
      { label: 'About Sakai', action: () => s.set({ modal: { title: 'Sakai', body: 'An autonomous AI engineer for GitHub issues. It reads your repository, edits code with tools, runs your tests and hands you a verified change. Version 0.1.0.', confirm: 'OK', cancel: 'Close', onConfirm: () => undefined } }) },
    ],
  }
}

export function TitleBar() {
  const { repo, localPath } = useApp()
  const s = useSession()
  const menus = useMenus()
  const [open, setOpen] = useState<string | null>(null)
  const ref = useOutside(() => setOpen(null), open !== null)
  const name = repo ?? localPath?.split('/').pop() ?? 'Sakai'
  const tog = (on: boolean, fn: () => void, icon: React.ReactNode, title: string) => (
    <button title={title} onClick={fn} className={`no-drag w-7 h-6 grid place-items-center rounded hover:bg-hover ${on ? 'text-ink' : 'text-muted'}`}>{icon}</button>
  )
  return (
    <div className="drag h-[38px] shrink-0 bg-title border-b border-line flex items-center pl-[78px] pr-2 relative z-40">
      <div ref={ref} className="no-drag flex items-center">
        {Object.keys(menus).map((m) => (
          <div key={m} className="relative">
            <button onMouseDown={(e) => { e.stopPropagation(); setOpen(open === m ? null : m) }} onMouseEnter={() => open && setOpen(m)}
              className={`h-6 px-2 rounded text-[12.5px] ${open === m ? 'bg-hover text-ink' : 'text-fg hover:bg-hover'}`}>{m}</button>
            {open === m && <div className="absolute left-0 top-full mt-1"><Menu items={menus[m]} onClose={() => setOpen(null)} /></div>}
          </div>
        ))}
      </div>
      <div className="flex-1 flex justify-center px-4">
        <button onClick={() => A.openPalette('files')} className="no-drag w-[min(440px,100%)] h-6 rounded-md bg-bg border border-line2 hover:border-faint flex items-center justify-center gap-2 text-[12px] text-muted">
          <Search size={12} /><span className="truncate max-w-[300px]">{name}</span>
        </button>
      </div>
      <div className="no-drag flex items-center gap-0.5">
        {tog(s.sideOpen, A.toggleSidebar, <PanelLeft size={15} />, 'Toggle Sidebar (⌘B)')}
        {tog(s.panelOpen, A.togglePanel, <PanelBottom size={15} />, 'Toggle Panel (⌘J)')}
        {tog(s.agentOpen, A.toggleAgent, <PanelRight size={15} />, 'Toggle Sakai Agent')}
        <button onClick={A.toggleAgent} title="Sakai Agent" className={`ml-1 w-7 h-6 grid place-items-center rounded hover:bg-hover ${s.agentOpen ? 'text-sakai' : 'text-muted'}`}><Sparkles size={15} /></button>
      </div>
    </div>
  )
}
