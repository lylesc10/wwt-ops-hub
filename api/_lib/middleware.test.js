import { describe, it, expect, vi } from 'vitest'
import jwt from 'jsonwebtoken'

vi.mock('./db.js', () => ({
  supa: { from: vi.fn() },
}))

import { supa } from './db.js'
import { requireAuth, validateBody, compose, withSecurity } from './middleware.js'

process.env.JWT_SECRET = 'test-secret-for-vitest'

function makeReq({ method = 'GET', headers = {}, body = undefined, ip = '10.0.0.1' } = {}) {
  return { method, headers: { 'x-forwarded-for': ip, ...headers }, body, socket: { remoteAddress: ip } }
}

function makeRes() {
  const res = { headers: {} }
  res.status = vi.fn((code) => { res.statusCode = code; return res })
  res.json = vi.fn((body) => { res.body = body; return res })
  res.setHeader = vi.fn((k, v) => { res.headers[k] = v })
  res.end = vi.fn(() => res)
  return res
}

describe('requireAuth', () => {
  it('rejects requests with no Authorization header', async () => {
    const handler = vi.fn()
    const wrapped = requireAuth(handler)
    const req = makeReq()
    const res = makeRes()
    await wrapped(req, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects an invalid/garbage token', async () => {
    const handler = vi.fn()
    const wrapped = requireAuth(handler)
    const req = makeReq({ headers: { authorization: 'Bearer not-a-real-jwt' } })
    const res = makeRes()
    await wrapped(req, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired token' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('accepts a valid token and attaches req.user when no role is required', async () => {
    const token = jwt.sign({ sub: 'user-1', email: 'a@b.com' }, process.env.JWT_SECRET)
    const handler = vi.fn((req, res) => res.status(200).json({ ok: true }))
    const wrapped = requireAuth(handler)
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } })
    const res = makeRes()
    await wrapped(req, res)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(req.user).toEqual({ id: 'user-1', email: 'a@b.com' })
  })

  it('supports the curried form: requireAuth(role) returns a middleware factory', () => {
    const factory = requireAuth('pm')
    expect(typeof factory).toBe('function')
    const wrapped = factory(vi.fn())
    expect(typeof wrapped).toBe('function')
  })

  it('allows a user whose role meets the minimum required role', async () => {
    supa.from.mockReturnValue({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role: 'pm' }, error: null }) }) }),
    })
    const token = jwt.sign({ sub: 'user-1', email: 'a@b.com' }, process.env.JWT_SECRET)
    const handler = vi.fn((req, res) => res.status(200).json({ ok: true }))
    const wrapped = requireAuth(handler, 'pm')
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } })
    const res = makeRes()
    await wrapped(req, res)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(req.userRole).toBe('pm')
  })

  it('rejects a user whose role ranks below the minimum required role', async () => {
    supa.from.mockReturnValue({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role: 'viewer' }, error: null }) }) }),
    })
    const token = jwt.sign({ sub: 'user-1', email: 'a@b.com' }, process.env.JWT_SECRET)
    const handler = vi.fn()
    const wrapped = requireAuth(handler, 'admin')
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } })
    const res = makeRes()
    await wrapped(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('validateBody', () => {
  const schema = { name: { required: true, type: 'string', maxLength: 5 } }

  it('rejects a non-object body', async () => {
    const handler = vi.fn()
    const wrapped = validateBody(schema)(handler)
    const res = makeRes()
    await wrapped(makeReq({ body: undefined }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(handler).not.toHaveBeenCalled()
  })

  it('reports a missing required field', async () => {
    const handler = vi.fn()
    const wrapped = validateBody(schema)(handler)
    const res = makeRes()
    await wrapped(makeReq({ body: {} }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: 'Validation failed', errors: ['name is required'] })
  })

  it('reports a field exceeding maxLength', async () => {
    const handler = vi.fn()
    const wrapped = validateBody(schema)(handler)
    const res = makeRes()
    await wrapped(makeReq({ body: { name: 'way-too-long' } }), res)
    expect(res.json).toHaveBeenCalledWith({
      message: 'Validation failed',
      errors: ['name must be at most 5 characters'],
    })
  })

  it('calls through to the handler when validation passes', async () => {
    const handler = vi.fn((req, res) => res.status(200).json({ ok: true }))
    const wrapped = validateBody(schema)(handler)
    const res = makeRes()
    await wrapped(makeReq({ body: { name: 'abc' } }), res)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('compose', () => {
  it('applies middleware outer-to-inner in the order given', async () => {
    const order = []
    const mwA = (h) => async (req, res) => { order.push('A'); return h(req, res) }
    const mwB = (h) => async (req, res) => { order.push('B'); return h(req, res) }
    const handler = () => order.push('handler')
    await compose(mwA, mwB)(handler)(makeReq(), makeRes())
    expect(order).toEqual(['A', 'B', 'handler'])
  })
})

describe('withSecurity', () => {
  it('short-circuits OPTIONS requests with 204 and never calls the handler', async () => {
    const handler = vi.fn()
    const wrapped = withSecurity(handler)
    const req = makeReq({ method: 'OPTIONS', ip: '10.0.0.2' })
    const res = makeRes()
    await wrapped(req, res)
    expect(res.status).toHaveBeenCalledWith(204)
    expect(handler).not.toHaveBeenCalled()
  })

  it('sets baseline security headers on every response', async () => {
    const handler = vi.fn((req, res) => res.status(200).json({ ok: true }))
    const wrapped = withSecurity(handler)
    const req = makeReq({ ip: '10.0.0.3' })
    const res = makeRes()
    await wrapped(req, res)
    expect(res.headers['X-Frame-Options']).toBe('DENY')
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff')
  })

  it('rate-limits a client after 60 requests within the window', async () => {
    const handler = vi.fn((req, res) => res.status(200).json({ ok: true }))
    const wrapped = withSecurity(handler)
    const ip = '10.0.0.4'
    let lastRes
    for (let i = 0; i < 61; i++) {
      lastRes = makeRes()
      await wrapped(makeReq({ ip }), lastRes)
    }
    expect(lastRes.status).toHaveBeenCalledWith(429)
  })
})
