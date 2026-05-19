// supabase/functions/fn-check-dupes/index.ts
// Queries FieldNation for existing WOs at given site addresses.
// Called by the Pre-Push Review screen before pushing a batch.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const FN_BASE        = Deno.env.get('FN_BASE_URL') ?? 'https://api.fieldnation.com'
const FN_CLIENT_ID   = Deno.env.get('FN_CLIENT_ID')
const FN_CLIENT_SECRET = Deno.env.get('FN_CLIENT_SECRET')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })

  try {
    const { work_order_ids } = await req.json()
    // work_order_ids: our internal Supabase WO UUIDs to check

    if (!work_order_ids?.length) {
      return json({ dupes: [] })
    }

    // Load WO + site data
    const { data: wos } = await supabase
      .from('work_orders')
      .select('id, title, site:sites(code, branch_name, address, city, state, zip)')
      .in('id', work_order_ids)

    // If no FN credentials, return all as unchecked
    if (!FN_CLIENT_ID || !FN_CLIENT_SECRET) {
      return json({
        dupes: [],
        unchecked: (wos ?? []).map((w: any) => w.id),
        mock: true,
      })
    }

    const token = await getFNToken()
    const dupes: string[] = []

    for (const wo of wos ?? []) {
      const site = (wo as any).site
      if (!site?.address) continue

      // Search FN for WOs at this address
      const searchRes = await fetch(
        `${FN_BASE}/v2/work-orders?address=${encodeURIComponent(site.address)}&city=${encodeURIComponent(site.city ?? '')}&state=${encodeURIComponent(site.state ?? '')}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )

      if (searchRes.ok) {
        const fnData = await searchRes.json()
        if ((fnData.results ?? []).length > 0) {
          dupes.push((wo as any).id)
        }
      }
    }

    return json({ dupes })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})

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
  const data = await res.json()
  return data.access_token
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
