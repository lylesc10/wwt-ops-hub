/**
 * Security middleware for all /api/* handlers.
 *
 * Usage:
 *   import { withSecurity, requireAuth } from '../_lib/middleware.js'
 *   export default withSecurity(requireAuth(handler))
 *   export default withSecurity(requireAuth(handler, 'pm'))   // min role
 */

import jwt from 'jsonwebtoken'

// ── In-memory rate limiter (per IP, resets on container restart) ──
// For production, swap with Azure Cache for Redis.
const rateMap = new Map()
const RATE_LIMIT  = 60      // requests
const RATE_WINDOW = 60_000  // 1 minute in ms

function checkRateLimit(ip) {
  const now   = Date.now()
  const entry = rateMap.get(ip) ?? { count: 0, start: now }

  if (now - entry.start > RATE_WINDOW) {
    rateMap.set(ip, { count: 1, start: now })
    return true
  }

  entry.count++
  rateMap.set(ip, entry)
  return entry.count <= RATE_LIMIT
}

// ── Security headers ──────────────────────────────────────────
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
}

// ── CORS ──────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean)

function setCORS(req, res) {
  const origin    = req.headers['origin']
  const isAllowed = !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin)

  if (isAllowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-MS-API-ROLE')
  res.setHeader('Access-Control-Max-Age', '86400')
}

// ── Role ranking ─────────────────────────────────────────────
export const ROLE_RANK = { viewer: 0, pm: 1, admin: 2 }

// ── Middleware wrappers ───────────────────────────────────────

/**
 * withSecurity — rate limiting, CORS, and security headers.
 */
export function withSecurity(handler) {
  return async (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      ?? req.socket?.remoteAddress
      ?? 'unknown'

    setCORS(req, res)
    securityHeaders(res)

    if (req.method === 'OPTIONS') {
      return res.status(204).end()
    }

    if (!checkRateLimit(ip)) {
      return res.status(429).json({ message: 'Too many requests. Please slow down.', retryAfter: 60 })
    }

    return handler(req, res)
  }
}

/**
 * requireAuth — validates custom JWT and attaches decoded claims to req.user.
 *
 * Validates: signature (JWT_SECRET), issuer, audience, expiry.
 * Attaches:  req.user  = decoded JWT payload { sub, email, roles, … }
 *            req.userRole = first role in the roles[] claim
 *
 * @param {Function} handler
 * @param {string|null} minRole - 'pm' | 'admin' | null (any authenticated)
 */
export function requireAuth(handler, minRole = null) {
  return async (req, res) => {
    // Dev bypass: when JWT_SECRET is not configured, allow all requests as admin.
    // Enables running localhost without a real database or auth setup.
    if (!process.env.JWT_SECRET) {
      req.user     = { sub: 'dev-bypass', email: 'dev@local', roles: ['admin'], full_name: 'Dev User' }
      req.userRole = 'admin'
      return handler(req, res)
    }

    const authHeader = req.headers['authorization']
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing authorization header' })
    }

    const token = authHeader.slice(7)

    let decoded
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'],
        issuer:     process.env.JWT_ISSUER   ?? 'wwt-ops-hub',
        audience:   process.env.JWT_AUDIENCE ?? 'wwt-ops-hub-api',
      })
    } catch (err) {
      const msg = err.name === 'TokenExpiredError'
        ? 'Token expired'
        : 'Invalid or malformed token'
      return res.status(401).json({ message: msg })
    }

    // roles is an array in the JWT payload (e.g. ['pm'])
    const userRole = decoded.roles?.[0] ?? 'viewer'
    req.user     = decoded   // { sub, email, full_name, roles, iat, exp }
    req.userRole = userRole

    if (minRole) {
      const userRank     = ROLE_RANK[userRole]     ?? 0
      const requiredRank = ROLE_RANK[minRole]      ?? 99
      if (userRank < requiredRank) {
        return res.status(403).json({ message: `Requires ${minRole} role or higher` })
      }
    }

    return handler(req, res)
  }
}

/**
 * validateBody — lightweight schema validation.
 * @param {Object} schema - { fieldName: { type, required, maxLength } }
 */
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
        if (rules.type === 'string' && typeof val !== 'string')
          errors.push(`${field} must be a string`)
        if (rules.type === 'uuid' && !/^[0-9a-f-]{36}$/.test(val))
          errors.push(`${field} must be a valid UUID`)
        if (rules.maxLength && typeof val === 'string' && val.length > rules.maxLength)
          errors.push(`${field} must be at most ${rules.maxLength} characters`)
      }
    }

    if (errors.length) {
      return res.status(400).json({ message: 'Validation failed', errors })
    }

    return handler(req, res)
  }
}

/**
 * Compose multiple middleware wrappers left-to-right.
 * compose(withSecurity, requireAuth, validateBody(schema))(handler)
 */
export function compose(...fns) {
  return (handler) => fns.reduceRight((h, fn) => fn(h), handler)
}

/**
 * buildClientPrincipal — builds the X-MS-CLIENT-PRINCIPAL header value
 * that DAB (StaticWebApps provider) uses to identify the calling user.
 *
 * Used by api/data/proxy.js to forward identity to the internal DAB container.
 */
export function buildClientPrincipal(user, role) {
  const principal = {
    auth_typ: 'custom',
    claims: [
      { typ: 'sub',   val: user.sub   },
      { typ: 'email', val: user.email },
      { typ: 'roles', val: role       },
    ],
    name_typ: 'sub',
    role_typ: 'roles',
  }
  return Buffer.from(JSON.stringify(principal)).toString('base64')
}
