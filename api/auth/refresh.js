/**
 * POST /api/auth/refresh
 * Body: { refresh_token }
 *
 * Returns a new access_token (and optionally a new refresh_token).
 * The old refresh token is deleted on use (rotation).
 */

import jwt from 'jsonwebtoken'
import { query } from '../_lib/db.js'
import { withSecurity } from '../_lib/middleware.js'

const ACCESS_TTL  = 60 * 60
const REFRESH_TTL = 60 * 60 * 24 * 30

export default withSecurity(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { refresh_token } = req.body ?? {}

  if (!refresh_token) {
    return res.status(400).json({ message: 'refresh_token is required' })
  }

  // Look up refresh token — must not be expired
  const { rows } = await query(
    `SELECT rt.user_id, u.email, u.full_name, u.role
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
      WHERE rt.token = $1
        AND rt.expires_at > now()
      LIMIT 1`,
    [refresh_token]
  )

  if (!rows.length) {
    return res.status(401).json({ message: 'Invalid or expired refresh token' })
  }

  const user = rows[0]

  // Rotate: delete old token, issue new one
  const { randomBytes } = await import('node:crypto')
  const new_refresh_token = randomBytes(40).toString('hex')

  await query(`DELETE FROM refresh_tokens WHERE token = $1`, [refresh_token])
  await query(
    `INSERT INTO refresh_tokens (token, user_id, expires_at)
     VALUES ($1, $2, now() + interval '${REFRESH_TTL} seconds')`,
    [new_refresh_token, user.user_id]
  )

  const access_token = jwt.sign(
    {
      sub:       user.user_id,
      email:     user.email,
      full_name: user.full_name ?? '',
      roles:     [user.role],
    },
    process.env.JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: ACCESS_TTL,
      issuer:    process.env.JWT_ISSUER   ?? 'wwt-ops-hub',
      audience:  process.env.JWT_AUDIENCE ?? 'wwt-ops-hub-api',
    }
  )

  return res.status(200).json({
    access_token,
    refresh_token: new_refresh_token,
    expires_in: ACCESS_TTL,
  })
})
