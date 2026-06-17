/**
 * POST /api/comms/blast-confirmations
 * Body: { project_id, template_key?, days_ahead?, sent_by? }
 */

import { query } from '../_lib/db.js'

function mergeTemplate(body, vars) {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try { return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }
  catch { return dateStr }
}

function normalizePhone(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  if (digits.length > 11) return `+${digits}`
  return null
}

function getBaseUrl(req) {
  return `${req.headers['x-forwarded-proto'] ?? 'https'}://${req.headers.host}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { project_id, template_key = 'site_confirmation', days_ahead = 14, sent_by } = req.body ?? {}
  if (!project_id) return res.status(400).json({ message: 'project_id required' })

  const { rows: [template] } = await query(
    'SELECT * FROM message_templates WHERE key = $1 LIMIT 1',
    [template_key]
  )
  if (!template) return res.status(404).json({ message: `Template "${template_key}" not found` })

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + days_ahead)
  const today   = new Date().toISOString().split('T')[0]
  const cutoffS = cutoff.toISOString().split('T')[0]

  const { rows: sites } = await query(
    `SELECT id, code, branch_name, address, city, state, zip, scheduled_start, onsite_tech, onsite_phone
     FROM sites
     WHERE project_id = $1
       AND onsite_phone IS NOT NULL
       AND onsite_tech  IS NOT NULL
       AND scheduled_start IS NOT NULL
       AND status IN ('scheduled','staffed','in_progress')
       AND scheduled_start <= $2
       AND scheduled_start >= $3`,
    [project_id, cutoffS, today]
  )

  if (!sites.length) {
    return res.json({ ok: true, sent: 0, skipped: 0, message: 'No eligible sites with tech phones found for that date range.' })
  }

  const siteIds = sites.map(s => s.id)
  const { rows: existingConfs } = await query(
    "SELECT site_id, tech_phone, status FROM tech_confirmations WHERE site_id = ANY($1) AND status IN ('pending','confirmed')",
    [siteIds]
  )
  const alreadySent = new Set(existingConfs.map(c => `${c.site_id}-${c.tech_phone}`))

  let sent = 0, skipped = 0, failed = 0
  const details = []

  for (const site of sites) {
    const techNames  = (site.onsite_tech  ?? '').split(',').map(t => t.trim()).filter(Boolean)
    const techPhones = (site.onsite_phone ?? '').split(',').map(p => p.trim()).filter(Boolean)

    for (let i = 0; i < techNames.length; i++) {
      const techName = techNames[i]
      const phone    = normalizePhone(techPhones[i] ?? techPhones[0])
      if (!phone) { skipped++; continue }

      const key = `${site.id}-${phone}`
      if (alreadySent.has(key)) { skipped++; continue }

      const msgBody = mergeTemplate(template.body, {
        tech_name: techName,
        site_name: site.branch_name ?? site.code,
        address:   site.address ?? '',
        city:      site.city ?? '',
        state:     site.state ?? '',
        zip:       site.zip ?? '',
        date:      formatDate(site.scheduled_start),
        time:      '8:00 AM',
      })

      const sendRes = await fetch(`${getBaseUrl(req)}/api/comms/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: site.id, recipients: [{ name: techName, phone }], body: msgBody, template_key, sent_by, schedule_confirmation: true }),
      })
      const sendData = await sendRes.json()

      if (sendData.sent > 0) {
        sent++; alreadySent.add(key)
        details.push({ site: site.code, tech: techName, phone, status: 'sent' })
      } else {
        failed++
        details.push({ site: site.code, tech: techName, phone, status: 'failed', error: sendData.errors?.[0]?.error })
      }

      await new Promise(r => setTimeout(r, 150))
    }
  }

  return res.json({
    ok: true, sent, skipped, failed, total: sites.length,
    message: `Sent ${sent} confirmation${sent !== 1 ? 's' : ''}, skipped ${skipped} (already sent/confirmed), ${failed} failed.`,
    details,
  })
}
