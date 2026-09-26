const KEY = 'sakai.recent'
export function getRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}
export function pushRecent(repo: string): void {
  try { localStorage.setItem(KEY, JSON.stringify([repo, ...getRecent().filter((r) => r !== repo)].slice(0, 5))) } catch { /* storage unavailable */ }
}
