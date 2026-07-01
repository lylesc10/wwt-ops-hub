import { supa as supabase } from '../../_lib/db.js'
/**
 * POST /api/comms/send-sms
 * Body: {
 *   site_id: string,
 *   recipients: [{ name, phone }],   // one or many
 *   body: string,                     // message text (after template merge)
 *   template_key?: string,
 *   sent_by?: string,                 // user ID
 *   schedule_confirmation?: boolean,  // if true, create a confirmation record
 * }
 */



const TWILIO_SID    = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN  = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM   = process.env.TWILIO_FROM_NUMBER

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


export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const {
    site_id, recipients = [], body,
    template_key, sent_by,
    schedule_confirmation = false,
  } = req.body ?? {}

  if (!body?.trim())       return res.status(400).json({ message: 'Message body required' })
  if (!recipients.length)  return res.status(400).json({ message: 'At least one recipient required' })

  // Get Twilio creds from DB if not in env
  let twilioSid = TWILIO_SID, twilioToken = TWILIO_TOKEN, twilioFrom = TWILIO_FROM

  if (!twilioSid) {
    // Read from encrypted credentials table
    const { data: creds } = await supabase
      .from('credentials')
      .select('encrypted_data')
      .eq('service', 'twilio')
      .single()

    if (creds?.encrypted_data) {
      try {
        const parsed = parseCreds(creds.encrypted_data)
        twilioSid   = parsed.account_sid
        twilioToken = parsed.auth_token
        twilioFrom  = parsed.from_number
      } catch (e) {
        console.error('[SMS] Failed to parse credentials:', e.message)
      }
    }
  }

  const results = []
  const errors  = []

  for (const recipient of recipients) {
    const phone = normalizePhone(recipient.phone)
    if (!phone) {
      errors.push({ recipient: recipient.name, error: 'Invalid or missing phone number' })
      continue
    }

    let twilioSid_result = null
    let status           = 'sent'
    let errorMessage     = null

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
            body: new URLSearchParams({
              To:   phone,
              From: twilioFrom,
              Body: body,
            }),
          }
        )

        const twilioData = await twilioRes.json()

        if (!twilioRes.ok || twilioData.status === 'failed') {
          status       = 'failed'
          errorMessage = twilioData.message ?? twilioData.error_message ?? 'Twilio error'
          errors.push({ recipient: recipient.name, phone, error: errorMessage })
        } else {
          twilioSid_result = twilioData.sid
          status           = twilioData.status ?? 'sent'
        }
      } catch (e) {
        status       = 'failed'
        errorMessage = e.message
        errors.push({ recipient: recipient.name, phone, error: e.message })
      }
    
    // Log to Supabase
    const { data: msg } = await supabase
      .from('tech_messages')
      .insert({
        site_id,
        project_id:   null, // filled by trigger if needed
        channel:      'sms',
        direction:    'outbound',
        to_number:    phone,
        to_name:      recipient.name,
        body,
        status,
        twilio_sid:   twilioSid_result,
        template_key: template_key ?? null,
        error_message: errorMessage,
        sent_by:      sent_by ?? null,
        sent_at:      new Date().toISOString(),
      })
      .select()
      .single()

    results.push({ recipient: recipient.name, phone, status, message_id: msg?.id, twilio_sid: twilioSid_result })

    // Create confirmation record if requested
    if (schedule_confirmation && msg?.id && status !== 'failed') {
      await supabase.from('tech_confirmations').insert({
        site_id,
        tech_name:  recipient.name,
        tech_phone: phone,
        status:     'pending',
        message_id: msg.id,
        confirmation_type: 'site_visit',
      })
    }
  }

  return res.json({
    ok:      errors.length < recipients.length,
    mock:    MOCK || !twilioSid,
    sent:    results.filter(r => r.status !== 'failed').length,
    failed:  errors.length,
    results,
    errors:  errors.length ? errors : undefined,
  })
}

function normalizePhone(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  if (digits.length > 11) return `+${digits}` // international
  return null
}
