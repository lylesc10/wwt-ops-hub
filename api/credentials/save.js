import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../_lib/middleware.js'

const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

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
  const { data: existing } = await supabase.from('credentials').select('id').eq('service',service).single()
  let dbError
  if (existing) {
    const { error } = await supabase.from('credentials').update({ encrypted_data:encoded, is_active:true, test_status:'untested', test_message:null, updated_at:new Date().toISOString() }).eq('service',service)
    dbError = error
  } else {
    const { error } = await supabase.from('credentials').insert({ service, label:service, encrypted_data:encoded, is_active:true, test_status:'untested' })
    dbError = error
  }
  if (dbError) { console.error('[Credentials] DB error:', dbError); return res.status(500).json({ message: dbError.message }) }
  return res.json({ ok:true, service })
}

export default requireAuth(handler)
