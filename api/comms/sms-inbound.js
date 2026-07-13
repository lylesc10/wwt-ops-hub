/**
 * POST /api/comms/sms-inbound
 * Twilio webhook — called when a tech replies to a message
 *
 * Register this URL in Twilio: https://wwt-ops-hub.vercel.app/api/comms/sms-inbound
 * Set as "A message comes in" webhook on your Twilio number
 *
 * Parses reply and updates tech_confirmations status automatically
 */

import { URLSearchParams } from 'url'
import { supa as supabase } from '../../_lib/db.js'
import { logInfo } from '../_lib/log.js'


// Keywords → confirmation status
const CONFIRM_WORDS = new Set(['yes','y','confirm','confirmed','ok','sure','yep','yep','will do','on my way','omw'])
const DECLINE_WORDS = new Set(['no','n','cant','cannot','nope','decline','cancel','unable','no can do'])
const ETA_WORDS     = ['eta','leaving','otw','on the way','30','45','60','minutes','mins','hour']

function parseIntent(text) {
  const lower = text.toLowerCase().trim()
  if (CONFIRM_WORDS.has(lower))                             return 'confirmed'
  if (DECLINE_WORDS.has(lower))                            return 'declined'
  if (ETA_WORDS.some(w => lower.includes(w)))              return 'confirmed' // ETA = coming
  // Number-only reply (e.g. "30" meaning 30 minutes)
  if (/^\d+$/.test(lower.trim()))                          return 'confirmed'
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Parse Twilio form-encoded body
  let body = req.body
  if (typeof body === 'string') {
    const params = new URLSearchParams(body)
    body = Object.fromEntries(params)
  }

  const fromNumber = body?.From ?? ''
  const msgBody    = body?.Body ?? ''
  const twilioSid  = body?.MessageSid ?? ''

  if (!fromNumber || !msgBody) {
    return res.status(200).send('<Response></Response>')
  }

  logInfo(`[SMS Inbound] From: ${fromNumber} | "${msgBody}"`)

  const normalized = fromNumber.replace(/\s/g, '')

  // Log the inbound message
  await supabase.from('tech_messages').insert({
    channel:    'sms',
    direction:  'inbound',
    to_number:  process.env.TWILIO_FROM_NUMBER ?? 'WWT',
    from_number: normalized, // repurposing to_number for clarity
    to_name:    'WWT Ops Hub',
    body:       msgBody,
    status:     'received',
    twilio_sid: twilioSid,
    sent_at:    new Date().toISOString(),
  })

  // Find pending confirmations for this phone number
  const { data: pending } = await supabase
    .from('tech_confirmations')
    .select('id, site_id, tech_name, status')
    .eq('tech_phone', normalized)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)

  let replyText = null

  if (pending?.length) {
    const conf   = pending[0]
    const intent = parseIntent(msgBody)

    if (intent) {
      await supabase.from('tech_confirmations').update({
        status:        intent,
        responded_at:  new Date().toISOString(),
        response_text: msgBody,
      }).eq('id', conf.id)

      // Get site name for reply
      const { data: site } = await supabase
        .from('sites')
        .select('branch_name, code')
        .eq('id', conf.site_id)
        .single()

      const siteName = site?.branch_name ?? site?.code ?? 'your site'

      if (intent === 'confirmed') {
        replyText = `Thanks ${conf.tech_name}! You're confirmed for ${siteName}. We'll send a reminder the day before.`

        // Fire alert if site was previously unconfirmed
        await supabase.from('alert_log').insert({
          alert_type: 'site_added', // reuse as 'tech_confirmed'
          site_id:    conf.site_id,
          title:      `Tech confirmed: ${conf.tech_name} → ${siteName}`,
          detail:     `Reply: "${msgBody}"`,
        })
      } else if (intent === 'declined') {
        replyText = `Thanks for letting us know ${conf.tech_name}. We'll reach out about rescheduling.`

        // Fire alert so PM knows
        await supabase.from('alert_log').insert({
          alert_type: 'provider_cancelled',
          site_id:    conf.site_id,
          title:      `Tech declined: ${conf.tech_name} → ${siteName}`,
          detail:     `Reply: "${msgBody}"`,
        })
      }
    } else {
      // Unrecognized reply — log it but don't update status
      replyText = `Message received. Reply YES to confirm or NO if you can't make it.`
    }
  } else {
    // No pending confirmation — just acknowledge
    replyText = `Message received by WWT Field Services. For assistance contact your FST directly.`
  }

  // Twilio TwiML response
  const twiml = replyText
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyText}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`

  res.setHeader('Content-Type', 'text/xml')
  return res.status(200).send(twiml)
}
