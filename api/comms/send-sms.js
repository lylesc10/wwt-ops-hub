/**
 * POST /api/comms/send-sms
 * Body: {
 *   site_id, recipients: [{ name, phone }],
 *   body, template_key?, sent_by?, schedule_confirmation?
 * }
 */

import { query } from '../_lib/db.js'
import { getTwilioCreds } from '../_lib/credentials.js'

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
    site_id, recipients = [], body,
    template_key, sent_by,
    schedule_confirmation = false,
  } = req.body ?? {}

  if (!body?.trim())       return res.status(400).json({ message: 'Message body required' })
  if (!recipients.length)  return res.status(400).json({ message: 'At least one recipient required' })

  const twilio = await getTwilioCreds()
  const twilioSid   = twilio?.account_sid
  const twilioToken = twilio?.auth_token
  const twilioFrom  = twilio?.from_number

  const results = [], errors = []

  for (const recipient of recipients) {
    const phone = normalizePhone(recipient.phone)
    if (!phone) { errors.push({ recipient: recipient.name, error: 'Invalid or missing phone number' }); continue }

    let twilioSidResult = null
    let status          = 'sent'
    let errorMessage    = null

    if (!twilioSid) {
      errors.push({ recipient: recipient.name, phone, error: 'Twilio not configured — add credentials in Settings → API' })
      continue
    }
    try {
      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: phone, From: twilioFrom, Body: body }),
        }
      )
      const twilioData = await twilioRes.json()
      if (!twilioRes.ok || twilioData.status === 'failed') {
        status       = 'failed'
        errorMessage = twilioData.message ?? twilioData.error_message ?? 'Twilio error'
        errors.push({ recipient: recipient.name, phone, error: errorMessage })
      } else {
        twilioSidResult = twilioData.sid
        status          = twilioData.status ?? 'sent'
      }
    } catch (e) {
      status = 'failed'; errorMessage = e.message
      errors.push({ recipient: recipient.name, phone, error: e.message })
    }

    const { rows: [msg] } = await query(
      'INSERT INTO tech_messages (site_id, channel, direction, to_number, to_name, body, status, twilio_sid, template_key, error_message, sent_by, sent_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id',
      [site_id, 'sms', 'outbound', phone, recipient.name, body, status, twilioSidResult, template_key ?? null, errorMessage, sent_by ?? null, new Date().toISOString()]
    )

    results.push({ recipient: recipient.name, phone, status, message_id: msg?.id, twilio_sid: twilioSidResult })

    if (schedule_confirmation && msg?.id && status !== 'failed') {
      await query(
        "INSERT INTO tech_confirmations (site_id, tech_name, tech_phone, status, message_id, confirmation_type) VALUES ($1, $2, $3, 'pending', $4, 'site_visit')",
        [site_id, recipient.name, phone, msg.id]
      )
    }
  }

  return res.json({
    ok:      errors.length < recipients.length,
    mock:    !twilioSid,
    sent:    results.filter(r => r.status !== 'failed').length,
    failed:  errors.length,
    results,
    errors:  errors.length ? errors : undefined,
  })
}
