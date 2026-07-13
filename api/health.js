/**
 * GET /api/health — liveness/readiness probe for Azure Container Apps.
 *
 * Intentionally unauthenticated and dependency-light: returns 200 as long as
 * the process is up, and reports DB reachability without failing the whole
 * response on a transient DB hiccup (Container Apps treats a non-2xx as
 * unhealthy and will restart/stop routing traffic to the replica).
 */

import { query } from './_lib/db.js'
import { logError } from './_lib/log.js'

export default async function handler(req, res) {
  const time = new Date().toISOString()
  let db = false

  try {
    await query('SELECT 1')
    db = true
  } catch (e) {
    logError('[health] DB check failed:', e.message)
  }

  res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', time, db })
}
