/**
 * POST /api/auth/users
 * Admin-only: create a new user with an initial password.
 * Body: { email, full_name, role, password }
 */

import bcrypt from 'bcryptjs'
import { supa } from '../_lib/db.js'
import { withSecurity, requireAuth } from '../_lib/middleware.js'

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { email, full_name, role = 'viewer', password } = req.body ?? {}
  if (!email) return res.status(400).json({ message: 'email is required' })

  const tempPassword = password || Math.random().toString(36).slice(2, 10) + 'Aa1!'
  const hash = await bcrypt.hash(tempPassword, 12)

  const { data: existing } = await supa
    .from('users').select('id').eq('email', email.toLowerCase().trim()).single()

  if (existing) return res.status(409).json({ message: 'A user with that email already exists' })

  const { data: user, error } = await supa
    .from('users')
    .insert({
      email:         email.toLowerCase().trim(),
      full_name:     full_name ?? null,
      role,
      password_hash: hash,
    })
    .select('id, email, full_name, role')
    .single()

  if (error) return res.status(500).json({ message: error.message })

  return res.json({
    user,
    // Only returned when a random password was generated — share with admin to hand off to user
    ...(password ? {} : { temp_password: tempPassword }),
  })
}

export default withSecurity(requireAuth(handler, 'admin'))
