/**
 * POST   /api/fn/work-orders/[id]/publish — publish a draft WO (send it live).
 * DELETE /api/fn/work-orders/[id]/publish — revert a publish (unpublish back to draft).
 */

import { fnFetch } from '../../auth.js'
import { getFNCredentials } from '../../../_lib/credentials.js'
import { withSecurity, requireAuth } from '../../../_lib/middleware.js'
import { query } from '../../../_lib/db.js'
import { logError } from '../../../_lib/log.js'

async function handler(req, res) {
  const id = req.query?.id
  if (!id) return res.status(400).json({ message: 'id is required' })

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  let creds
  try {
    creds = await getFNCredentials()
  } catch {
    return res.status(503).json({ message: 'FN credentials not configured. Add them in Settings → API & Webhooks.' })
  }

  const upstream = await fnFetch(`/workorders/${id}/publish`, { method: req.method }, creds)
  const body = upstream.status === 204 ? null : await upstream.json().catch(() => ({}))

  if (!upstream.ok) {
    return res.status(upstream.status).json({ message: body?.message ?? upstream.statusText })
  }

  try {
    await mirrorLocal(id, req.method === 'POST' ? 'published' : 'draft')
  } catch (e) {
    logError('[fn/work-orders/[id]/publish] local mirror failed:', e.message)
  }

  if (upstream.status === 204) return res.status(204).end()
  return res.status(upstream.status).json(body ?? { ok: true })
}

async function mirrorLocal(fnWoId, fnStatus) {
  await query(
    `UPDATE site_work_orders SET fn_status = $1, synced_at = now() WHERE fn_wo_id = $2`,
    [fnStatus, fnWoId],
  )
  const woStatus = fnStatus === 'published' ? 'pushed' : 'draft'
  await query(
    `UPDATE work_orders SET status = $1, fn_pushed_at = $2, updated_at = now() WHERE fn_wo_id = $3`,
    [woStatus, fnStatus === 'published' ? new Date().toISOString() : null, fnWoId],
  )
}

export default withSecurity(requireAuth(handler, 'pm'))
