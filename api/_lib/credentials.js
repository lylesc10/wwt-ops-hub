/**
 * Shared credential helpers for api/ handlers.
 * Reads from env vars first, then falls back to the credentials table.
 */

import { query } from './db.js'

export function parseCreds(encrypted_data) {
  if (!encrypted_data) return null
  try { return JSON.parse(Buffer.from(String(encrypted_data), 'base64').toString('utf-8')) } catch {}
  try { return JSON.parse(String(encrypted_data)) } catch {}
  return null
}

export async function getFNCredentials() {
  if (process.env.FN_CLIENT_ID) {
    return {
      clientId:     process.env.FN_CLIENT_ID,
      clientSecret: process.env.FN_CLIENT_SECRET,
      username:     process.env.FN_USERNAME,
      password:     process.env.FN_PASSWORD,
      baseUrl:      process.env.FN_BASE_URL || 'sandbox',
    }
  }
  const { rows } = await query(
    "SELECT encrypted_data FROM credentials WHERE service = 'fieldnation' LIMIT 1"
  )
  const row = rows[0]
  if (!row?.encrypted_data) throw new Error('FN credentials not configured. Add them in Settings → API & Webhooks.')
  const creds = parseCreds(row.encrypted_data)
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

export async function getSSToken() {
  if (process.env.SMARTSHEET_ACCESS_TOKEN) return process.env.SMARTSHEET_ACCESS_TOKEN
  const { rows } = await query(
    "SELECT encrypted_data FROM credentials WHERE service = 'smartsheet' LIMIT 1"
  )
  const row = rows[0]
  if (!row?.encrypted_data) throw new Error('Smartsheet token not configured. Add it in Settings → API & Webhooks.')
  const parsed = parseCreds(row.encrypted_data)
  if (!parsed?.access_token) throw new Error('Failed to read Smartsheet credentials')
  return parsed.access_token
}

export async function getTwilioCreds() {
  if (process.env.TWILIO_ACCOUNT_SID) {
    return {
      account_sid: process.env.TWILIO_ACCOUNT_SID,
      auth_token:  process.env.TWILIO_AUTH_TOKEN,
      from_number: process.env.TWILIO_FROM_NUMBER,
    }
  }
  const { rows } = await query(
    "SELECT encrypted_data FROM credentials WHERE service = 'twilio' LIMIT 1"
  )
  const row = rows[0]
  if (!row?.encrypted_data) return null
  return parseCreds(row.encrypted_data)
}

export async function getCredsByService(service) {
  const { rows } = await query(
    'SELECT encrypted_data, is_active FROM credentials WHERE service = $1 LIMIT 1',
    [service]
  )
  const row = rows[0]
  if (!row?.encrypted_data) return null
  return parseCreds(row.encrypted_data)
}
