import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const file = () => join(app.getPath('userData'), 'secrets.json')

function load(): Record<string, string> {
  try { return existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : {} } catch { return {} }
}

/** Secrets are encrypted with the macOS Keychain via Electron safeStorage. */
export function setSecret(key: string, value: string): void {
  const all = load()
  all[key] = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(value).toString('base64') : value
  writeFileSync(file(), JSON.stringify(all), { mode: 0o600 })
}

export function getSecret(key: string): string | null {
  const v = load()[key]
  if (!v) return null
  try { return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(v, 'base64')) : v } catch { return null } // e.g. keychain entry changed; treat as signed out
}

export function deleteSecret(key: string): void {
  const all = load()
  delete all[key]
  writeFileSync(file(), JSON.stringify(all), { mode: 0o600 })
}
