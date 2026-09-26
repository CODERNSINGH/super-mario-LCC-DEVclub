import { shell } from 'electron'

declare const __GITHUB_CLIENT_ID__: string
let runtimeClientId = ''

export function setClientId(id: string): void {
  runtimeClientId = id.trim()
}

export function getClientId(): string {
  return runtimeClientId || process.env.SAKAI_GITHUB_CLIENT_ID || (typeof __GITHUB_CLIENT_ID__ !== 'undefined' ? __GITHUB_CLIENT_ID__ : '')
}

export function hasOAuthConfig(): boolean {
  return Boolean(getClientId())
}

const SCOPES = 'repo read:user user:email workflow'

export interface DeviceCode {
  device_code: string
  user_code: string
  verification_uri: string
  interval: number
  expires_in: number
}

const json = { Accept: 'application/json', 'Content-Type': 'application/json' }

export async function startDeviceFlow(): Promise<DeviceCode> {
  const id = getClientId()
  if (!id) {
    throw new Error('GitHub OAuth is not configured. Please enter your OAuth Client ID or connect using a Personal Access Token.')
  }
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ client_id: id, scope: SCOPES }),
  })
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Invalid GitHub OAuth Client ID or Device Flow is not enabled for this OAuth App. Switch to the "Personal Access Token" tab to connect instantly.')
    }
    const errText = await res.text().catch(() => '')
    throw new Error(`GitHub device code request failed (${res.status}): ${errText}`)
  }
  const data = (await res.json()) as DeviceCode
  await shell.openExternal(data.verification_uri)
  return data
}

/** Polls until the user approves; returns the access token. */
export async function pollDeviceFlow(code: DeviceCode): Promise<string> {
  let interval = code.interval
  const deadline = Date.now() + code.expires_in * 1000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval * 1000))
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        client_id: getClientId(),
        device_code: code.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })
    const body = (await res.json()) as { access_token?: string; error?: string; interval?: number }
    if (body.access_token) return body.access_token
    if (body.error === 'slow_down') interval = body.interval ?? interval + 5
    else if (body.error && body.error !== 'authorization_pending') throw new Error(body.error)
  }
  throw new Error('Device code expired')
}

export async function fetchUser(token: string) {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid GitHub token (401 Unauthorized)')
    throw new Error(`GitHub user request failed (${res.status})`)
  }
  return (await res.json()) as { login: string; name: string | null; avatar_url: string }
}

export async function listIssues(token: string | null, repo: string) {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token) headers['Authorization'] = `Bearer ${token.trim()}`
  const res = await fetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=50`, {
    headers,
  })
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error('GitHub API rate limit reached (403). Connect your GitHub account with a Personal Access Token in Settings to get 5,000 req/hr.')
    }
    if (res.status === 404) {
      throw new Error(`Repository "${repo}" not found or private (404). Please connect your GitHub account in Settings.`)
    }
    throw new Error(`Could not list issues (${res.status})`)
  }
  const items = (await res.json()) as Array<{ number: number; title: string; body: string | null; labels: { name: string }[]; pull_request?: unknown }>
  return items.filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, body: i.body ?? '', labels: i.labels.map((l) => l.name) }))
}
