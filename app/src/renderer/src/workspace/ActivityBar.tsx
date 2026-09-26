import { useState } from 'react'
import { Files, Search, GitBranch, CircleDot, Puzzle, Sparkles, CircleUserRound, Settings } from 'lucide-react'
import { useApp } from '../store'
import { useSession, type Side } from '../lib/session'
import { Popover, Menu } from '../ui/menu'
import * as A from '../lib/actions'

export function ActivityBar() {
  const { mode, user, set } = useApp()
  const s = useSession()
  const [pop, setPop] = useState<null | 'acct' | 'gear'>(null)
  const items: { id: Side; label: string; icon: typeof Files; badge?: number }[] = [
    { id: 'explorer', label: 'Explorer (⇧⌘E)', icon: Files },
    { id: 'search', label: 'Search (⇧⌘F)', icon: Search },
    { id: 'scm', label: 'Source Control (⌃⇧G)', icon: GitBranch, badge: s.changed.length },
    ...(mode === 'github' ? [{ id: 'issues' as Side, label: 'GitHub Issues', icon: CircleDot, badge: s.issues.length }] : []),
    { id: 'quick', label: 'Quick Commands', icon: Puzzle },
  ]
  const btn = 'relative w-12 h-12 grid place-items-center'
  return (
    <nav className="w-12 shrink-0 bg-title border-r border-line flex flex-col items-center">
      {items.map((it) => {
        const on = s.side === it.id && s.sideOpen
        return (
          <button key={it.id} title={it.label} onClick={() => A.showSide(it.id)} className={`${btn} ${on ? 'text-ink' : 'text-muted hover:text-ink'}`}>
            {on && <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-sakai" />}
            <it.icon size={22} strokeWidth={1.5} />
            {!!it.badge && <span className="absolute right-[7px] bottom-[8px] min-w-[15px] h-[15px] px-1 rounded-full bg-sakai text-ink text-[9px] font-semibold grid place-items-center">{it.badge > 99 ? '99+' : it.badge}</span>}
          </button>
        )
      })}
      <button title="Sakai Agent" onClick={A.toggleAgent} className={`${btn} ${s.agentOpen ? 'text-sakai' : 'text-muted hover:text-ink'}`}><Sparkles size={22} strokeWidth={1.5} /></button>
      <div className="flex-1" />
      <Popover open={pop === 'acct'} onClose={() => setPop(null)}
        trigger={<button title={user ? `@${user.login}` : 'Accounts'} onClick={() => setPop(pop === 'acct' ? null : 'acct')} className={`${btn} text-muted hover:text-ink`}>{user ? <img src={user.avatar_url} className="w-6 h-6 rounded-full" /> : <CircleUserRound size={22} strokeWidth={1.5} />}</button>}
        menu={<Menu onClose={() => setPop(null)} items={user
          ? [{ label: `Signed in as @${user.login}`, disabled: true }, { label: '', sep: true }, { label: 'Sign out of GitHub', action: async () => { await window.sakai.github.signOut(); set({ user: null }) } }]
          : [{ label: 'Sign in with GitHub…', action: () => set({ step: 'github' }) }]} />} />
      <Popover open={pop === 'gear'} onClose={() => setPop(null)}
        trigger={<button title="Manage" onClick={() => setPop(pop === 'gear' ? null : 'gear')} className={`${btn} text-muted hover:text-ink`}><Settings size={22} strokeWidth={1.5} /></button>}
        menu={<Menu onClose={() => setPop(null)} items={[
          { label: 'Command Palette…', shortcut: '⇧⌘P', action: () => A.openPalette('commands') },
          { label: '', sep: true },
          { label: 'Settings', shortcut: '⌘,', action: A.openSettings },
          { label: 'Change Model…', action: A.changeModel },
          { label: 'Welcome', action: A.openWelcome },
        ]} />} />
    </nav>
  )
}
