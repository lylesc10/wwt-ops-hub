/**
 * POST /api/fn/webhook
 *
 * FieldNation webhook receiver.
 * FN posts an event payload when a WO status changes, gets assigned,
 * gets completed, payment issues arise, etc.
 *
 * Register this URL in FN: https://your-app.vercel.app/api/fn/webhook
 *
 * Event types we handle:
 *   workorder.assigned        → status: staffed, update onsite_tech
 *   workorder.work_done       → status: in_progress
 *   workorder.approved        → status: completed
 *   workorder.paid            → status: completed (+ payment confirmed)
 *   workorder.cancelled       → status: cancelled + fire alert
 *   workorder.provider_removed → status: scheduled (unstaffed)
 *   workorder.counter_offer   → fire alert (tech requested different pay)
 *   workorder.message         → log to alert_log
 */

import crypto from 'crypto'
import { query } from '../_lib/db.js'

const FN_WEBHOOK_SECRET = process.env.FN_WEBHOOK_SECRET

const FN_STATUS_MAP = {
  'workorder.assigned':         'staffed',
  'workorder.work_done':        'in_progress',
  'workorder.approved':         'completed',
  'workorder.paid':             'completed',
  'workorder.cancelled':        'cancelled',
  'workorder.provider_removed': 'scheduled',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Verify FN webhook signature if secret is configured
  if (FN_WEBHOOK_SECRET) {
    const sig = req.headers['x-fieldnation-signature'] ?? ''
    const body = JSON.stringify(req.body)
    const expected = crypto
      .createHmac('sha256', FN_WEBHOOK_SECRET)
      .update(body)
      .digest('hex')

    const sigBuf = Buffer.from(sig, 'hex')
    const expBuf = Buffer.from(expected, 'hex')
    const valid = sigBuf.length === expBuf.length &&
      crypto.timingSafeEqual(sigBuf, expBuf)

    if (!valid) {
      console.warn('[FN Webhook] Invalid signature')
      return res.status(401).json({ message: 'Invalid signature' })
    }
  }

  const event     = req.body
  const eventType = event?.event_type ?? event?.type ?? ''
  const wo        = event?.work_order ?? event?.data?.work_order ?? {}
  const woId      = String(wo.id ?? event?.work_order_id ?? '')

  console.log(`[FN Webhook] ${eventType} — WO ${woId}`)

  if (!woId) return res.json({ ok: true, message: 'No WO ID in payload' })

  try {
    const { rows } = await query(
      'SELECT id, code, branch_name, status, project_id, onsite_tech FROM sites WHERE fn_wo_id = $1 LIMIT 1',
      [woId]
    )
    const site = rows[0]

    if (!site) {
      console.log(`[FN Webhook] No site found for WO ${woId}`)
      return res.json({ ok: true, message: `No site matched WO ${woId}` })
    }

    const updates = {}

    const newStatus = FN_STATUS_MAP[eventType]
    if (newStatus && newStatus !== site.status) updates.status = newStatus

    if (eventType === 'workorder.assigned') {
      const provider = wo.routing?.assigned?.provider ?? event?.provider ?? {}
      const techName = [provider.first_name, provider.last_name].filter(Boolean).join(' ')
      if (techName && techName !== site.onsite_tech) updates.onsite_tech = techName
    }

    if (eventType === 'workorder.provider_removed') updates.onsite_tech = null

    if (Object.keys(updates).length) {
      const keys  = Object.keys(updates)
      const vals  = [...Object.values(updates), new Date().toISOString(), site.id]
      const setClauses = keys.map((k, i) => `${k} = $${i + 1}`)
      await query(
        `UPDATE sites SET ${setClauses.join(', ')}, updated_at = $${vals.length - 1} WHERE id = $${vals.length}`,
        vals
      )

      await query(
        'INSERT INTO sync_log (project_id, site_id, field_name, old_value, new_value) VALUES ($1, $2, $3, $4, $5)',
        [site.project_id, site.id, `fn_webhook_${eventType}`, site.status, updates.status ?? site.status]
      )
    }

    const alertMap = {
      'workorder.cancelled':        { type: 'provider_cancelled',    title: `WO Cancelled: ${site.code} — ${site.branch_name}` },
      'workorder.counter_offer':    { type: 'payment_flag',          title: `Counter offer on: ${site.code} — ${site.branch_name}` },
      'workorder.provider_removed': { type: 'unstaffed_approaching', title: `Tech removed from: ${site.code} — ${site.branch_name}` },
      'workorder.approved':         { type: 'site_completed',        title: `Site completed: ${site.code} — ${site.branch_name}` },
    }

    const alertDef = alertMap[eventType]
    if (alertDef) {
      await query(
        'INSERT INTO alert_log (alert_type, site_id, title, detail) VALUES ($1, $2, $3, $4)',
        [alertDef.type, site.id, alertDef.title, `FN webhook: ${eventType} — WO ${woId}`]
      )
    }

    return res.json({ ok: true, site_id: site.id, updates })

  } catch (err) {
    console.error('[FN Webhook]', err)
    return res.json({ ok: false, message: err.message })
  }
}
