import { useState } from 'react'

/** Drag handle. `onDrag` receives the pixel delta since the last move. */
export function Splitter({ dir, onDrag }: { dir: 'v' | 'h'; onDrag: (delta: number) => void }) {
  const [drag, setDrag] = useState(false)
  const down = (e: React.MouseEvent) => {
    e.preventDefault()
    let last = dir === 'v' ? e.clientX : e.clientY
    setDrag(true)
    document.body.style.cursor = dir === 'v' ? 'col-resize' : 'row-resize'
    const move = (m: MouseEvent) => { const p = dir === 'v' ? m.clientX : m.clientY; onDrag(p - last); last = p }
    const up = () => { setDrag(false); document.body.style.cursor = ''; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  return <div onMouseDown={down} className={`${dir === 'v' ? 'split-v' : 'split-h'} ${drag ? 'dragging' : ''}`} />
}
