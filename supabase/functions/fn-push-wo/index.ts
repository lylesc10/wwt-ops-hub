// supabase/functions/fn-push-wo/index.ts
// Pushes an approved WO to FieldNation and records the FN WO ID back in Supabase.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const FN_BASE          = Deno.env.get('FN_BASE_URL') ?? 'https://api.fieldnation.com'
const FN_CLIENT_ID     = Deno.env.get('FN_CLIENT_ID')
const FN_CLIENT_SECRET = Deno.env.get('FN_CLIENT_SECRET')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })

  try {
    const { work_order_id, pushed_by } = await req.json()

    if (!work_order_id) return json({ error: 'work_order_id required' }, 400)

    // Load full WO with site
    const { data: wo, error: woErr } = await supabase
      .from('work_orders')
      .select('*, site:sites(*, project:projects(name, client))')
      .eq('id', work_order_id)
      .single()

    if (woErr || !wo) return json({ error: 'Work order not found' }, 404)
    if ((wo as any).status === 'pushed') return json({ error: 'Already pushed' }, 409)

    // Build FN payload
    const site = (wo as any).site
    const fnPayload = buildFNPayload(wo as any, site)

    let fnWoId: string
    let mock = false

    if (!FN_CLIENT_ID || !FN_CLIENT_SECRET) {
      // Mock mode
      fnWoId = `mock-fn-${Date.now()}`
      mock = true
    } else {
      const token = await getFNToken()
      const pushRes = await fetch(`${FN_BASE}/v2/work-orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fnPayload),
      })

      if (!pushRes.ok) {
        const err = await pushRes.json().catch(() => ({}))
        return json({ error: `FN push failed: ${err.message ?? pushRes.status}` }, 502)
      }

      const fnData = await pushRes.json()
      fnWoId = fnData.id ?? fnData.work_order_id
    }

    // Update WO record
    await supabase.from('work_orders').update({
      status:       'pushed',
      fn_wo_id:     fnWoId,
      fn_pushed_at: new Date().toISOString(),
      fn_payload:   fnPayload,
      pushed_by:    pushed_by ?? null,
    }).eq('id', work_order_id)

    // Update site fn_wo_id if this is the primary WO
    await supabase.from('sites').update({ fn_wo_id: fnWoId })
      .eq('id', site.id)
      .is('fn_wo_id', null)  // only set if not already set

    return json({ ok: true, fn_wo_id: fnWoId, mock })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})

function buildFNPayload(wo: any, site: any) {
  return {
    title:       wo.title,
    description: wo.description ?? '',
    pay: wo.pay_type === 'fixed'
      ? { type: 'fixed', fixed: { amount: wo.budget } }
      : { type: 'hourly', hourly: { rate: wo.hourly_rate } },
    location: {
      address1: site.address ?? '',
      city:     site.city    ?? '',
      state:    site.state   ?? '',
      zip:      site.zip     ?? '',
      country:  'USA',
    },
    schedule: {
      start: wo.site?.scheduled_start ?? null,
      end:   wo.site?.scheduled_end   ?? null,
    },
    custom_fields: {
      site_code:  site.code,
      project:    site.project?.name ?? '',
    },
  }
}

async function getFNToken(): Promise<string> {
  const res = await fetch(`${FN_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     FN_CLIENT_ID!,
      client_secret: FN_CLIENT_SECRET!,
    }),
  })
  const d = await res.json()
  return d.access_token
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}
