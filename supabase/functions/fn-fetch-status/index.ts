// supabase/functions/fn-fetch-status/index.ts
// Polls FieldNation for WO status updates and syncs back to Supabase.
// Can also serve as a webhook receiver for FN push notifications.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const FN_BASE          = Deno.env.get('FN_BASE_URL') ?? 'https://api.fieldnation.com'
const FN_CLIENT_ID     = Deno.env.get('FN_CLIENT_ID')
const FN_CLIENT_SECRET = Deno.env.get('FN_CLIENT_SECRET')

// FN status → our wo_status enum
const STATUS_MAP: Record<string, string> = {
  'draft':            'draft',
  'published':        'pushed',
  'assigned':         'accepted',
  'work_done':        'completed',
  'cancelled':        'cancelled',
  'counter_offer':    'counter_offered',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })

  try {
    const body = await req.json().catch(() => ({}))

    // ── Webhook mode: FN POSTs a single event ───────────────
    if (body.event_type && body.work_order_id) {
      await handleWebhook(body)
      return json({ ok: true, mode: 'webhook' })
    }

    // ── Poll mode: check all pushed/accepted WOs ─────────────
    const { data: wos } = await supabase
      .from('work_orders')
      .select('id, fn_wo_id, status, site_id')
      .in('status', ['pushed', 'accepted'])
      .not('fn_wo_id', 'is', null)

    if (!wos?.length) return json({ ok: true, checked: 0 })

    if (!FN_CLIENT_ID || !FN_CLIENT_SECRET) {
      return json({ ok: true, checked: 0, mock: true })
    }

    const token = await getFNToken()
    let updated = 0

    for (const wo of wos) {
      try {
        const res = await fetch(`${FN_BASE}/v2/work-orders/${wo.fn_wo_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) continue

        const fnWo = await res.json()
        const newStatus = STATUS_MAP[fnWo.status] ?? wo.status

        if (newStatus !== wo.status) {
          await supabase.from('work_orders').update({ status: newStatus }).eq('id', wo.id)

          // Provider cancelled → alert + site flip
          if (newStatus === 'cancelled') {
            await supabase.from('sites').update({ status: 'cancelled' }).eq('id', wo.site_id)
            await supabase.from('alert_log').insert({
              alert_type:   'provider_cancelled',
              site_id:      wo.site_id,
              work_order_id: wo.id,
              title:        `Provider cancelled WO: ${wo.fn_wo_id}`,
              detail:       'FieldNation reported WO as cancelled. Site status updated.',
            })
          }

          // Completed → update site
          if (newStatus === 'completed') {
            await supabase.from('sites').update({ status: 'completed' }).eq('id', wo.site_id)
          }

          // Sync provider assignments
          if (fnWo.assignments?.results?.length) {
            for (const assignment of fnWo.assignments.results) {
              await supabase.from('assignments').upsert({
                work_order_id:     wo.id,
                fn_assignment_id:  String(assignment.id),
                provider_id:       String(assignment.provider?.id ?? ''),
                provider_name:     assignment.provider?.name ?? '',
                status:            assignment.status?.name ?? '',
              }, { onConflict: 'fn_assignment_id' })
            }
            // Mark site as staffed if accepted
            if (newStatus === 'accepted') {
              await supabase.from('sites').update({ status: 'staffed' }).eq('id', wo.site_id)
            }
          }

          updated++
        }
      } catch (_) {
        // Don't let a single WO failure abort the whole poll
      }
    }

    return json({ ok: true, checked: wos.length, updated })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})

async function handleWebhook(event: any) {
  const fnWoId    = String(event.work_order_id)
  const fnStatus  = event.status ?? event.event_type
  const newStatus = STATUS_MAP[fnStatus]

  if (!newStatus) return

  const { data: wo } = await supabase
    .from('work_orders')
    .select('id, site_id')
    .eq('fn_wo_id', fnWoId)
    .single()

  if (!wo) return

  await supabase.from('work_orders').update({ status: newStatus }).eq('id', wo.id)

  if (newStatus === 'cancelled') {
    await supabase.from('sites').update({ status: 'cancelled' }).eq('id', wo.site_id)
    await supabase.from('alert_log').insert({
      alert_type:    'provider_cancelled',
      site_id:       wo.site_id,
      work_order_id: wo.id,
      title:         `Provider cancelled WO via webhook: ${fnWoId}`,
    })
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
