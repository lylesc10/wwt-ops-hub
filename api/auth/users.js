/**
 * User management — admin only.
 *
 * POST /api/auth/users           — create user (with temp password)
 * GET  /api/auth/users           — list all users
 * PATCH /api/auth/users          — update role or reset password
 *       body: { id, role? } | { id, new_password? }
 */

import bcrypt from 'bcryptjs'
import { query } from '../_lib/db.js'
import { withSecurity, requireAuth } from '../_lib/middleware.js'

const BCRYPT_ROUNDS = 12

export default withSecurity(requireAuth(async function handler(req, res) {
  // Admin only
  if (req.userRole !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' })
  }

  // ── GET — list users ─────────────────────────────────────────
  if (req.method === 'GET') {
    const { rows } = await query(
      `SELECT id, email, full_name, role, avatar_url, created_at, updated_at
         FROM users ORDER BY created_at DESC`
    )
    return res.status(200).json({ users: rows })
  }

  // ── POST — create user ───────────────────────────────────────
  if (req.method === 'POST') {
    const { email, full_name, role = 'viewer', temp_password } = req.body ?? {}

    if (!email || !temp_password) {
      return res.status(400).json({ message: 'email and temp_password are required' })
    }

    const validRoles = ['admin', 'pm', 'viewer']
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: `role must be one of: ${validRoles.join(', ')}` })
    }

    const password_hash = await bcrypt.hash(temp_password, BCRYPT_ROUNDS)

    try {
      const { rows } = await query(
        `INSERT INTO users (email, full_name, role, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, full_name, role, created_at`,
        [email.toLowerCase().trim(), full_name ?? null, role, password_hash]
      )
      return res.status(201).json({ user: rows[0] })
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ message: 'A user with that email already exists' })
      }
      throw err
    }
  }

  // ── PATCH — update role or reset password ────────────────────
  if (req.method === 'PATCH') {
    const { id, role, new_password } = req.body ?? {}

    if (!id) {
      return res.status(400).json({ message: 'id is required' })
    }

    if (role !== undefined) {
      const validRoles = ['admin', 'pm', 'viewer']
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: `role must be one of: ${validRoles.join(', ')}` })
      }
      await query(`UPDATE users SET role = $1 WHERE id = $2`, [role, id])
    }

    if (new_password) {
      const password_hash = await bcrypt.hash(new_password, BCRYPT_ROUNDS)
      await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [password_hash, id])
    }

    const { rows } = await query(
      `SELECT id, email, full_name, role, updated_at FROM users WHERE id = $1`,
      [id]
    )
    if (!rows.length) {
      return res.status(404).json({ message: 'User not found' })
    }
    return res.status(200).json({ user: rows[0] })
  }

  return res.status(405).json({ message: 'Method not allowed' })
}, 'admin'))
