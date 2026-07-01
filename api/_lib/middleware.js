/**
 * Security middleware for all /api/* handlers.
 *
 * Usage:
 *   import { withSecurity, requireAuth, compose } from '../_lib/middleware.js'
 *   export default withSecurity(requireAuth(handler, 'pm'))
 *   // or:
 *   export default compose(withSecurity, requireAuth('pm'))(handler)
 */

import jwt from 'jsonwebtoken'
import { supa } from './db.js'

// ── Rate limiter (in-memory, resets on cold start) ────────────────────────────
const rateMap = new Map()
const RATE_LIMIT  = 60
const RATE_WINDOW = 60_000

function checkRateLimit(ip) {
  const now   = Date.now()
  const entry = rateMap.get(ip) ?? { count: 0, start: now }
  if (now - entry.start > RATE_WINDOW) { rateMap.set(ip, { count: 1, start: now }); return true }
  entry.count++
  rateMap.set(ip, entry)
  return entry.count <= RATE_LIMIT
}

// ── Security headers ──────────────────────────────────────────────────────────
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options',  'nosniff')
  res.setHeader('X-Frame-Options',          'DENY')
  res.setHeader('X-XSS-Protection',         '1; mode=block')
  res.setHeader('Referrer-Policy',          'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy',       'camera=(), microphone=(), geolocation=()')
  res.setHeader('Content-Security-Policy',  "default-src 'none'; frame-ancestors 'none'")
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
}

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean)

function setCORS(req, res) {
  const origin    = req.headers['origin']
  const isAllowed = !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin)
  if (isAllowed && origin) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Max-Age',       '86400')
}

// ── Middleware wrappers ───────────────────────────────────────────────────────

export function withSecurity(handler) {
  return async (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      ?? req.socket?.remoteAddress ?? 'unknown'

    setCORS(req, res)
    securityHeaders(res)

    if (req.method === 'OPTIONS') return res.status(204).end()
    if (!checkRateLimit(ip)) return res.status(429).json({ message: 'Too many requests.', retryAfter: 60 })

    return handler(req, res)
  }
}

/**
 * requireAuth(handler, minRole?) — validates JWT and attaches req.user / req.userRole.
 * Also supports curried form for compose(): requireAuth('pm') returns a wrapper fn.
 */
export function requireAuth(handlerOrRole, minRole = null) {
  // Curried form: requireAuth('pm') → middleware factory
  if (typeof handlerOrRole === 'string') {
    const role = handlerOrRole
    return (handler) => requireAuth(handler, role)
  }

  const handler = handlerOrRole
  return async (req, res) => {
    const authHeader = req.headers['authorization']
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing authorization header' })
    }

    const token = authHeader.slice(7)
    let payload
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET)
    } catch (e) {
      return res.status(401).json({ message: 'Invalid or expired token' })
    }

    req.user = { id: payload.sub, email: payload.email }

    if (minRole) {
      const { data: profile } = await supa.from('users').select('role').eq('id', payload.sub).single()
      const ROLE_RANK = { viewer: 0, pm: 1, admin: 2 }
      const userRank  = ROLE_RANK[profile?.role ?? 'viewer']
      const reqRank   = ROLE_RANK[minRole]
      if (userRank < reqRank) return res.status(403).json({ message: `Requires ${minRole} role or higher` })
      req.userRole = profile?.role
    }

    return handler(req, res)
  }
}

export function validateBody(schema) {
  return (handler) => async (req, res) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ message: 'Request body must be JSON' })
    }
    const errors = []
    for (const [field, rules] of Object.entries(schema)) {
      const val = req.body[field]
      if (rules.required && (val === undefined || val === null || val === '')) {
        errors.push(`${field} is required`)
        continue
      }
      if (val !== undefined && val !== null) {
        if (rules.type === 'string' && typeof val !== 'string') errors.push(`${field} must be a string`)
        if (rules.type === 'uuid' && !/^[0-9a-f-]{36}$/.test(val))  errors.push(`${field} must be a valid UUID`)
        if (rules.maxLength && typeof val === 'string' && val.length > rules.maxLength)
          errors.push(`${field} must be at most ${rules.maxLength} characters`)
      }
    }
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors })
    return handler(req, res)
  }
}

export function compose(...fns) {
  return (handler) => fns.reduceRight((h, fn) => fn(h), handler)
}
