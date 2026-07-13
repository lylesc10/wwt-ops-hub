/**
 * GET /api/fn/draft-wos
 *
 * Reads work orders directly from the FieldNation sandbox using env-var
 * credentials. No database, no mock data. Returns only draft-status WOs.
 */

import { withSecurity, requireAuth } from '../_lib/middleware.js'
import { logInfo, logError } from '../_lib/log.js'

const FN_AUTH_URL = 'https://api-sandbox.fndev.net/authentication/api/oauth/token'
const FN_BASE_URL = 'https://api-sandbox.fndev.net/api/rest/v2'

let _tokenCache = null

async function getSandboxToken() {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt - 60_000) return _tokenCache.token

  const clientId     = process.env.FN_CLIENT_ID
  const clientSecret = process.env.FN_CLIENT_SECRET
  const username     = process.env.FN_USERNAME
  const password     = process.env.FN_PASSWORD

  if (!clientId || !clientSecret) {
    throw new Error(`FN credentials missing — FN_CLIENT_ID=${clientId ?? 'unset'}`)
  }

  const res = await fetch(FN_AUTH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ grant_type: 'password', client_id: clientId, client_secret: clientSecret, username, password }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`FN auth failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  _tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
  return _tokenCache.token
}

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })

  try {
    const token = await getSandboxToken()

    const url = `${FN_BASE_URL}/workorders?access_token=${token}&per_page=100&list=workorders_draft`

    const listRes = await fetch(url, { headers: { Accept: 'application/json' } })
    const listData = await listRes.json()

    if (!listRes.ok) {
      logError('[draft-wos] FN list error:', { status: listRes.status, data: listData })
      return res.status(listRes.status).json({ message: listData.message ?? 'FN error' })
    }

    const ids = (listData.results ?? []).map(wo => wo.id)
    logInfo(`[draft-wos] ${ids.length} draft IDs from FN:`, ids)

    // Fetch full details for each WO in parallel
    const details = await Promise.all(ids.map(async (id) => {
      try {
        const r = await fetch(`${FN_BASE_URL}/workorders/${id}?access_token=${token}`, {
          headers: { Accept: 'application/json' },
        })
        return r.ok ? r.json() : null
      } catch { return null }
    }))

    const drafts = details.filter(Boolean)
    logInfo(`[draft-wos] fetched full details for ${drafts.length} WOs`)

    return res.json({ total: ids.length, count: drafts.length, drafts, statuses: ['Draft'] })

  } catch (err) {
    logError('[draft-wos]', err.message)
    return res.status(500).json({ message: err.message })
  }
}

export default withSecurity(requireAuth(handler, 'pm'))
