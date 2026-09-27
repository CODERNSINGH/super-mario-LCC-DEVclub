import type { Anim } from '../lib/tips'

/** Pure emoji/CSS animated graphics for Sakai Tips. Keyframes live in index.css (prefixed `ta-`). */
const wrap = 'relative h-[52px] w-full overflow-hidden flex items-center justify-center select-none'

function Dino() {
  return (
    <div className={wrap} aria-hidden>
      <span className="ta-breathe text-[38px] leading-none">🦖</span>
      <span className="ta-fire text-[26px] leading-none absolute left-1/2 ml-[14px]">🔥</span>
      <span className="ta-fire text-[18px] leading-none absolute left-1/2 ml-[40px]" style={{ animationDelay: '.25s' }}>🔥</span>
    </div>
  )
}
function Pigeon() {
  return (
    <div className={wrap} aria-hidden>
      <span className="ta-fly absolute text-[32px] leading-none">🕊️<span className="text-[18px] ml-0.5 align-[-4px]">✉️</span></span>
    </div>
  )
}
function Robot() {
  return (
    <div className={wrap} aria-hidden>
      <span className="text-[34px] leading-none ta-bob">🤖</span>
      <span className="ml-1 font-mono text-[15px] text-fg flex items-center gap-[3px]">{[0, 1, 2].map((i) => <span key={i} className="ta-key inline-block w-[6px] h-[6px] rounded-sm bg-sakai" style={{ animationDelay: `${i * 0.18}s` }} />)}</span>
    </div>
  )
}
function Bug() {
  return (
    <div className={wrap} aria-hidden>
      <span className="ta-bug text-[34px] leading-none">🐛</span>
      <span className="ta-squash text-[34px] leading-none absolute">🔨</span>
    </div>
  )
}
function Rocket() {
  return (
    <div className={wrap} aria-hidden>
      <span className="ta-launch text-[34px] leading-none absolute bottom-1">🚀</span>
      <span className="ta-star text-[12px] absolute left-[30%] top-2">✨</span>
      <span className="ta-star text-[12px] absolute right-[30%] top-4" style={{ animationDelay: '.6s' }}>✨</span>
    </div>
  )
}
function Brain() {
  return (
    <div className={wrap} aria-hidden>
      <span className="ta-pulse text-[38px] leading-none">🧠</span>
    </div>
  )
}

export function TipArt({ anim }: { anim: Anim }) {
  switch (anim) {
    case 'dino': return <Dino />
    case 'pigeon': return <Pigeon />
    case 'robot': return <Robot />
    case 'bug': return <Bug />
    case 'rocket': return <Rocket />
    default: return <Brain />
  }
}

/** Extra text class per animation so the copy reacts to the graphic (dino: burns in from the fire). */
export const textFx = (a: Anim) => (a === 'dino' ? 'ta-burn' : a === 'pigeon' ? 'ta-unroll' : '')
