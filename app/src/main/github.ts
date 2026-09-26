import { shell } from 'electron'

/**
 * Public OAuth Client ID (Device Flow). Public by design — not a secret — so it lives in source and login
 * works on every machine with zero setup. Overridable via SAKAI_GITHUB_CLIENT_ID or the build-time define.
 */
const DEFAULT_GITHUB_CLIENT_ID = 'Ov23liIZsdtiaZjmdb2p'

declare const __GITHUB_CLIENT_ID__: string
const clientId = () => process.env.SAKAI_GITHUB_CLIENT_ID || (typeof __GITHUB_CLIENT_ID__ === 'string' && __GITHUB_CLIENT_ID__) || DEFAULT_GITHUB_CLIENT_ID
const SCOPES = 'repo read:user user:email workflow'

export interface DeviceCode {
  device_code: string
  user_code: string
  verification_uri: string
  interval: number
  expires_in: number
}

export interface GhUser { id: number; login: string; name: string | null; avatar_url: string }

const json = { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Sakai' }

const OFFLINE = 'Could not reach GitHub. Check your internet connection (or proxy/VPN) and try again.'

function friendly(code: string): string {
  return ({
    device_flow_disabled: 'Device Flow is not enabled for this GitHub OAuth app. Publisher: enable it in GitHub → Settings → Developer settings → OAuth Apps.',
    incorrect_client_credentials: 'GitHub rejected the app’s Client ID. Please update Sakai or contact the publisher.',
    access_denied: 'Authorization was cancelled on GitHub. Click Connect to try again.',
    expired_token: 'The sign-in code expired. Click Connect to get a new one.',
    unsupported_grant_type: 'GitHub sign-in is misconfigured. Please update Sakai.',
  } as Record<string, string>)[code] ?? `GitHub sign-in failed (${code}).`
}

/** fetch with a timeout; network failures become one readable "offline" error. */
async function ghFetch(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    if ((e as Error).name === 'AbortError' && init.signal?.aborted) throw e
    throw new Error(OFFLINE)
  }
}

// One sign-in attempt at a time; a new start (or cancel) aborts the previous poll.
let flow: AbortController | null = null

export function cancelDeviceFlow(): void { flow?.abort(); flow = null }

/** Only ever open github.com pages from here. */
export function openVerification(uri?: string): void {
  const url = uri && /^https:\/\/github\.com\//.test(uri) ? uri : 'https://github.com/login/device'
  void shell.openExternal(url).catch(() => undefined)
}

/** Returns the user code immediately; the browser is opened best-effort (never blocks or fails the flow). */
export async function startDeviceFlow(): Promise<DeviceCode> {
  cancelDeviceFlow()
  const res = await ghFetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ client_id: clientId(), scope: SCOPES }),
  })
  const data = (await res.json().catch(() => ({}))) as Partial<DeviceCode> & { error?: string }
  if (data.error) throw new Error(friendly(data.error))
  if (!res.ok || !data.device_code || !data.user_code) throw new Error(`GitHub sign-in could not start (${res.status}). Please try again.`)
  openVerification(data.verification_uri)
  return data as DeviceCode
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('Sign-in cancelled.')) }, { once: true })
  })

/** Polls until the user approves; returns the access token. Handles slow_down, expiry, cancel and flaky networks. */
export async function pollDeviceFlow(code: DeviceCode): Promise<string> {
  cancelDeviceFlow()
  const ac = (flow = new AbortController())
  let interval = Math.max(code.interval || 5, 1)
  const deadline = Date.now() + code.expires_in * 1000
  let netFailures = 0
  try {
    while (Date.now() < deadline) {
      await sleep(interval * 1000, ac.signal)
      let body: { access_token?: string; error?: string; interval?: number }
      try {
        const res = await ghFetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: json,
          signal: AbortSignal.any([ac.signal, AbortSignal.timeout(15_000)]),
          body: JSON.stringify({ client_id: clientId(), device_code: code.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
        })
        body = (await res.json()) as typeof body
        netFailures = 0
      } catch (e) {
        if (ac.signal.aborted) throw new Error('Sign-in cancelled.')
        if (++netFailures >= 5) throw new Error(OFFLINE) // tolerate brief blips, then give up
        continue
      }
      if (body.access_token) return body.access_token
      if (body.error === 'slow_down') interval = (body.interval ?? interval) + 5
      else if (body.error && body.error !== 'authorization_pending') throw new Error(friendly(body.error))
    }
    throw new Error(friendly('expired_token'))
  } finally {
    if (flow === ac) flow = null
  }
}

export type UserCheck = { state: 'ok'; user: GhUser } | { state: 'invalid' } | { state: 'offline' }

/** Distinguishes a revoked/expired token (invalid) from being offline, so a flaky network never signs the user out. */
export async function checkToken(token: string): Promise<UserCheck> {
  let res: Response
  try {
    res = await ghFetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sakai' } }, 10_000)
  } catch { return { state: 'offline' } }
  if (res.status === 401 || res.status === 403) return { state: 'invalid' }
  if (!res.ok) return { state: 'offline' }
  return { state: 'ok', user: (await res.json()) as GhUser }
}

export async function fetchUser(token: string): Promise<GhUser> {
  const r = await checkToken(token)
  if (r.state === 'ok') return r.user
  throw new Error(r.state === 'offline' ? OFFLINE : 'GitHub rejected the sign-in token. Please connect again.')
}

export async function listIssues(token: string, repo: string) {
  const res = await ghFetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Sakai' },
  })
  if (res.status === 404) throw new Error(`Repository ${repo} not found, or your GitHub account has no access to it.`)
  if (res.status === 401) throw new Error('GitHub rejected the sign-in token. Please connect again.')
  if (!res.ok) throw new Error(`Could not list issues (${res.status})`)
  const items = (await res.json()) as Array<{ number: number; title: string; body: string | null; labels: { name: string }[]; pull_request?: unknown }>
  return items.filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, body: i.body ?? '', labels: i.labels.map((l) => l.name) }))
}
