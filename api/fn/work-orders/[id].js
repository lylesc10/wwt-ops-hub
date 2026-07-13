/**
 * GET /api/fn/work-orders/[id] — fetch a single WO's full detail (schedule/
 *   pay/location included) for the edit modal.
 * PUT /api/fn/work-orders/[id] — update the WO. Body: { initial, current }
 *   — two flat form snapshots (as tracked by WorkOrderEditModal). Only the
 *   FN sub-resources that actually differ between them are sent, via
 *   diffToPatch()/patchToSteps() from ../_lib/wo-payloads.js.
 *
 * PUTs are issued sequentially (schedule → pay → location → root) and stop
 * at the first failure, so a partial save can't silently skip ahead — the
 * response reports exactly which resources saved, which failed, and which
 * were never attempted.
 *
 * Open-access like the rest of the app (no login) — withSecurity only.
 */

import { fnFetch } from '../auth.js'
import { getFNCredentials } from '../../_lib/credentials.js'
import { withSecurity } from '../../_lib/middleware.js'
import { query } from '../../_lib/db.js'
import { logError } from '../../_lib/log.js'
import { diffToPatch, patchToSteps } from '../_lib/wo-payloads.js'

async function handler(req, res) {
  const id = req.query?.id
  if (!id) return res.status(400).json({ message: 'id is required' })

  let creds
  try {
    creds = await getFNCredentials()
  } catch {
    if (req.method === 'GET') return res.json({ id, mock: true })
    return res.status(503).json({ message: 'FN credentials not configured. Add them in Settings → API & Webhooks.' })
  }

  if (req.method === 'GET') {
    const params = new URLSearchParams()
    for (const inc of ['schedule', 'pay', 'location']) params.append('include[]', inc)
    const upstream = await fnFetch(`/workorders/${id}?${params}`, {}, creds)
    const data = await upstream.json().catch(() => ({}))
    return res.status(upstream.status).json(data)
  }

  if (req.method === 'PUT') {
    const { initial, current } = req.body ?? {}
    if (!current) return res.status(400).json({ message: 'current is required' })

    const patch = diffToPatch(initial ?? current, current)
    const steps = patchToSteps(id, patch)
    if (!steps.length) return res.json({ ok: true, results: [], skipped: [], message: 'No changes to save.' })

    const results = []
    for (const step of steps) {
      try {
        const upstream = await fnFetch(step.path, { method: step.method, body: JSON.stringify(step.body) }, creds)
        if (upstream.ok) {
          results.push({ resource: step.resource, ok: true, status: upstream.status })
        } else {
          const err = await upstream.json().catch(() => ({}))
          results.push({ resource: step.resource, ok: false, status: upstream.status, error: err.message ?? upstream.statusText })
          break // stop at first failure — remaining steps reported as skipped, never attempted
        }
      } catch (e) {
        results.push({ resource: step.resource, ok: false, error: e.message })
        break
      }
    }

    const attempted = new Set(results.map((r) => r.resource))
    const skipped = steps.map((s) => s.resource).filter((r) => !attempted.has(r))
    const allOk = results.every((r) => r.ok) && skipped.length === 0

    try {
      await mirrorLocal(id, patch, results)
    } catch (e) {
      logError('[fn/work-orders/[id]] local mirror failed:', e.message)
    }

    return res.json({ ok: allOk, partial: !allOk && results.some((r) => r.ok), results, skipped })
  }

  return res.status(405).json({ message: 'Method not allowed' })
}

// Best-effort mirror into the local DB so cached views (e.g. SiteBoard's FN
// WO column) don't go stale. An unscoped FN work order may have no local
// row at all — that's fine, the UPDATE just affects zero rows.
async function mirrorLocal(fnWoId, patch, results) {
  const ok = new Set(results.filter((r) => r.ok).map((r) => r.resource))
  const cols = {}

  if (ok.has('schedule') && patch.schedule) {
    const date = patch.schedule.service_window?.start?.local?.date
    const time = patch.schedule.service_window?.start?.local?.time
    if (date) cols.scheduled_date = date
    if (time) cols.start_time = time
  }
  if (ok.has('pay') && patch.pay) {
    const amount = patch.pay.base?.amount ?? patch.pay.base?.rate
    if (amount != null) {
      cols.budget = amount
      cols.pay_rate = amount
    }
  }
  if (!Object.keys(cols).length) return

  const columns = Object.keys(cols)
  const sets = columns.map((c, i) => `${c} = $${i + 1}`)
  sets.push(`synced_at = now()`)
  const params = [...columns.map((c) => cols[c]), fnWoId]
  await query(
    `UPDATE site_work_orders SET ${sets.join(', ')} WHERE fn_wo_id = $${params.length}`,
    params,
  )
  await query(`UPDATE work_orders SET updated_at = now() WHERE fn_wo_id = $1`, [fnWoId])
}

export default withSecurity(handler)
