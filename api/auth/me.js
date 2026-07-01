/**
 * GET /api/auth/me
 * Returns the profile row for the authenticated user.
 */

import { withSecurity, requireAuth } from '../_lib/middleware.js'
import { supa } from '../_lib/db.js'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })

  const { data: profile, error } = await supa
    .from('users')
    .select('id, email, full_name, role, created_at')
    .eq('id', req.user.id)
    .single()

  if (error || !profile) return res.status(404).json({ message: 'User not found' })
  return res.json(profile)
}

export default withSecurity(requireAuth(handler))
