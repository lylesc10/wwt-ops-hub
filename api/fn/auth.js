const IS_SANDBOX   = process.env.FN_ENV === 'sandbox'
const FN_BASE      = IS_SANDBOX ? 'https://api.fndev.net'              : 'https://api.fieldnation.com'
const FN_AUTH      = IS_SANDBOX ? 'https://auth.fndev.net/oauth/token' : 'https://auth.fieldnation.com/oauth/token'

let _tokenCache = null

export async function getFNToken(clientId, clientSecret, base) {
  const authUrl = base?.includes('fndev') ? 'https://auth.fndev.net/oauth/token' : FN_AUTH
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
  const baseUrl      = credentials?.baseUrl      || process.env.FN_BASE_URL || FN_BASE
  if (!clientId || !clientSecret) throw new Error('FN_CREDENTIALS_MISSING')
  const token = await getFNToken(clientId, clientSecret, baseUrl)
  return fetch(`${baseUrl}${path}`, {
    ...opts,
    headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json', Accept:'application/json', ...(opts.headers??{}) },
  })
}

export { FN_BASE }
