import { useEffect, useState } from 'react'
import { post } from '../lib/api'
import { useSession } from '../lib/session'
import { useApp } from '../store'

interface Node { name: string; path: string; dir: boolean }

function Dir({ path, depth }: { path: string; depth: number }) {
  const root = useApp((s) => s.localPath)!
  const [nodes, setNodes] = useState<Node[]>([])
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const openTab = useSession((s) => s.openTab)
  const active = useSession((s) => s.active)

  useEffect(() => { void post<Node[]>('/fs/list', { root, path }).then(setNodes).catch(() => setNodes([])) }, [root, path])

  return (
    <>
      {nodes.map((n) => (
        <div key={n.path}>
          <button
            onClick={() => n.dir ? setOpen((o) => ({ ...o, [n.path]: !o[n.path] })) : openTab({ id: `file:${n.path}`, kind: 'file', title: n.name, path: n.path })}
            style={{ paddingLeft: 10 + depth * 12 }}
            className={`w-full text-left h-6 flex items-center gap-1.5 hover:bg-raised text-[12.5px] ${active === `file:${n.path}` ? 'bg-raised text-ink' : ''}`}
          >
            <span className="w-3 text-muted text-[10px]">{n.dir ? (open[n.path] ? '▾' : '▸') : ''}</span>
            <span className="truncate">{n.name}</span>
          </button>
          {n.dir && open[n.path] && <Dir path={n.path} depth={depth + 1} />}
        </div>
      ))}
    </>
  )
}

export function Explorer() {
  const root = useApp((s) => s.localPath)
  if (!root) return <p className="px-4 text-muted text-xs">Waiting for repository…</p>
  return <Dir path="" depth={0} />
}
