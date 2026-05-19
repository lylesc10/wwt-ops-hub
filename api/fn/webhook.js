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

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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

    // timingSafeEqual requires equal-length buffers — check length first
    // to avoid a crash-based oracle that leaks whether sig is the right length
    const sigBuf = Buffer.from(sig, 'hex')
    const expBuf = Buffer.from(expected, 'hex')
    const valid = sigBuf.length === expBuf.length &&
      crypto.timingSafeEqual(sigBuf, expBuf)

    if (!valid) {
      console.warn('[FN Webhook] Invalid signature')
      return res.status(401).json({ message: 'Invalid signature' })
    }
  }

  const event = req.body
  const eventType = event?.event_type ?? event?.type ?? ''
  const wo        = event?.work_order ?? event?.data?.work_order ?? {}
  const woId      = String(wo.id ?? event?.work_order_id ?? '')

  console.log(`[FN Webhook] ${eventType} — WO ${woId}`)

  if (!woId) return res.json({ ok: true, message: 'No WO ID in payload' })

  try {
    // Find the site with this FN WO ID
    const { data: site } = await supabase
      .from('sites')
      .select('id, code, branch_name, status, project_id, onsite_tech')
      .eq('fn_wo_id', woId)
      .single()

    if (!site) {
      console.log(`[FN Webhook] No site found for WO ${woId}`)
      return res.json({ ok: true, message: `No site matched WO ${woId}` })
    }

    const updates = {}

    // ── Map event to status change ─────────────────────────
    const newStatus = FN_STATUS_MAP[eventType]
    if (newStatus && newStatus !== site.status) {
      updates.status = newStatus
    }

    // ── Provider assigned ──────────────────────────────────
    if (eventType === 'workorder.assigned') {
      const provider = wo.routing?.assigned?.provider ?? event?.provider ?? {}
      const techName = [provider.first_name, provider.last_name].filter(Boolean).join(' ')
      if (techName && techName !== site.onsite_tech) {
        updates.onsite_tech = techName
      }
    }

    // ── Provider removed — unstaffed ───────────────────────
    if (eventType === 'workorder.provider_removed') {
      updates.onsite_tech = null
    }

    // ── Apply DB updates ───────────────────────────────────
    if (Object.keys(updates).length) {
      await supabase.from('sites').update({
        ...updates,
        updated_at: new Date().toISOString(),
      }).eq('id', site.id)

      await supabase.from('sync_log').insert({
        project_id: site.project_id,
        site_id:    site.id,
        field_name: `fn_webhook_${eventType}`,
        old_value:  site.status,
        new_value:  updates.status ?? site.status,
      })
    }

    // ── Fire alerts for important events ──────────────────
    const alertMap = {
      'workorder.cancelled':       { type: 'provider_cancelled',  title: `WO Cancelled: ${site.code} — ${site.branch_name}` },
      'workorder.counter_offer':   { type: 'payment_flag',        title: `Counter offer on: ${site.code} — ${site.branch_name}` },
      'workorder.provider_removed':{ type: 'unstaffed_approaching', title: `Tech removed from: ${site.code} — ${site.branch_name}` },
      'workorder.approved':        { type: 'site_completed',      title: `Site completed: ${site.code} — ${site.branch_name}` },
    }

    const alertDef = alertMap[eventType]
    if (alertDef) {
      await supabase.from('alert_log').insert({
        alert_type: alertDef.type,
        site_id:    site.id,
        title:      alertDef.title,
        detail:     `FN webhook: ${eventType} — WO ${woId}`,
      })
    }

    return res.json({ ok: true, site_id: site.id, updates })

  } catch (err) {
    console.error('[FN Webhook]', err)
    // Return 200 so FN doesn't keep retrying — log the error internally
    return res.json({ ok: false, message: err.message })
  }
}
