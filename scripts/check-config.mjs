// Fails `npm run dist` if the build would ship without a GitHub Client ID (login would break on every client machine).
// Sources checked, in order: .env, app/public-config.json, and the constant compiled into app/src/main/github.ts.
import { readFileSync, existsSync } from 'node:fs'
const env = existsSync('.env') ? readFileSync('.env', 'utf8').match(/^SAKAI_GITHUB_CLIENT_ID=(\S+)/m)?.[1] : ''
const pub = existsSync('app/public-config.json') ? JSON.parse(readFileSync('app/public-config.json', 'utf8')).githubClientId : ''
const src = readFileSync('app/src/main/github.ts', 'utf8').match(/DEFAULT_GITHUB_CLIENT_ID\s*=\s*'([^']+)'/)?.[1]
const id = src || pub || env
if (!id) { console.error('✗ No GitHub Client ID. Set DEFAULT_GITHUB_CLIENT_ID in app/src/main/github.ts, app/public-config.json, or SAKAI_GITHUB_CLIENT_ID in .env.'); process.exit(1) }
console.log(`✓ GitHub Client ID present (${src ? 'source constant' : pub ? 'public-config.json' : '.env'})`)
