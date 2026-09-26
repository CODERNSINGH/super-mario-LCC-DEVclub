/**
 * Splits a streamed model reply into user-visible prose, reasoning ("<think>" blocks) and tool-call JSON.
 * Tool-call JSON (fenced or bare) is held back and dropped so it never leaks into the token stream.
 */

const THINK_OPEN = '<think>', THINK_CLOSE = '</think>'

const isPrefixOf = (full: string, s: string) => s.length > 0 && s.length < full.length && full.startsWith(s)

/** Index just after the JSON object starting at `i`, or -1 if it is not complete yet. */
export function matchBrace(buf: string, i: number): number {
  let depth = 0, inStr = false, esc = false
  for (let k = i; k < buf.length; k++) {
    const ch = buf[k]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return k + 1
  }
  return -1
}

export class StreamFilter {
  visible = ''
  thinking = ''
  raw = ''
  private buf = ''
  private inThink = false
  private lastCh = '\n'

  constructor(private onText: (s: string) => void, private onThink: (s: string) => void, private hideTools = true) {}

  push(chunk: string): void { this.raw += chunk; this.buf += chunk; this.drain(false) }
  end(): void { this.drain(true) }
  /** Reasoning delivered out-of-band (provider `reasoning` fields). */
  pushThinking(s: string): void { this.think(s) }

  private text(s: string) { if (s) { this.visible += s; this.onText(s) } }
  private think(s: string) { if (s) { this.thinking += s; this.onThink(s) } }
  private eat(n: number) { if (n > 0) { this.lastCh = this.buf[n - 1]; this.buf = this.buf.slice(n) } }

  private atLineStart(i: number): boolean {
    let k = i - 1
    while (k >= 0 && (this.buf[k] === ' ' || this.buf[k] === '\t')) k--
    return k >= 0 ? this.buf[k] === '\n' : this.lastCh === '\n'
  }

  private drain(final: boolean): void {
    for (;;) {
      if (this.inThink) {
        const i = this.buf.indexOf(THINK_CLOSE)
        if (i >= 0) { this.think(this.buf.slice(0, i)); this.eat(i + THINK_CLOSE.length); this.inThink = false; continue }
        let keep = 0
        if (!final) for (let k = Math.min(THINK_CLOSE.length - 1, this.buf.length); k > 0; k--) if (isPrefixOf(THINK_CLOSE, this.buf.slice(-k))) { keep = k; break }
        this.think(this.buf.slice(0, this.buf.length - keep)); this.eat(this.buf.length - keep)
        if (final) this.buf = ''
        return
      }

      let out = ''
      let i = 0
      let restart = false
      while (i < this.buf.length) {
        const rest = this.buf.slice(i)
        if (rest.startsWith(THINK_OPEN)) { this.text(out); out = ''; this.eat(i + THINK_OPEN.length); this.inThink = true; restart = true; break }

        if (rest.startsWith('```')) {
          const close = this.buf.indexOf('```', i + 3)
          if (close < 0) {
            if (!final) { this.text(out); this.eat(i); return }
            const block = this.buf.slice(i)
            out += this.hideTools && /"tool"\s*:/.test(block) ? '' : block
            i = this.buf.length
            continue
          }
          const block = this.buf.slice(i, close + 3)
          if (!(this.hideTools && /"tool"\s*:/.test(block))) out += block
          i = close + 3
          continue
        }

        if (this.hideTools && rest[0] === '{' && this.atLineStart(i)) {
          const end = matchBrace(this.buf, i)
          if (end < 0) {
            if (!final) { this.text(out); this.eat(i); return }
            const block = this.buf.slice(i)
            out += /"tool"\s*:/.test(block) ? '' : block
            i = this.buf.length
            continue
          }
          const block = this.buf.slice(i, end)
          if (!/"tool"\s*:/.test(block)) out += block
          i = end
          continue
        }

        if (!final && rest.length < 7 && (isPrefixOf(THINK_OPEN, rest) || isPrefixOf('```', rest))) { this.text(out); this.eat(i); return }
        out += this.buf[i]
        i++
      }
      if (restart) continue
      this.text(out)
      this.eat(this.buf.length)
      return
    }
  }
}
