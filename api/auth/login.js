/**
 * POST /api/auth/login
 * Body: { email, password }
 *
 * Returns: { access_token, refresh_token, user: { id, email, full_name, role } }
 *
 * Access token: HS256 JWT, 1h expiry, claims: sub, email, full_name, roles[]
 * Refresh token: opaque random string stored in refresh_tokens table
 */

import bcrypt        from 'bcryptjs'
import jwt           from 'jsonwebtoken'
import { randomBytes } from 'node:crypto'
import { query }     from '../_lib/db.js'
import { withSecurity } from '../_lib/middleware.js'

const ACCESS_TTL  = 60 * 60           // 1 hour
const REFRESH_TTL = 60 * 60 * 24 * 30 // 30 days

export default withSecurity(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { email, password } = req.body ?? {}

  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' })
  }

  // Lookup user
  const { rows } = await query(
    `SELECT id, email, full_name, role, password_hash
       FROM users WHERE email = $1 LIMIT 1`,
    [email.toLowerCase().trim()]
  )
  const user = rows[0]

  if (!user || !user.password_hash) {
    // Don't reveal which field was wrong
    return res.status(401).json({ message: 'Invalid credentials' })
  }

  const match = await bcrypt.compare(password, user.password_hash)
  if (!match) {
    return res.status(401).json({ message: 'Invalid credentials' })
  }

  // Issue tokens
  const refresh_token = randomBytes(40).toString('hex')

  const accessPayload = {
    sub:       user.id,
    email:     user.email,
    full_name: user.full_name ?? '',
    roles:     [user.role],
  }
  const access_token = jwt.sign(accessPayload, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TTL,
    issuer:    process.env.JWT_ISSUER   ?? 'wwt-ops-hub',
    audience:  process.env.JWT_AUDIENCE ?? 'wwt-ops-hub-api',
  })

  // Persist refresh token
  await query(
    `INSERT INTO refresh_tokens (token, user_id, expires_at)
     VALUES ($1, $2, now() + interval '${REFRESH_TTL} seconds')`,
    [refresh_token, user.id]
  )

  return res.status(200).json({
    access_token,
    refresh_token,
    expires_in: ACCESS_TTL,
    user: {
      id:        user.id,
      email:     user.email,
      full_name: user.full_name,
      role:      user.role,
    },
  })
})
