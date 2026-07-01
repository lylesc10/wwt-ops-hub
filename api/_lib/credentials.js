/**
 * Shared credential helpers — reads encrypted credentials from the DB.
 * Used by FN, Twilio, Smartsheet handlers.
 */

import { supa } from './db.js'

function decode(encrypted_data) {
  if (!encrypted_data) return null
  try { return JSON.parse(Buffer.from(String(encrypted_data), 'base64').toString('utf-8')) } catch {}
  try { return JSON.parse(String(encrypted_data)) } catch {}
  return null
}

async function getCredential(service) {
  const { data } = await supa
    .from('credentials')
    .select('encrypted_data, is_active')
    .eq('service', service)
    .single()
  return data ? decode(data.encrypted_data) : null
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
  const c = await getCredential('fieldnation')
  if (!c?.client_id)  throw new Error('FN credentials not configured. Add them in Settings → API & Webhooks.')
  if (!c?.username)   throw new Error('FN username/password required. Re-save in Settings → API & Webhooks → FieldNation.')
  return {
    clientId:     c.client_id,
    clientSecret: c.client_secret,
    username:     c.username,
    password:     c.password,
    baseUrl:      (!c.environment || c.environment === 'sandbox') ? 'sandbox' : 'prod',
  }
}

export async function getTwilioCreds() {
  if (process.env.TWILIO_ACCOUNT_SID) {
    return {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken:  process.env.TWILIO_AUTH_TOKEN,
      from:       process.env.TWILIO_FROM_NUMBER,
    }
  }
  const c = await getCredential('twilio')
  if (!c?.account_sid) return null
  return { accountSid: c.account_sid, authToken: c.auth_token, from: c.from_number }
}

export async function getSSToken() {
  if (process.env.SMARTSHEET_ACCESS_TOKEN) return process.env.SMARTSHEET_ACCESS_TOKEN
  const c = await getCredential('smartsheet')
  return c?.access_token ?? null
}
