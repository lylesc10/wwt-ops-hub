/**
 * POST /api/comms/sms-inbound
 * Twilio webhook — called when a tech replies to a message.
 */

import { URLSearchParams } from 'url'
import { query } from '../_lib/db.js'

const CONFIRM_WORDS = new Set(['yes','y','confirm','confirmed','ok','sure','yep','will do','on my way','omw'])
const DECLINE_WORDS = new Set(['no','n','cant','cannot','nope','decline','cancel','unable','no can do'])
const ETA_WORDS     = ['eta','leaving','otw','on the way','30','45','60','minutes','mins','hour']

function parseIntent(text) {
  const lower = text.toLowerCase().trim()
  if (CONFIRM_WORDS.has(lower))                  return 'confirmed'
  if (DECLINE_WORDS.has(lower))                  return 'declined'
  if (ETA_WORDS.some(w => lower.includes(w)))    return 'confirmed'
  if (/^\d+$/.test(lower.trim()))                return 'confirmed'
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  let body = req.body
  if (typeof body === 'string') { const params = new URLSearchParams(body); body = Object.fromEntries(params) }

  const fromNumber = body?.From ?? ''
  const msgBody    = body?.Body ?? ''
  const twilioSid  = body?.MessageSid ?? ''

  if (!fromNumber || !msgBody) return res.status(200).send('<Response></Response>')

  const normalized = fromNumber.replace(/\s/g, '')

  await query(
    'INSERT INTO tech_messages (channel, direction, to_number, to_name, body, status, twilio_sid, sent_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    ['sms', 'inbound', process.env.TWILIO_FROM_NUMBER ?? 'WWT', 'WWT Ops Hub', msgBody, 'received', twilioSid, new Date().toISOString()]
  )

  const { rows: pending } = await query(
    "SELECT id, site_id, tech_name, status FROM tech_confirmations WHERE tech_phone = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
    [normalized]
  )

  let replyText = null

  if (pending.length) {
    const conf   = pending[0]
    const intent = parseIntent(msgBody)

    if (intent) {
      await query(
        'UPDATE tech_confirmations SET status = $1, responded_at = $2, response_text = $3 WHERE id = $4',
        [intent, new Date().toISOString(), msgBody, conf.id]
      )

      const { rows: [site] } = await query(
        'SELECT branch_name, code FROM sites WHERE id = $1 LIMIT 1',
        [conf.site_id]
      )
      const siteName = site?.branch_name ?? site?.code ?? 'your site'

      if (intent === 'confirmed') {
        replyText = `Thanks ${conf.tech_name}! You're confirmed for ${siteName}. We'll send a reminder the day before.`
        await query(
          "INSERT INTO alert_log (alert_type, site_id, title, detail) VALUES ('site_added', $1, $2, $3)",
          [conf.site_id, `Tech confirmed: ${conf.tech_name} → ${siteName}`, `Reply: "${msgBody}"`]
        )
      } else if (intent === 'declined') {
        replyText = `Thanks for letting us know ${conf.tech_name}. We'll reach out about rescheduling.`
        await query(
          "INSERT INTO alert_log (alert_type, site_id, title, detail) VALUES ('provider_cancelled', $1, $2, $3)",
          [conf.site_id, `Tech declined: ${conf.tech_name} → ${siteName}`, `Reply: "${msgBody}"`]
        )
      }
    } else {
      replyText = `Message received. Reply YES to confirm or NO if you can't make it.`
    }
  } else {
    replyText = `Message received by WWT Field Services. For assistance contact your FST directly.`
  }

  const twiml = replyText
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyText}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`

  res.setHeader('Content-Type', 'text/xml')
  return res.status(200).send(twiml)
}
