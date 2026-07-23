/**
 * POST /api/fn/push-wos
 * Body: { csv_rows: array[], project_id: string }
 *
 * Batch work-order push. Accepts up to MAX_BATCH rows per request so a
 * 100-WO push is ~4–10 requests against our own rate limiter instead of
 * 100, while the server paces the FN calls (sequential + inter-request
 * delay + 429 backoff in push-core) to stay friendly with FN's limits.
 *
 * Per-row failures never abort the batch — each row gets its own result:
 *   { ok: true, results: [{ site_id, ok, mock?, wo_id?, status?, url?, message? }, ...] }
 *
 * Clients chunk larger sets (see pushToFN in src/pages/WorkOrders.jsx),
 * which also keeps each request well under the ingress timeout and gives
 * per-chunk progress.
 */

import { withSecurity } from '../_lib/middleware.js'
import { getFNCredentials } from '../_lib/credentials.js'
import { logError } from '../_lib/log.js'
import { pushOne, mockResult } from './_lib/push-core.js'

export const MAX_BATCH = 25
const PACE_MS = 250 // delay between FN create calls within a batch

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { csv_rows } = req.body ?? {}
  if (!Array.isArray(csv_rows) || csv_rows.length === 0) {
    return res.status(400).json({ message: 'csv_rows required — non-empty array of CSV row arrays' })
  }
  if (csv_rows.length > MAX_BATCH) {
    return res.status(400).json({ message: `Too many rows — max ${MAX_BATCH} per request. Chunk client-side.` })
  }

  try {
    let creds = null
    try { creds = await getFNCredentials() } catch { /* mock mode */ }

    const results = []
    for (let i = 0; i < csv_rows.length; i++) {
      const row = csv_rows[i]
      const siteId = Array.isArray(row) ? row[2] : undefined

      const result = creds ? await pushOne(row, creds) : mockResult()
      results.push({ site_id: siteId, ...result })

      // Pace real FN calls; skip the delay in mock mode and after the last row
      if (creds && i < csv_rows.length - 1) await sleep(PACE_MS)
    }

    return res.json({
      ok:      true,
      mock:    !creds,
      total:   results.length,
      pushed:  results.filter((r) => r.ok).length,
      results,
    })
  } catch (err) {
    logError('[FN push-wos]', err)
    return res.status(500).json({ ok: false, message: err.message })
  }
}

// Open-access like the rest of the app (no login) — withSecurity only
export default withSecurity(handler)
