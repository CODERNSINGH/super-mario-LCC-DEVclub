import { app } from 'electron'
import { join } from 'node:path'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * Local credential store: a private JSON file inside the app's own data folder (owner-only permissions).
 * Deliberately NOT the macOS Keychain — it triggers a "Sakai IDE wants to use your confidential information"
 * prompt. Values never leave this machine except to the provider/GitHub they belong to.
 * (Older versions wrote an encrypted `secrets.json`; it is ignored, so no Keychain access happens — users
 * simply sign in / paste their key once again.)
 */
const dir = () => app.getPath('userData')
const file = () => join(dir(), 'credentials.json')

function load(): Record<string, string> {
  try { return existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : {} } catch { return {} }
}

function save(all: Record<string, string>): void {
  mkdirSync(dir(), { recursive: true, mode: 0o700 })
  writeFileSync(file(), JSON.stringify(all), { mode: 0o600 })
  try { chmodSync(file(), 0o600) } catch { /* best effort */ }
}

export function setSecret(key: string, value: string): void {
  save({ ...load(), [key]: value })
}

export function getSecret(key: string): string | null {
  return load()[key] || null
}

export function deleteSecret(key: string): void {
  const all = load()
  delete all[key]
  save(all)
}
