// Fails `npm run dist` if the build would ship without a GitHub Client ID (login would break on every client machine).
import { readFileSync, existsSync } from 'node:fs'
const env = existsSync('.env') ? readFileSync('.env', 'utf8').match(/^SAKAI_GITHUB_CLIENT_ID=(\S+)/m)?.[1] : ''
const pub = JSON.parse(readFileSync('app/public-config.json', 'utf8')).githubClientId
if (!env && !pub) { console.error('✗ No GitHub Client ID. Set SAKAI_GITHUB_CLIENT_ID in .env or app/public-config.json.'); process.exit(1) }
console.log('✓ GitHub Client ID present')
