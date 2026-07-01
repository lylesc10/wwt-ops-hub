/**
 * POST /api/credentials/test
 * Body: { service }
 *
 * Loads stored credentials for the service, decodes them,
 * makes a lightweight live API call to verify they work,
 * and updates test_status in the DB.
 *
 * Admin only.
 */

import { withSecurity, requireAuth } from '../_lib/middleware.js'
import { supa as supabase } from '../../_lib/db.js'


// ── Decode helpers ──────────────────────────────────────────────────────────

function parseCreds(encrypted_data) {
  if (!encrypted_data) return null
  // Try base64 decode first (standard storage)
  try {
    const raw = Buffer.from(String(encrypted_data), 'base64').toString('utf-8')
    return JSON.parse(raw)
  } catch {}
  // Try direct JSON (legacy)
  try { return JSON.parse(String(encrypted_data)) } catch {}
  return null
}

async function loadCreds(service) {
  const { data, error } = await supabase
    .from('credentials')
    .select('encrypted_data, is_active')
    .eq('service', service)
    .single()

  if (error || !data?.encrypted_data) return null

  try {
    return parseCreds(data.encrypted_data)
  } catch {
    return null
  }
}

// ── Per-service test functions ──────────────────────────────────────────────

async function testSmartsheet(creds) {
  const res = await fetch('https://api.smartsheet.com/2.0/users/me', {
    headers: { Authorization: `Bearer ${creds.access_token}` },
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d.message ?? `HTTP ${res.status}`)
  }
  const user = await res.json()
  return `Connected as ${user.email ?? user.firstName + ' ' + user.lastName}`
}

async function testFieldNation(creds) {
  const isSandbox = creds.environment === 'sandbox'
  const authUrl   = isSandbox
    ? 'https://auth.fndev.net/oauth/token'
    : 'https://auth.fieldnation.com/oauth/token'

  const tokenRes = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     creds.client_id,
      client_secret: creds.client_secret,
      scope:         'read write',
    }),
  })
  if (!tokenRes.ok) {
    const txt = await tokenRes.text().catch(() => '')
    throw new Error(`OAuth failed (${tokenRes.status}): ${txt.slice(0, 200)}`)
  }
  const token = await tokenRes.json()
  if (!token.access_token) throw new Error('No access token returned')
  return `${isSandbox ? '[SANDBOX] ' : ''}OAuth token obtained — expires in ${token.expires_in}s`
}

async function testResend(creds) {
  const res = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${creds.api_key}` },
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d.message ?? `HTTP ${res.status}`)
  }
  const data = await res.json()
  return `Connected — ${data.data?.length ?? 0} domain(s) configured`
}

async function testTwilio(creds) {
  const auth = Buffer.from(`${creds.account_sid}:${creds.auth_token}`).toString('base64')
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}.json`,
    { headers: { Authorization: `Basic ${auth}` } }
  )
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d.message ?? `HTTP ${res.status}`)
  }
  const account = await res.json()
  return `Connected — Account: ${account.friendly_name}`
}

const TESTERS = {
  smartsheet:  testSmartsheet,
  fieldnation: testFieldNation,
  resend:      testResend,
  twilio:      testTwilio,
}

// ── Handler ─────────────────────────────────────────────────────────────────

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { service } = req.body ?? {}
  if (!service) return res.status(400).json({ message: 'service is required' })

  const tester = TESTERS[service]
  if (!tester) return res.status(400).json({ message: `Unknown service: ${service}` })

  const creds = await loadCreds(service)
  if (!creds) {
    return res.status(400).json({ message: 'No credentials stored for this service' })
  }

  let status, message

  try {
    message = await tester(creds)
    status = 'ok'
  } catch (err) {
    message = err.message
    status = 'error'
  }

  // Update test result in DB
  await supabase.from('credentials').update({
    test_status:  status,
    test_message: message,
    last_tested:  new Date().toISOString(),
  }).eq('service', service)

  return res.json({ ok: status === 'ok', service, status, message })
}

export default withSecurity(requireAuth(handler))
