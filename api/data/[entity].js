/**
 * GET|POST|PATCH|DELETE /api/data/:entity[/:id]
 *
 * JWT-authenticated reverse proxy to the internal Data API Builder container.
 * The browser never talks to DAB directly — all DAB calls pass through here
 * so that JWT validation stays in the Express layer.
 *
 * Flow:
 *   1. Validate the bearer JWT (requireAuth in middleware)
 *   2. Extract the user's role from req.userRole
 *   3. Build X-MS-CLIENT-PRINCIPAL so DAB's StaticWebApps provider knows the identity
 *   4. Forward the request (method + query string + body) to internal DAB
 *   5. Stream the response back
 */

import { withSecurity, requireAuth, buildClientPrincipal } from '../_lib/middleware.js'

const DAB_INTERNAL_URL = process.env.DAB_INTERNAL_URL ?? 'http://localhost:5000'

export default withSecurity(requireAuth(async function handler(req, res) {
  // entity comes from the dynamic route segment (Express :entity param)
  const entity = req.params?.entity
  if (!entity) {
    return res.status(400).json({ message: 'entity is required' })
  }

  // Build the upstream DAB URL, preserving path after entity and the query string
  const entityPath  = req.path.replace(/^\/api\/data/, '/api')
  const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  const upstream    = `${DAB_INTERNAL_URL}${entityPath}${queryString}`

  // Build DAB identity header
  const clientPrincipal = buildClientPrincipal(req.user, req.userRole)

  // Forward headers — strip hop-by-hop
  const forwardHeaders = {
    'Content-Type':            req.headers['content-type'] ?? 'application/json',
    'X-MS-CLIENT-PRINCIPAL':   clientPrincipal,
    'X-MS-API-ROLE':           req.userRole,
  }

  const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method)
  const body    = hasBody ? JSON.stringify(req.body) : undefined

  let upstream_res
  try {
    upstream_res = await fetch(upstream, {
      method:  req.method,
      headers: forwardHeaders,
      body,
    })
  } catch (err) {
    console.error('[data proxy] DAB unreachable:', err.message)
    return res.status(502).json({ message: 'Data service unavailable' })
  }

  // Forward status + body
  const contentType = upstream_res.headers.get('content-type') ?? 'application/json'
  res.setHeader('Content-Type', contentType)
  res.status(upstream_res.status)

  const text = await upstream_res.text()
  res.send(text)
}))
