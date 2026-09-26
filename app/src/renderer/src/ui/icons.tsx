import { Folder, FolderOpen } from 'lucide-react'

const BADGE: Record<string, string> = {
  js: 'JS', mjs: 'JS', cjs: 'JS', jsx: 'JX', ts: 'TS', tsx: 'TX', json: '{}', md: 'M↓', py: 'PY', go: 'GO', rs: 'RS', java: 'JV', rb: 'RB', php: 'PH', c: 'C', cpp: 'C+', h: 'H', cs: 'C#', css: '#', scss: '#', html: '<>', yml: 'YM', yaml: 'YM', toml: 'TM', sh: '$', lock: '🔒', txt: 'TX', svg: 'SV', png: 'IM', jpg: 'IM', jpeg: 'IM', gitignore: 'GI',
}

/** Small VS Code-style file glyph: 2-letter badge, tests highlighted in brand red. */
export function FileIcon({ name, dir, open, size = 15 }: { name: string; dir?: boolean; open?: boolean; size?: number }) {
  if (dir) { const I = open ? FolderOpen : Folder; return <I size={size} strokeWidth={1.6} className="text-muted shrink-0" /> }
  const ext = name.startsWith('.') ? name.slice(1) : name.split('.').pop()?.toLowerCase() ?? ''
  const isTest = /\.(test|spec)\./.test(name) || /^tests?$/.test(ext)
  return (
    <span className={`grid place-items-center shrink-0 rounded-[3px] text-[8px] font-bold leading-none tracking-tight ${isTest ? 'text-sakai border-sakai/60' : 'text-fg/80 border-line2'} border`} style={{ width: size, height: size - 1 }}>
      {BADGE[ext] ?? ext.slice(0, 2).toUpperCase() ?? '··'}
    </span>
  )
}
