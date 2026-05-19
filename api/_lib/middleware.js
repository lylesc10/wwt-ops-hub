/**
 * Security middleware for all /api/* Vercel functions
 *
 * Usage — add to the top of any serverless function:
 *   import { withSecurity, requireAuth } from '../_lib/middleware.js'
 *   export default withSecurity(requireAuth(handler))
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── In-memory rate limiter (per IP, resets on cold start) ─────
// For production, swap with Upstash Redis
const rateMap = new Map()
const RATE_LIMIT = 60      // requests
const RATE_WINDOW = 60000  // 1 minute in ms

function checkRateLimit(ip) {
  const now = Date.now()
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
  // CSP applies to API responses only (JSON). The frontend SPA has its own
  // CSP via Vercel headers config. Keep this tight for API routes.
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
}

// ── CORS ──────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean)

function setCORS(req, res) {
  const origin = req.headers['origin']
  const isAllowed = !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin)

  if (isAllowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Max-Age', '86400')
}

// ── Middleware wrappers ───────────────────────────────────────

/**
 * withSecurity — wraps a handler with rate limiting + security headers
 */
export function withSecurity(handler) {
  return async (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? 'unknown'

    setCORS(req, res)
    securityHeaders(res)

    if (req.method === 'OPTIONS') {
      return res.status(204).end()
    }

    if (!checkRateLimit(ip)) {
      return res.status(429).json({
        message: 'Too many requests. Please slow down.',
        retryAfter: 60,
      })
    }

    return handler(req, res)
  }
}

/**
 * requireAuth — validates Supabase JWT and attaches user to req
 * Optionally require a minimum role: requireAuth(handler, 'pm')
 */
export function requireAuth(handler, minRole = null) {
  return async (req, res) => {
    const authHeader = req.headers['authorization']
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing authorization header' })
    }

    const token = authHeader.slice(7)

    try {
      const { data: { user }, error } = await supabase.auth.getUser(token)

      if (error || !user) {
        return res.status(401).json({ message: 'Invalid or expired token' })
      }

      // Load profile for role check
      if (minRole) {
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single()

        const ROLE_RANK = { viewer: 0, pm: 1, admin: 2 }
        const userRank = ROLE_RANK[profile?.role ?? 'viewer']
        const requiredRank = ROLE_RANK[minRole]

        if (userRank < requiredRank) {
          return res.status(403).json({ message: `Requires ${minRole} role or higher` })
        }

        req.userRole = profile?.role
      }

      req.user = user
    } catch (err) {
      return res.status(401).json({ message: 'Token validation failed' })
    }

    return handler(req, res)
  }
}

/**
 * validateBody — basic input sanitization
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
        if (rules.type === 'string' && typeof val !== 'string') {
          errors.push(`${field} must be a string`)
        }
        if (rules.type === 'uuid' && !/^[0-9a-f-]{36}$/.test(val)) {
          errors.push(`${field} must be a valid UUID`)
        }
        if (rules.maxLength && typeof val === 'string' && val.length > rules.maxLength) {
          errors.push(`${field} must be at most ${rules.maxLength} characters`)
        }
      }
    }

    if (errors.length) {
      return res.status(400).json({ message: 'Validation failed', errors })
    }

    return handler(req, res)
  }
}

/**
 * Compose multiple middleware functions
 * Usage: compose(withSecurity, requireAuth, validateBody(schema))(handler)
 */
export function compose(...fns) {
  return (handler) => fns.reduceRight((h, fn) => fn(h), handler)
}
