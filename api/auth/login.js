/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { access_token, user: { id, email, role } }
 */

import jwt      from 'jsonwebtoken'
import bcrypt   from 'bcryptjs'
import { supa } from '../_lib/db.js'
import { withSecurity } from '../_lib/middleware.js'

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { email, password } = req.body ?? {}
  if (!email || !password) return res.status(400).json({ message: 'email and password are required' })

  const { data: user, error } = await supa
    .from('users')
    .select('id, email, role, full_name, password_hash')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (error || !user) return res.status(401).json({ message: 'Invalid email or password' })

  const valid = user.password_hash
    ? await bcrypt.compare(password, user.password_hash)
    : false

  if (!valid) return res.status(401).json({ message: 'Invalid email or password' })

  const secret = process.env.JWT_SECRET
  if (!secret) return res.status(500).json({ message: 'JWT_SECRET not configured' })

  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn: '8h' },
  )

  return res.json({
    access_token: token,
    user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
  })
}

export default withSecurity(handler)
