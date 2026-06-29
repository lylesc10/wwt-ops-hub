/**
 * GET /api/credentials
 * Returns masked credential status for all services (no raw keys).
 * Admin only.
 */

import { query } from '../_lib/db.js'
import { withSecurity, requireAuth } from '../_lib/middleware.js'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })

  const { rows, error: dbErr } = await query('SELECT * FROM credentials_masked ORDER BY service').catch(e => ({ rows: null, error: e }))
  if (dbErr) return res.status(500).json({ message: dbErr.message })
  return res.json({ credentials: rows })
}

export default withSecurity(requireAuth(handler, 'admin'))
