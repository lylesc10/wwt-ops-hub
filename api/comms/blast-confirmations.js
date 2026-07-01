import { supa as supabase } from '../../_lib/db.js'
/**
 * POST /api/comms/blast-confirmations
 * Body: {
 *   project_id: string,
 *   template_key: string,       // e.g. 'site_confirmation'
 *   days_ahead?: number,        // only sites starting in next N days (default: 14)
 *   sent_by?: string,
 * }
 *
 * Sends confirmation SMS to all techs on sites that:
 *   - Have a scheduled start date within days_ahead
 *   - Have onsite_tech and onsite_phone set
 *   - Don't already have a pending/confirmed confirmation
 */



function mergeTemplate(body, vars) {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  } catch { return dateStr }
}

function normalizePhone(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  if (digits.length > 11) return `+${digits}`
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const {
    project_id,
    template_key = 'site_confirmation',
    days_ahead   = 14,
    sent_by,
  } = req.body ?? {}

  if (!project_id) return res.status(400).json({ message: 'project_id required' })

  // Load template
  const { data: template } = await supabase
    .from('message_templates')
    .select('*')
    .eq('key', template_key)
    .single()

  if (!template) return res.status(404).json({ message: `Template "${template_key}" not found` })

  // Load sites with techs and phones that are coming up
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + days_ahead)

  const { data: sites } = await supabase
    .from('sites')
    .select('id, code, branch_name, address, city, state, zip, scheduled_start, scheduled_end, onsite_tech, onsite_phone, time_zone')
    .eq('project_id', project_id)
    .not('onsite_phone', 'is', null)
    .not('onsite_tech',  'is', null)
    .not('scheduled_start', 'is', null)
    .in('status', ['scheduled', 'staffed', 'in_progress'])
    .lte('scheduled_start', cutoff.toISOString().split('T')[0])
    .gte('scheduled_start', new Date().toISOString().split('T')[0])

  if (!sites?.length) {
    return res.json({ ok: true, sent: 0, skipped: 0, message: 'No eligible sites with tech phones found for that date range.' })
  }

  // Load existing confirmations to avoid dupes
  const siteIds = sites.map(s => s.id)
  const { data: existingConfs } = await supabase
    .from('tech_confirmations')
    .select('site_id, tech_phone, status')
    .in('site_id', siteIds)
    .in('status', ['pending', 'confirmed'])

  const alreadySent = new Set(existingConfs?.map(c => `${c.site_id}-${c.tech_phone}`) ?? [])

  let sent = 0, skipped = 0, failed = 0
  const details = []

  for (const site of sites) {
    // Parse comma-separated techs and phones
    const techNames  = (site.onsite_tech  ?? '').split(',').map(t => t.trim()).filter(Boolean)
    const techPhones = (site.onsite_phone ?? '').split(',').map(p => p.trim()).filter(Boolean)

    for (let i = 0; i < techNames.length; i++) {
      const techName  = techNames[i]
      const rawPhone  = techPhones[i] ?? techPhones[0] // fallback to first phone if not enough
      const phone     = normalizePhone(rawPhone)

      if (!phone) { skipped++; continue }

      const key = `${site.id}-${phone}`
      if (alreadySent.has(key)) { skipped++; continue }

      // Build message body from template
      const msgBody = mergeTemplate(template.body, {
        tech_name:  techName,
        site_name:  site.branch_name ?? site.code,
        address:    site.address ?? '',
        city:       site.city ?? '',
        state:      site.state ?? '',
        zip:        site.zip ?? '',
        date:       formatDate(site.scheduled_start),
        time:       '8:00 AM', // default — could be pulled from WO
      })

      // Send via /api/comms/send-sms internally
      const sendRes = await fetch(`${getBaseUrl(req)}/api/comms/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id:                 site.id,
          recipients:              [{ name: techName, phone }],
          body:                    msgBody,
          template_key,
          sent_by,
          schedule_confirmation:   true,
        }),
      })

      const sendData = await sendRes.json()

      if (sendData.sent > 0) {
        sent++
        alreadySent.add(key)
        details.push({ site: site.code, tech: techName, phone, status: 'sent' })
      } else {
        failed++
        details.push({ site: site.code, tech: techName, phone, status: 'failed', error: sendData.errors?.[0]?.error })
      }

      // Small delay to avoid hammering Twilio
      await new Promise(r => setTimeout(r, 150))
    }
  }

  return res.json({
    ok:      true,
    sent,
    skipped,
    failed,
    total:   sites.length,
    message: `Sent ${sent} confirmation${sent !== 1 ? 's' : ''}, skipped ${skipped} (already sent/confirmed), ${failed} failed.`,
    details,
  })
}

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] ?? 'https'
  const host  = req.headers.host
  return `${proto}://${host}`
}
