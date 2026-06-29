import { query } from '../_lib/db.js'
import { requireAuth } from '../_lib/middleware.js'

const SERVICE_FIELDS = {
  smartsheet:  ['access_token'],
  fieldnation: ['client_id', 'client_secret', 'environment'],
  resend:      ['api_key', 'from_address'],
  twilio:      ['account_sid', 'auth_token', 'from_number'],
}
const OPTIONAL = ['base_url','environment','from_address','webhook_secret']

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  const { service, data } = req.body ?? {}
  if (!service || !data) return res.status(400).json({ message: 'service and data are required' })
  const allowedFields = SERVICE_FIELDS[service]
  if (!allowedFields) return res.status(400).json({ message: `Unknown service: ${service}` })
  const missing = allowedFields.filter(f => !OPTIONAL.includes(f) && !String(data[f]??'').trim())
  if (missing.length) return res.status(400).json({ message: `Missing required fields: ${missing.join(', ')}` })
  const sanitized = {}
  for (const f of allowedFields) { const v = String(data[f]??'').trim(); sanitized[f] = v || null }
  const encoded = Buffer.from(JSON.stringify(sanitized)).toString('base64')

  const { rows: existing } = await query('SELECT id FROM credentials WHERE service = $1 LIMIT 1', [service])
  let dbErr = null
  if (existing.length) {
    const res2 = await query(
      "UPDATE credentials SET encrypted_data = $1, is_active = true, test_status = 'untested', test_message = NULL, updated_at = $2 WHERE service = $3",
      [encoded, new Date().toISOString(), service]
    ).catch(e => ({ error: e }))
    dbErr = res2?.error
  } else {
    const res2 = await query(
      "INSERT INTO credentials (service, label, encrypted_data, is_active, test_status) VALUES ($1, $1, $2, true, 'untested')",
      [service, encoded]
    ).catch(e => ({ error: e }))
    dbErr = res2?.error
  }
  if (dbErr) { console.error('[Credentials] DB error:', dbErr); return res.status(500).json({ message: dbErr.message }) }
  return res.json({ ok:true, service })
}

export default requireAuth(handler)
