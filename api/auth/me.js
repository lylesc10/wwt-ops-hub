/**
 * GET /api/auth/me
 *
 * Returns the profile for the currently authenticated user.
 * Requires a valid access token (Bearer).
 */

import { query } from '../_lib/db.js'
import { withSecurity, requireAuth } from '../_lib/middleware.js'

export default withSecurity(requireAuth(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { rows } = await query(
    `SELECT id, email, full_name, role, avatar_url, created_at
       FROM users WHERE id = $1 LIMIT 1`,
    [req.user.sub]
  )

  if (!rows.length) {
    return res.status(404).json({ message: 'User not found' })
  }

  return res.status(200).json({ user: rows[0] })
}))
