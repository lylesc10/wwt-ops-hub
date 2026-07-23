/**
 * POST /api/fn/push-wo
 * Body: { csv_row: object, project_id: string }
 *
 * Pushes a single work order to FieldNation via API.
 * Falls back to mock when credentials aren't configured.
 *
 * Payload mapping + FN call (with 429 retry) live in _lib/push-core.js,
 * shared with the batch endpoint api/fn/push-wos.js.
 */

import { withSecurity } from '../_lib/middleware.js'
import { getFNCredentials } from '../_lib/credentials.js'
import { logError } from '../_lib/log.js'
import { pushOne, mockResult } from './_lib/push-core.js'

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { csv_row } = req.body ?? {}
  if (!csv_row) return res.status(400).json({ message: 'csv_row required' })

  try {
    let creds = null
    try { creds = await getFNCredentials() } catch { /* mock mode */ }

    // Mock mode — no FN credentials configured
    if (!creds) return res.json(mockResult())

    const result = await pushOne(csv_row, creds)
    if (!result.ok) return res.status(500).json(result)
    return res.json(result)
  } catch (err) {
    logError('[FN push-wo]', err)
    return res.status(500).json({ ok: false, message: err.message })
  }
}

// Open-access like the rest of the app (no login) — withSecurity only
export default withSecurity(handler)
