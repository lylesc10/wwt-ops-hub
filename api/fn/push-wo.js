/**
 * POST /api/fn/push-wo
 * Body: { csv_row: object, project_id: string }
 *
 * Pushes a single work order to FieldNation via API.
 * Falls back to mock when credentials aren't configured.
 *
 * FN WO create payload shape (v2):
 * POST /v2/workorders
 * {
 *   title, template_id, project: { id },
 *   location: { mode: 'custom', address1, city, state, zip, country },
 *   schedule: { exact: { start: { local_time } } },
 *   pay: { type, fixed: { amount } } or { type, hourly: { rate, max_units } }
 * }
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

  const { csv_row, project_id } = req.body ?? {}
  if (!csv_row) return res.status(400).json({ message: 'csv_row required' })

  try {
    const creds = await getFNCredentials()

    // Build FN API payload from CSV row
    // CSV columns: templateId(0), projectId(1), siteId(2), bundle(3),
    //   address(4), addr2(5), city(6), state(7), zip(8), country(9),
    //   type(10), startDate(11), endDate(12), startTime(13), endTime(14),
    //   techType(15), techName(16), routeTo(17), budget(18), budgetTravel(19),
    //   maxBudget(20), payRate(21), ..., approxHours(26), estDuration(27), payType(28),
    //   locDisplay(29), locName(30)

    const [
      templateId, fnProjectId, siteId, bundle,
      address, addr2, city, state, zip, country,
      , startDate, , startTime, ,
      techType, , routeTo,
      budget, , maxBudget, payRate,
      , , , , approxHours, , payType,
      locDisplay,
    ] = csv_row

    const payload = {
      title:       siteId,
      template_id: Number(templateId),
      project:     { id: Number(fnProjectId) || undefined },

      location: {
        mode:         'custom',
        address1:     address,
        address2:     addr2 || undefined,
        city,
        state,
        zip,
        country:      country || 'US',
        display_name: locDisplay || undefined,
      },

      schedule: startDate ? {
        service_window: {
          mode: 'exact',
          exact: {
            start: `${startDate}T${startTime || '08:00:00'}`,
            end:   `${startDate}T${endTime   || '17:00:00'}`,
          },
        },
      } : undefined,
      require_ontime: true,

      pay: payType === 'Hourly'
        ? { type: 'hourly', base: { rate: Number(payRate), max_units: Number(approxHours) || 8 } }
        : { type: 'fixed',  base: { amount: Number(budget || maxBudget) } },

      routing: routeTo ? { provider_id: Number(routeTo) } : undefined,

      custom_fields: bundle ? [{ label: 'Bundle', value: bundle }] : undefined,
    }

    // Remove undefined keys
    const cleanPayload = JSON.parse(JSON.stringify(payload))

    const fnRes = await fnFetch('/workorders', {
      method: 'POST',
      body:   JSON.stringify(cleanPayload),
    }, creds)

    if (!fnRes.ok) {
      const err = await fnRes.json().catch(() => ({}))
      return res.status(500).json({
        ok: false,
        message: `FN API error ${fnRes.status}: ${err.message ?? fnRes.statusText}`,
        fn_error: err,
      })
    }

    const wo = await fnRes.json()
    return res.json({
      ok:     true,
      mock:   false,
      wo_id:  wo.id,
      status: wo.status?.name ?? wo.status,
      url:    `https://app.fieldnation.com/workorders/${wo.id}`,
    })

  } catch (err) {
    console.error('[FN push-wo]', err)
    return res.status(500).json({ ok: false, message: err.message })
  }
}

// Reads FN credentials from the `credentials` table (migration 003+)
// Falls back to env vars for local/CI use.
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
