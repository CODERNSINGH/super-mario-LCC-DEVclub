export interface Recent { kind: 'github' | 'local'; value: string }
const KEY = 'sakai.recent2'
export function getRecent(): Recent[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}
export function pushRecent(r: Recent): void {
  try { localStorage.setItem(KEY, JSON.stringify([r, ...getRecent().filter((x) => x.value !== r.value)].slice(0, 6))) } catch { /* storage unavailable */ }
}
export function clearRecent(): void { try { localStorage.removeItem(KEY) } catch { /* ignore */ } }
