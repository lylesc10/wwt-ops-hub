/**
 * /api/notify/send.js
 *
 * POST /api/notify/send
 * Body: { alert_id, user_ids? }
 *
 * Sends email via Resend and/or SMS via Twilio based on each
 * user's notification_prefs. Called by Supabase edge functions
 * after alerts are created.
 *
 * Required env vars:
 *   RESEND_API_KEY      — from resend.com
 *   RESEND_FROM         — e.g. "OPS Hub <alerts@yourdomain.com>"
 *   TWILIO_ACCOUNT_SID  — from twilio.com console
 *   TWILIO_AUTH_TOKEN   — from twilio.com console
 *   TWILIO_FROM_NUMBER  — E.164 e.g. +18135550100
 */

import { withSecurity, requireAuth } from '../_lib/middleware.js'
import { supa as supabase } from '../../_lib/db.js'


const RESEND_KEY     = process.env.RESEND_API_KEY
const RESEND_FROM    = process.env.RESEND_FROM || 'OPS Hub <alerts@opsnotify.com>'
const TWILIO_SID     = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN   = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM    = process.env.TWILIO_FROM_NUMBER

// ── Alert type → human label ──────────────────────────────────
const ALERT_LABELS = {
  date_change:           'Date Change Detected',
  provider_cancelled:    'Provider Cancelled',
  unstaffed_approaching: 'Site Unstaffed — Approaching Date',
  payment_flag:          'Payment Flag Raised',
  site_added:            'New Site Added',
  site_removed:          'Site Removed',
}

// ── Email templates ───────────────────────────────────────────
function buildEmailHtml(alert, site) {
  const siteStr = site ? `<strong>${site.code}</strong> — ${site.branch_name}` : ''
  const color = alert.alert_type === 'provider_cancelled' ? '#ef4444'
    : alert.alert_type === 'date_change' ? '#a855f7'
    : alert.alert_type === 'unstaffed_approaching' ? '#f59e0b'
    : '#3b82f6'

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#0d0f12;font-family:'Segoe UI',sans-serif;color:#e8eaf0;padding:0">
  <div style="max-width:560px;margin:32px auto;background:#13161b;border:1px solid #252a34;border-top:3px solid ${color};border-radius:8px;overflow:hidden">
    <div style="padding:24px 28px 20px">
      <p style="margin:0 0 4px;font-size:10px;font-family:monospace;color:#555e6e;letter-spacing:0.08em;text-transform:uppercase">John Rhodes OPS Hub</p>
      <h1 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#e8eaf0">${ALERT_LABELS[alert.alert_type] ?? alert.alert_type}</h1>
      <div style="background:#1a1e25;border:1px solid #252a34;border-left:3px solid ${color};border-radius:4px;padding:14px 16px;margin-bottom:16px">
        <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#e8eaf0">${alert.title}</p>
        ${alert.detail ? `<p style="margin:0;font-size:13px;color:#8b93a5">${alert.detail}</p>` : ''}
        ${siteStr ? `<p style="margin:8px 0 0;font-size:11px;font-family:monospace;color:#555e6e">${siteStr}</p>` : ''}
      </div>
      <p style="margin:0;font-size:12px;color:#555e6e">Log in to OPS Hub to acknowledge or resolve this alert.</p>
    </div>
    <div style="padding:14px 28px;border-top:1px solid #1d2028;background:#0d0f12">
      <p style="margin:0;font-size:11px;font-family:monospace;color:#555e6e">John Rhodes OPS Hub · Field Services · ${new Date().toLocaleDateString()}</p>
    </div>
  </div>
</body>
</html>`
}

function buildSmsText(alert, site) {
  const label = ALERT_LABELS[alert.alert_type] ?? alert.alert_type
  const siteStr = site ? ` | ${site.code} ${site.branch_name}` : ''
  return `OPS Hub: ${label}${siteStr} — ${alert.title}`
}

// ── Send email via Resend ─────────────────────────────────────
async function sendEmail(to, subject, html) {
  if (!RESEND_KEY) {
    console.log('[Notify] Resend not configured — skipping email to', to)
    return { skipped: true }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? `Resend error ${res.status}`)
  return { id: data.id }
}

// ── Send SMS via Twilio ───────────────────────────────────────
async function sendSMS(to, body) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.log('[Notify] Twilio not configured — skipping SMS to', to)
    return { skipped: true }
  }

  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }),
    }
  )

  const data = await res.json()
  if (res.status >= 400) throw new Error(data.message ?? `Twilio error ${res.status}`)
  return { sid: data.sid }
}

// ── Main handler ──────────────────────────────────────────────
async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { alert_id, user_ids } = req.body ?? {}

  if (!alert_id) {
    return res.status(400).json({ message: 'alert_id required' })
  }

  try {
    // Load alert
    const { data: alert, error: alertErr } = await supabase
      .from('alert_log')
      .select('*, site:sites(code, branch_name)')
      .eq('id', alert_id)
      .single()

    if (alertErr || !alert) {
      return res.status(404).json({ message: 'Alert not found' })
    }

    // Load users to notify
    let query = supabase
      .from('notification_prefs')
      .select('*, user:users(id, email, full_name)')
      .eq('email_enabled', true)

    if (user_ids?.length) {
      query = query.in('user_id', user_ids)
    }

    const { data: prefs } = await query
    const results = []

    for (const pref of prefs ?? []) {
      const user = pref.user
      if (!user?.email) continue

      const alertType = alert.alert_type
      const emailKey  = `email_${alertType}`
      const smsKey    = `sms_${alertType}`

      // Email
      if (pref.email_enabled && pref[emailKey]) {
        try {
          const subject = `OPS Hub: ${ALERT_LABELS[alertType] ?? alertType}`
          const result = await sendEmail(
            user.email,
            subject,
            buildEmailHtml(alert, alert.site)
          )

          await supabase.from('notification_log').insert({
            user_id:     user.id,
            alert_id:    alert.id,
            channel:     'email',
            status:      result.skipped ? 'skipped' : 'sent',
            provider_id: result.id ?? null,
          })

          results.push({ user: user.email, channel: 'email', status: result.skipped ? 'skipped' : 'sent' })
        } catch (err) {
          await supabase.from('notification_log').insert({
            user_id: user.id, alert_id: alert.id, channel: 'email', status: 'failed', error: err.message,
          })
          results.push({ user: user.email, channel: 'email', status: 'failed', error: err.message })
        }
      }

      // SMS
      if (pref.sms_enabled && pref.phone && pref[smsKey]) {
        try {
          const result = await sendSMS(pref.phone, buildSmsText(alert, alert.site))

          await supabase.from('notification_log').insert({
            user_id:     user.id,
            alert_id:    alert.id,
            channel:     'sms',
            status:      result.skipped ? 'skipped' : 'sent',
            provider_id: result.sid ?? null,
          })

          results.push({ user: user.email, channel: 'sms', status: result.skipped ? 'skipped' : 'sent' })
        } catch (err) {
          await supabase.from('notification_log').insert({
            user_id: user.id, alert_id: alert.id, channel: 'sms', status: 'failed', error: err.message,
          })
          results.push({ user: user.email, channel: 'sms', status: 'failed', error: err.message })
        }
      }
    }

    return res.json({ ok: true, alert_id, notifications: results })
  } catch (err) {
    console.error('[Notify] Error:', err)
    return res.status(500).json({ message: err.message })
  }
}

export default withSecurity(requireAuth(handler, 'pm'))
