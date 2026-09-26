import { app } from 'electron'
import { config } from 'dotenv'
import { join } from 'node:path'

/** Dev only: repo-root .env. Release builds never read .env — users enter their own keys in the app. */
export function loadEnv(): void {
  if (app.isPackaged) return
  config({ path: join(__dirname, '../../../.env') })
}

export const SERVER_PORT = () => Number(process.env.SAKAI_SERVER_PORT ?? 4477)
