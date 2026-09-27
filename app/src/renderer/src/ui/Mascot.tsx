import { useApp, type Profile } from '../store'
import logo from '../assets/logo.png'

/** Sparkle: 4-point star centred at (x, y). */
const Star = ({ x, y, s, d = 0 }: { x: number; y: number; s: number; d?: number }) => (
  <path className="mk-twinkle" style={{ animationDelay: `${d}s`, transformOrigin: `${x}px ${y}px`, transformBox: 'view-box' }} fill="#fff"
    d={`M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s}Z`} />
)

/** Coordinates are in logo pixels (512x512 viewBox = the image box). Eyes sit at about (175,222) and (300,215). */
function Accessories({ profile }: { profile: Profile }) {
  if (profile === 'swe') return (
    <>
      <g fill="rgba(255,255,255,.18)" stroke="#2a0a12" strokeWidth="9" strokeLinejoin="round">
        <rect x="125" y="185" width="102" height="80" rx="24" /><rect x="252" y="178" width="102" height="80" rx="24" />
      </g>
      <path d="M227 222 Q240 210 252 217" fill="none" stroke="#2a0a12" strokeWidth="9" strokeLinecap="round" />
      <path className="mk-glint" d="M140 205 L160 195 M266 198 L286 188" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
      <g transform="translate(372 392)"><rect width="112" height="66" rx="18" fill="#0e0e10" stroke="#bc002d" strokeWidth="7" />
        <text x="56" y="45" textAnchor="middle" fontFamily="SF Mono, Menlo, monospace" fontWeight="700" fontSize="34" fill="#fff">{'</>'}</text></g>
    </>
  )
  if (profile === 'vibe') return (
    <>
      <g fill="#120508" stroke="#000" strokeWidth="5" strokeLinejoin="round">
        <path d="M118 188 H232 Q232 262 176 266 Q118 262 118 188Z" /><path d="M244 182 H358 Q358 256 300 260 Q244 256 244 182Z" />
      </g>
      <path d="M232 200 Q238 194 244 198" fill="none" stroke="#000" strokeWidth="9" strokeLinecap="round" />
      <path className="mk-glint" d="M138 204 L170 204 M262 198 L294 198" stroke="#fff" strokeOpacity=".7" strokeWidth="8" strokeLinecap="round" />
      <Star x={70} y={90} s={34} /><Star x={455} y={310} s={26} d={0.5} /><Star x={430} y={430} s={20} d={1} /><Star x={44} y={300} s={18} d={0.8} />
      <g transform="translate(396 356) rotate(35)"><rect width="12" height="92" rx="5" fill="#fff" stroke="#bc002d" strokeWidth="4" /><rect width="12" height="26" rx="5" fill="#bc002d" /></g>
    </>
  )
  return (
    <g transform="translate(374 388)">
      <rect width="102" height="74" rx="14" fill="#0e0e10" stroke="#bc002d" strokeWidth="7" />
      <path d="M20 18 H82 V56 H20Z" fill="#fff" /><path d="M51 18 V56" stroke="#bc002d" strokeWidth="4" />
      <path d="M26 30 H44 M26 40 H44 M58 30 H76 M58 40 H76" stroke="#bc002d" strokeWidth="3.5" strokeLinecap="round" />
      <g transform="translate(70 -8) rotate(35)"><rect width="9" height="44" rx="3" fill="#fff" stroke="#bc002d" strokeWidth="3" /><path d="M0 44 L4.5 56 L9 44Z" fill="#bc002d" /></g>
    </g>
  )
}

/** Sakai robot with per-audience accessories composed over the shared logo. Follows the app profile unless one is passed. */
export function Mascot({ profile, size = 32, animate = true, talking = false, className = '' }: { profile?: Profile; size?: number; animate?: boolean; talking?: boolean; className?: string }) {
  const current = useApp((s) => s.profile)
  const p = profile ?? current
  return (
    <span className={`relative inline-block shrink-0 select-none ${animate ? 'mk-idle' : ''} ${talking ? 'mk-talk' : ''} ${className}`} style={{ width: size, height: size }} aria-hidden>
      <img src={logo} width={size} height={size} alt="" draggable={false} className="absolute inset-0 w-full h-full object-contain mk-glow" />
      {size >= 20 && <svg viewBox="0 0 512 512" className="absolute inset-0 w-full h-full overflow-visible"><Accessories profile={p} /></svg>}
      {size < 20 && <span className="absolute -right-0.5 -bottom-0.5 w-[7px] h-[7px] rounded-full bg-sakai border border-bg" />}
    </span>
  )
}
