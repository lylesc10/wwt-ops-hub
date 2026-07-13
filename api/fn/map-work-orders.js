/**
 * POST /api/fn/map-work-orders
 * Body: { project_id, fn_project_id?, page_size? }
 *
 * Pulls ALL work orders from FieldNation for a project,
 * parses the site code from the title/site_id field,
 * matches to sites in the DB, and upserts into site_work_orders.
 *
 * Call this once to get a full picture of what's in FN.
 * Then call it periodically (or on-demand) to stay in sync.
 *
 * FN WO title format: "PREFIX-CODE-WOTYPE(N)-City, State"
 * Site ID field: "CODE-WOTYPE(N)"
 * e.g. "PNC-FB - CMH2-LVL(1)-Columbus, OH" or site_id "B015-LVL(1)"
 */

import { fnFetch } from './auth.js'
import { supa as supabase } from '../../_lib/db.js'
import { logInfo, logError } from '../_lib/log.js'


const FN_STATUS_MAP = {
  draft:      'draft',     published: 'published',
  routed:     'routed',    assigned:  'assigned',
  work_done:  'work_done', approved:  'approved',
  paid:       'paid',      cancelled: 'cancelled',
  expired:    'cancelled', closed:    'approved',
}

function parseWOInfo(title, siteId) {
  // Try to extract from site_id field first (more reliable)
  // Format: CODE-WOTYPE(N) e.g. "B015-LVL(1)" or "B015-DEL"
  const str = (siteId || title || '').toUpperCase()

  // Extract wo_type and number
  const typeMatch = str.match(/[-_]([A-Z]{2,4})\((\d+)\)/) || str.match(/[-_]([A-Z]{2,4})$/)
  const woType   = typeMatch?.[1] ?? null
  const woNumber = typeMatch?.[2] ? parseInt(typeMatch[2]) : 1

  // Extract site code — everything before the first dash+letter sequence
  // e.g. "B015-LVL(1)" → "B015", "PNC-FB - B015-LVL(1)" → "B015"
  // Strategy: find the last token that looks like a site code
  const codeMatch = str.match(/([A-Z][A-Z0-9]{2,5})-[A-Z]{2,4}/)
  const siteCode = codeMatch?.[1] ?? null

  return { siteCode, woType, woNumber }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { project_id, fn_project_id, page_size = 100 } = req.body ?? {}
  if (!project_id) return res.status(400).json({ message: 'project_id required' })

  // Get FN credentials
  let creds
  try { creds = await getFNCredentials() }
  catch { return res.status(400).json({ message: 'FieldNation credentials not configured' }) }

  // Load site code → site_id map for this project
  const { data: siteRows } = await supabase
    .from('sites')
    .select('id, code, project_id')
    .eq('project_id', project_id)

  if (!siteRows?.length) {
    return res.status(400).json({ message: 'No sites found for this project' })
  }

  const siteCodeMap = Object.fromEntries(siteRows.map(s => [s.code.toUpperCase(), s.id]))

  // Pull all WOs from FN — paginate until done
  let allWOs = []
  let page   = 1
  let total  = null

  while (true) {
    const params = new URLSearchParams({
      page,
      per_page: page_size,
      ...(fn_project_id ? { project: fn_project_id } : {}),
    })

    const fnRes = await fnFetch(`/workorders?${params}`, {}, creds)
    if (!fnRes.ok) {
      const err = await fnRes.json().catch(() => ({}))
      return res.status(500).json({ message: `FN API error ${fnRes.status}: ${err.message ?? ''}` })
    }

    const data = await fnRes.json()
    const wos  = data?.results ?? []

    if (total === null) total = data?.total ?? wos.length
    allWOs = [...allWOs, ...wos]

    logInfo(`[FN Map] Page ${page}: ${wos.length} WOs (${allWOs.length}/${total})`)

    if (wos.length < page_size || allWOs.length >= total) break
    page++

    // Safety cap
    if (page > 200) break
  }

  logInfo(`[FN Map] Total WOs pulled: ${allWOs.length}`)

  // Parse and match each WO to a site
  let matched = 0, unmatched = 0
  const upsertRows = []
  const unmatchedTitles = []

  for (const wo of allWOs) {
    const fnId    = String(wo.id)
    const title   = wo.title ?? ''
    const siteId_ = wo.site_id ?? wo.location?.name ?? ''
    const status  = FN_STATUS_MAP[(wo.status?.name ?? wo.status ?? '').toLowerCase()] ?? wo.status?.name

    const { siteCode, woType, woNumber } = parseWOInfo(title, siteId_)

    // Try to find site in DB
    const dbSiteId = siteCode ? siteCodeMap[siteCode.toUpperCase()] : null

    if (!dbSiteId) {
      unmatched++
      if (unmatchedTitles.length < 20) unmatchedTitles.push({ fn_id: fnId, title, site_id_field: siteId_ })
      continue
    }

    const assignedTech = wo.routing?.assigned?.provider
      ? [wo.routing.assigned.provider.first_name, wo.routing.assigned.provider.last_name].filter(Boolean).join(' ')
      : null

    const scheduledDate = wo.scheduling?.start_time?.local_time?.split('T')[0]
      ?? wo.scheduling?.requested?.start?.local_time?.split(' ')[0]
      ?? null

    upsertRows.push({
      site_id:       dbSiteId,
      project_id,
      wo_type:       woType ?? 'UNKNOWN',
      wo_number:     woNumber,
      day_number:    1,
      fn_wo_id:      fnId,
      fn_title:      title,
      fn_status:     status,
      fn_url:        `https://app.fieldnation.com/workorders/${fnId}`,
      assigned_tech: assignedTech,
      provider_id:   String(wo.routing?.assigned?.provider?.id ?? ''),
      scheduled_date: scheduledDate,
      template_id:   String(wo.template?.id ?? ''),
      budget:        wo.pay?.fixed?.amount ?? wo.pay?.estimated_total ?? null,
      synced_at:     new Date().toISOString(),
    })
    matched++
  }

  // Upsert matched WOs in batches
  let upserted = 0
  for (let i = 0; i < upsertRows.length; i += 50) {
    const { error } = await supabase
      .from('site_work_orders')
      .upsert(upsertRows.slice(i, i + 50), {
        onConflict: 'site_id,wo_type,wo_number,day_number',
        ignoreDuplicates: false,
      })
    if (!error) upserted += Math.min(50, upsertRows.length - i)
    else logError('[FN Map] Upsert error:', error.message)
  }

  // Log
  await supabase.from('sync_log').insert({
    project_id,
    field_name: 'fn_map_work_orders',
    new_value:  `${allWOs.length} WOs pulled, ${matched} matched, ${unmatched} unmatched`,
  })

  return res.json({
    ok:           true,
    total_in_fn:  allWOs.length,
    matched,
    unmatched,
    upserted,
    pages_fetched: page,
    unmatched_samples: unmatchedTitles,
    message: `Mapped ${matched} of ${allWOs.length} FN work orders to sites. ${unmatched} could not be matched.`,
  })
}

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
    .select('encrypted_data')
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
