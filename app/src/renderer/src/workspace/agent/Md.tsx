import { Fragment, type ReactNode } from 'react'

/** Small, safe markdown subset: fences, inline code, bold, lists, headings. */
function inline(t: string): ReactNode[] {
  return t.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('`') && p.endsWith('`') && p.length > 1 ? <code key={i} className="px-1 py-px rounded bg-raised border border-line font-mono text-[12px] text-ink">{p.slice(1, -1)}</code>
      : p.startsWith('**') && p.endsWith('**') ? <strong key={i} className="text-ink font-semibold">{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>)
}

export function Md({ text }: { text: string }) {
  const parts = text.split(/```/)
  return (
    <div className="space-y-2 text-[13px] leading-[1.55] text-fg selectable">
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const nl = part.indexOf('\n'); const lang = nl > -1 ? part.slice(0, nl).trim() : ''; const code = nl > -1 ? part.slice(nl + 1) : part
          return <pre key={i} className="rounded-lg border border-line bg-bg px-3 py-2 overflow-x-auto font-mono text-[12px] text-fg leading-[1.5]">{lang && <div className="text-[10px] uppercase tracking-wider text-faint mb-1">{lang}</div>}{code.replace(/\n$/, '')}</pre>
        }
        return part.split(/\n{2,}/).filter(Boolean).map((blk, j) => {
          const lines = blk.split('\n')
          if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) return <ul key={`${i}-${j}`} className="space-y-1 pl-4 list-disc marker:text-sakai">{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>)}</ul>
          if (/^#{1,3}\s/.test(blk)) return <div key={`${i}-${j}`} className="text-ink font-semibold">{inline(blk.replace(/^#{1,3}\s/, ''))}</div>
          return <p key={`${i}-${j}`} className="whitespace-pre-wrap">{inline(blk)}</p>
        })
      })}
    </div>
  )
}
