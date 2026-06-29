/**
 * POST /api/credentials/test
 * Body: { service }
 *
 * Loads stored credentials, makes a live API call to verify, updates test_status.
 * Admin only.
 */

import { query } from '../_lib/db.js'
import { withSecurity, requireAuth } from '../_lib/middleware.js'
import { getCredsByService } from '../_lib/credentials.js'

async function testSmartsheet(creds) {
  const res = await fetch('https://api.smartsheet.com/2.0/users/me', {
    headers: { Authorization: `Bearer ${creds.access_token}` },
  })
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message ?? `HTTP ${res.status}`) }
  const user = await res.json()
  return `Connected as ${user.email ?? user.firstName + ' ' + user.lastName}`
}

async function testFieldNation(creds) {
  const isSandbox = creds.environment === 'sandbox'
  const authUrl   = isSandbox ? 'https://auth.fndev.net/oauth/token' : 'https://auth.fieldnation.com/oauth/token'
  const tokenRes  = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: creds.client_id, client_secret: creds.client_secret, scope: 'read write' }),
  })
  if (!tokenRes.ok) { const txt = await tokenRes.text().catch(() => ''); throw new Error(`OAuth failed (${tokenRes.status}): ${txt.slice(0,200)}`) }
  const token = await tokenRes.json()
  if (!token.access_token) throw new Error('No access token returned')
  return `${isSandbox ? '[SANDBOX] ' : ''}OAuth token obtained — expires in ${token.expires_in}s`
}

async function testResend(creds) {
  const res = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${creds.api_key}` } })
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message ?? `HTTP ${res.status}`) }
  const data = await res.json()
  return `Connected — ${data.data?.length ?? 0} domain(s) configured`
}

async function testTwilio(creds) {
  const auth = Buffer.from(`${creds.account_sid}:${creds.auth_token}`).toString('base64')
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}.json`, { headers: { Authorization: `Basic ${auth}` } })
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message ?? `HTTP ${res.status}`) }
  const account = await res.json()
  return `Connected — Account: ${account.friendly_name}`
}

const TESTERS = { smartsheet: testSmartsheet, fieldnation: testFieldNation, resend: testResend, twilio: testTwilio }

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { service } = req.body ?? {}
  if (!service) return res.status(400).json({ message: 'service is required' })

  const tester = TESTERS[service]
  if (!tester) return res.status(400).json({ message: `Unknown service: ${service}` })

  const creds = await getCredsByService(service)
  if (!creds) return res.status(400).json({ message: 'No credentials stored for this service' })

  let status, message
  try { message = await tester(creds); status = 'ok' }
  catch (err) { message = err.message; status = 'error' }

  await query(
    'UPDATE credentials SET test_status = $1, test_message = $2, last_tested = $3 WHERE service = $4',
    [status, message, new Date().toISOString(), service]
  )

  return res.json({ ok: status === 'ok', service, status, message })
}

export default withSecurity(requireAuth(handler))
