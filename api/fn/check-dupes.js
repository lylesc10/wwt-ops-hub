/**
 * POST /api/fn/check-dupes
 * Body: { site_codes: string[], fn_project_id?: string }
 * Returns: { results: { [code]: { exists, wo_id?, status?, title?, url? } } }
 */
import { createClient } from '@supabase/supabase-js'
import { fnFetch } from './auth.js'
import { withSecurity, requireAuth } from '../_lib/middleware.js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  const { site_codes = [], fn_project_id } = req.body ?? {}
  if (!site_codes.length) return res.json({ results: {} })

  let creds
  try { creds = await getFNCredentials() }
  catch { return res.status(400).json({ message: 'FieldNation credentials not configured. Add them in Settings → API & Webhooks.' }) }

  const results = {}
  for (let i = 0; i < site_codes.length; i += 10) {
    const batch = site_codes.slice(i, i + 10)
    await Promise.all(batch.map(async (code) => {
      try {
        const params = new URLSearchParams({ search: code, ...(fn_project_id ? { project: fn_project_id } : {}), page: 1, per_page: 5 })
        const fnRes = await fnFetch(`/workorders?${params}`, {}, creds)
        if (!fnRes.ok) { results[code] = { exists: false, error: `FN ${fnRes.status}` }; return }
        const data = await fnRes.json()
        const match = (data?.results ?? []).find(wo => (wo.site_id ?? '').includes(code) || (wo.title ?? '').includes(code))
        results[code] = match
          ? { exists: true, wo_id: match.id, status: match.status?.name ?? match.status, title: match.title, url: `https://app.fieldnation.com/workorders/${match.id}` }
          : { exists: false }
      } catch (e) { results[code] = { exists: false, error: e.message } }
    }))
  }
  return res.json({ results })
}


// Reads FN credentials from the `credentials` table (migration 003+)
async function getFNCredentials() {
  if (process.env.FN_CLIENT_ID) {
    return {
      clientId:     process.env.FN_CLIENT_ID,
      clientSecret: process.env.FN_CLIENT_SECRET,
      username:     process.env.FN_USERNAME,
      password:     process.env.FN_PASSWORD,
      baseUrl:      process.env.FN_BASE_URL || 'sandbox',
    }
  }
  const { data, error } = await supabase
    .from('credentials')
    .select('encrypted_data, is_active')
    .eq('service', 'fieldnation')
    .single()
  if (error || !data?.encrypted_data) throw new Error('FN credentials not configured. Add them in Settings → API & Webhooks.')
  const creds = parseFNCreds(data.encrypted_data)
  if (!creds?.client_id || !creds?.client_secret) throw new Error('Incomplete FN credentials stored.')
  if (!creds?.username || !creds?.password) throw new Error('FN username and password required. Re-save in Settings → API & Webhooks → FieldNation.')
  const isSandbox = !creds.environment || creds.environment === 'sandbox'
  return {
    clientId:     creds.client_id,
    clientSecret: creds.client_secret,
    username:     creds.username,
    password:     creds.password,
    baseUrl:      isSandbox ? 'sandbox' : 'prod',
  }
}

function parseFNCreds(encrypted_data) {
  try { return JSON.parse(Buffer.from(String(encrypted_data), 'base64').toString('utf-8')) } catch {}
  try { return JSON.parse(String(encrypted_data)) } catch {}
  return null
}

export default withSecurity(requireAuth(handler, 'pm'))
