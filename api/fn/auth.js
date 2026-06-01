const BASE_URL_MAP = {
  sandbox:    'https://api.fndev.net',
  prod:       'https://api.fieldnation.com',
  production: 'https://api.fieldnation.com',
}
const AUTH_URL_MAP = {
  sandbox:    'https://auth.fndev.net/oauth/token',
  prod:       'https://auth.fieldnation.com/oauth/token',
  production: 'https://auth.fieldnation.com/oauth/token',
}

const IS_SANDBOX = process.env.FN_ENV === 'sandbox'
const FN_BASE    = IS_SANDBOX ? BASE_URL_MAP.sandbox : BASE_URL_MAP.prod
const FN_AUTH    = IS_SANDBOX ? AUTH_URL_MAP.sandbox : AUTH_URL_MAP.prod

let _tokenCache = null

function resolveBase(raw) {
  return BASE_URL_MAP[raw] ?? raw
}

function resolveAuth(raw) {
  if (AUTH_URL_MAP[raw]) return AUTH_URL_MAP[raw]
  return raw?.includes('fndev') ? AUTH_URL_MAP.sandbox : FN_AUTH
}

export async function getFNToken(clientId, clientSecret, base) {
  const authUrl = resolveAuth(base)
  if (_tokenCache?.clientId === clientId && Date.now() < _tokenCache.expiresAt - 60_000) return _tokenCache.token
  const res = await fetch(authUrl, {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body: new URLSearchParams({ grant_type:'client_credentials', client_id:clientId, client_secret:clientSecret, scope:'read write' }),
  })
  if (!res.ok) { const err = await res.text().catch(()=>''); throw new Error(`FN auth failed (${res.status}): ${err}`) }
  const data = await res.json()
  _tokenCache = { clientId, token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
  return _tokenCache.token
}

export async function fnFetch(path, opts = {}, credentials = null) {
  const clientId     = credentials?.clientId     || process.env.FN_CLIENT_ID
  const clientSecret = credentials?.clientSecret || process.env.FN_CLIENT_SECRET
  const rawBase      = credentials?.baseUrl      || process.env.FN_BASE_URL || FN_BASE
  const baseUrl      = resolveBase(rawBase)
  if (!clientId || !clientSecret) throw new Error('FN_CREDENTIALS_MISSING')
  const token = await getFNToken(clientId, clientSecret, rawBase)
  return fetch(`${baseUrl}${path}`, {
    ...opts,
    headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json', Accept:'application/json', ...(opts.headers??{}) },
  })
}

export { FN_BASE }
