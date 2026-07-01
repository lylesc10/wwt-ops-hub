/**
 * GET /api/credentials
 * Returns masked credential status for all services (no raw keys)
 * Admin only
 */

import { withSecurity, requireAuth } from '../_lib/middleware.js'
import { supa as supabase } from '../../_lib/db.js'


async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })

  const { data, error } = await supabase
    .from('credentials_masked')
    .select('*')
    .order('service')

  if (error) return res.status(500).json({ message: error.message })
  return res.json({ credentials: data })
}

export default withSecurity(requireAuth(handler, 'admin'))
