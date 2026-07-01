/**
 * GET  /api/fn/work-orders        — list WOs (with optional filters)
 * POST /api/fn/work-orders        — create a new WO
 * GET  /api/fn/work-orders/[id]   — get a single WO
 *
 * Authenticated (pm+). Credentials read from DB or env vars.
 */

import { fnFetch }                         from './auth.js'
import { withSecurity, requireAuth }       from '../_lib/middleware.js'
import { supa as supabase }                from '../_lib/db.js'


function parseFNCreds(encrypted_data) {
  try { return JSON.parse(Buffer.from(String(encrypted_data), 'base64').toString('utf-8')) } catch {}
  try { return JSON.parse(String(encrypted_data)) } catch {}
  return null
}

async function getFNCredentials() {
  if (process.env.FN_CLIENT_ID) {
    return {
      clientId:     process.env.FN_CLIENT_ID,
      clientSecret: process.env.FN_CLIENT_SECRET,
      username:     process.env.FN_USERNAME,
      password:     process.env.FN_PASSWORD,
      baseUrl:      process.env.FN_BASE_URL || 'sandbox',
    }
  }
  const { data, error } = await supabase
    .from('credentials')
    .select('encrypted_data')
    .eq('service', 'fieldnation')
    .single()
  if (error || !data?.encrypted_data) throw new Error('FN credentials not configured.')
  const creds = parseFNCreds(data.encrypted_data)
  if (!creds?.client_id || !creds?.client_secret) throw new Error('Incomplete FN credentials stored.')
  if (!creds?.username || !creds?.password) throw new Error('FN username and password required. Re-save in Settings → API & Webhooks → FieldNation.')
  const isSandbox = !creds.environment || creds.environment === 'sandbox'
  return {
    clientId:     creds.client_id,
    clientSecret: creds.client_secret,
    username:     creds.username,
    password:     creds.password,
    baseUrl:      isSandbox ? 'sandbox' : 'prod',
  }
}

async function handler(req, res) {
  // Return mock when no creds configured (dev mode)
  let creds
  try { creds = await getFNCredentials() } catch {
    if (req.method === 'GET')  return res.json({ results: [], total: 0, mock: true })
    if (req.method === 'POST') return res.json({ id: `mock-${Date.now()}`, status: 'draft', mock: true })
    return res.status(405).json({ message: 'Method not allowed' })
  }

  if (req.method === 'GET') {
    const qs = new URLSearchParams(req.query ?? {})
    const upstream = await fnFetch(`/workorders?${qs}`, {}, creds)
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  }

  if (req.method === 'POST') {
    const upstream = await fnFetch('/workorders', {
      method: 'POST',
      body:   JSON.stringify(req.body),
    }, creds)
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  }

  return res.status(405).json({ message: 'Method not allowed' })
}

export default withSecurity(requireAuth(handler, 'pm'))
