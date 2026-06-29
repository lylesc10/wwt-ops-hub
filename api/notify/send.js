/**
 * POST /api/notify/send
 * Body: { alert_id, user_ids? }
 *
 * Sends email via Resend and/or SMS via Twilio based on each user's notification_prefs.
 */

import { query } from '../_lib/db.js'
import { withSecurity, requireAuth } from '../_lib/middleware.js'

const RESEND_KEY  = process.env.RESEND_API_KEY
const RESEND_FROM = process.env.RESEND_FROM || 'OPS Hub <alerts@opsnotify.com>'
const TWILIO_SID  = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN= process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER

const ALERT_LABELS = {
  date_change:           'Date Change Detected',
  provider_cancelled:    'Provider Cancelled',
  unstaffed_approaching: 'Site Unstaffed — Approaching Date',
  payment_flag:          'Payment Flag Raised',
  site_added:            'New Site Added',
  site_removed:          'Site Removed',
}

function buildEmailHtml(alert, site) {
  const siteStr = site ? `<strong>${site.code}</strong> — ${site.branch_name}` : ''
  const color = alert.alert_type === 'provider_cancelled' ? '#ef4444'
    : alert.alert_type === 'date_change' ? '#a855f7'
    : alert.alert_type === 'unstaffed_approaching' ? '#f59e0b'
    : '#3b82f6'
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#0d0f12;font-family:'Segoe UI',sans-serif;color:#e8eaf0;padding:0"><div style="max-width:560px;margin:32px auto;background:#13161b;border:1px solid #252a34;border-top:3px solid ${color};border-radius:8px;overflow:hidden"><div style="padding:24px 28px 20px"><p style="margin:0 0 4px;font-size:10px;font-family:monospace;color:#555e6e;letter-spacing:0.08em;text-transform:uppercase">WWT OPS Hub</p><h1 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#e8eaf0">${ALERT_LABELS[alert.alert_type] ?? alert.alert_type}</h1><div style="background:#1a1e25;border:1px solid #252a34;border-left:3px solid ${color};border-radius:4px;padding:14px 16px;margin-bottom:16px"><p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#e8eaf0">${alert.title}</p>${alert.detail ? `<p style="margin:0;font-size:13px;color:#8b93a5">${alert.detail}</p>` : ''}${siteStr ? `<p style="margin:8px 0 0;font-size:11px;font-family:monospace;color:#555e6e">${siteStr}</p>` : ''}</div><p style="margin:0;font-size:12px;color:#555e6e">Log in to OPS Hub to acknowledge or resolve this alert.</p></div><div style="padding:14px 28px;border-top:1px solid #1d2028;background:#0d0f12"><p style="margin:0;font-size:11px;font-family:monospace;color:#555e6e">WWT OPS Hub · Field Services · ${new Date().toLocaleDateString()}</p></div></div></body></html>`
}

function buildSmsText(alert, site) {
  const label   = ALERT_LABELS[alert.alert_type] ?? alert.alert_type
  const siteStr = site ? ` | ${site.code} ${site.branch_name}` : ''
  return `OPS Hub: ${label}${siteStr} — ${alert.title}`
}

async function sendEmail(to, subject, html) {
  if (!RESEND_KEY) { console.log('[Notify] Resend not configured — skipping email to', to); return { skipped: true } }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? `Resend error ${res.status}`)
  return { id: data.id }
}

async function sendSMS(to, body) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) { console.log('[Notify] Twilio not configured — skipping SMS to', to); return { skipped: true } }
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }),
  })
  const data = await res.json()
  if (res.status >= 400) throw new Error(data.message ?? `Twilio error ${res.status}`)
  return { sid: data.sid }
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { alert_id, user_ids } = req.body ?? {}
  if (!alert_id) return res.status(400).json({ message: 'alert_id required' })

  try {
    // Load alert + site
    const { rows: [alertRow] } = await query(
      'SELECT a.*, s.code, s.branch_name FROM alert_log a LEFT JOIN sites s ON s.id = a.site_id WHERE a.id = $1 LIMIT 1',
      [alert_id]
    )
    if (!alertRow) return res.status(404).json({ message: 'Alert not found' })
    const alert = alertRow
    const site  = alertRow.code ? { code: alertRow.code, branch_name: alertRow.branch_name } : null

    // Load users to notify
    let prefsQuery = 'SELECT np.*, u.id AS user_id2, u.email, u.full_name FROM notification_prefs np JOIN users u ON u.id = np.user_id WHERE np.email_enabled = true'
    const prefsParams = []
    if (user_ids?.length) { prefsQuery += ' AND np.user_id = ANY($1)'; prefsParams.push(user_ids) }
    const { rows: prefs } = await query(prefsQuery, prefsParams)

    const results = []

    for (const pref of prefs) {
      if (!pref.email) continue
      const alertType = alert.alert_type
      const emailKey  = `email_${alertType}`
      const smsKey    = `sms_${alertType}`

      if (pref.email_enabled && pref[emailKey]) {
        try {
          const result = await sendEmail(pref.email, `OPS Hub: ${ALERT_LABELS[alertType] ?? alertType}`, buildEmailHtml(alert, site))
          await query(
            "INSERT INTO notification_log (user_id, alert_id, channel, status, provider_id) VALUES ($1, $2, 'email', $3, $4)",
            [pref.user_id, alert.id, result.skipped ? 'skipped' : 'sent', result.id ?? null]
          )
          results.push({ user: pref.email, channel: 'email', status: result.skipped ? 'skipped' : 'sent' })
        } catch (err) {
          await query("INSERT INTO notification_log (user_id, alert_id, channel, status, error) VALUES ($1, $2, 'email', 'failed', $3)", [pref.user_id, alert.id, err.message])
          results.push({ user: pref.email, channel: 'email', status: 'failed', error: err.message })
        }
      }

      if (pref.sms_enabled && pref.phone && pref[smsKey]) {
        try {
          const result = await sendSMS(pref.phone, buildSmsText(alert, site))
          await query(
            "INSERT INTO notification_log (user_id, alert_id, channel, status, provider_id) VALUES ($1, $2, 'sms', $3, $4)",
            [pref.user_id, alert.id, result.skipped ? 'skipped' : 'sent', result.sid ?? null]
          )
          results.push({ user: pref.email, channel: 'sms', status: result.skipped ? 'skipped' : 'sent' })
        } catch (err) {
          await query("INSERT INTO notification_log (user_id, alert_id, channel, status, error) VALUES ($1, $2, 'sms', 'failed', $3)", [pref.user_id, alert.id, err.message])
          results.push({ user: pref.email, channel: 'sms', status: 'failed', error: err.message })
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
