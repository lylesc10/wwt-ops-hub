/**
 * GET  /api/fn/work-orders        — list WOs (with optional filters)
 * POST /api/fn/work-orders        — create a new WO
 *
 * Authenticated (pm+). Credentials read from DB or env vars.
 */

import { fnFetch }                   from './auth.js'
import { withSecurity, requireAuth } from '../_lib/middleware.js'
import { getFNCredentials }          from '../_lib/credentials.js'

async function handler(req, res) {
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
    const upstream = await fnFetch('/workorders', { method: 'POST', body: JSON.stringify(req.body) }, creds)
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  }

  return res.status(405).json({ message: 'Method not allowed' })
}

export default withSecurity(requireAuth(handler, 'pm'))
