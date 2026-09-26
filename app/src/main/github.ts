import { shell } from 'electron'

declare const __GITHUB_CLIENT_ID__: string
const clientId = () => process.env.SAKAI_GITHUB_CLIENT_ID || __GITHUB_CLIENT_ID__
const SCOPES = 'repo read:user user:email workflow'

export interface DeviceCode {
  device_code: string
  user_code: string
  verification_uri: string
  interval: number
  expires_in: number
}

const json = { Accept: 'application/json', 'Content-Type': 'application/json' }

function friendly(code: string): string {
  return ({
    device_flow_disabled: 'Device Flow is not enabled for this GitHub OAuth app. Publisher: enable it in GitHub → Settings → Developer settings → OAuth Apps.',
    incorrect_client_credentials: 'GitHub rejected the app’s Client ID. Please update Sakai or contact the publisher.',
    access_denied: 'Authorization was cancelled on GitHub. Click Connect to try again.',
    expired_token: 'The sign-in code expired. Click Connect to get a new one.',
  } as Record<string, string>)[code] ?? `GitHub sign-in failed (${code}).`
}

export async function startDeviceFlow(): Promise<DeviceCode> {
  if (!clientId()) throw new Error('GitHub sign-in is not configured in this build. Please contact the app publisher.')
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ client_id: clientId(), scope: SCOPES }),
  })
  if (!res.ok) throw new Error(`GitHub device code request failed (${res.status})`)
  const data = (await res.json()) as DeviceCode & { error?: string }
  if (data.error) throw new Error(friendly(data.error))
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
        client_id: clientId(),
        device_code: code.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })
    const body = (await res.json()) as { access_token?: string; error?: string; interval?: number }
    if (body.access_token) return body.access_token
    if (body.error === 'slow_down') interval = body.interval ?? interval + 5
    else if (body.error && body.error !== 'authorization_pending') throw new Error(friendly(body.error))
  }
  throw new Error('Device code expired')
}

export async function fetchUser(token: string) {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error('Token rejected by GitHub')
  return (await res.json()) as { id: number; login: string; name: string | null; avatar_url: string }
}

export async function listIssues(token: string, repo: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=50`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`Could not list issues (${res.status})`)
  const items = (await res.json()) as Array<{ number: number; title: string; body: string | null; labels: { name: string }[]; pull_request?: unknown }>
  return items.filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, body: i.body ?? '', labels: i.labels.map((l) => l.name) }))
}
