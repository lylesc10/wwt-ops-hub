/**
 * POST /api/fn/map-work-orders
 * Body: { project_id, fn_project_id?, page_size? }
 *
 * Pulls ALL work orders from FieldNation for a project,
 * parses the site code from the title/site_id field,
 * matches to sites in the DB, and upserts into site_work_orders.
 */

import { fnFetch } from './auth.js'
import { query, upsertRows } from '../_lib/db.js'
import { getFNCredentials } from '../_lib/credentials.js'

const FN_STATUS_MAP = {
  draft:      'draft',     published: 'published',
  routed:     'routed',    assigned:  'assigned',
  work_done:  'work_done', approved:  'approved',
  paid:       'paid',      cancelled: 'cancelled',
  expired:    'cancelled', closed:    'approved',
}

function parseWOInfo(title, siteId) {
  const str = (siteId || title || '').toUpperCase()
  const typeMatch = str.match(/[-_]([A-Z]{2,4})\((\d+)\)/) || str.match(/[-_]([A-Z]{2,4})$/)
  const woType   = typeMatch?.[1] ?? null
  const woNumber = typeMatch?.[2] ? parseInt(typeMatch[2]) : 1
  const codeMatch = str.match(/([A-Z][A-Z0-9]{2,5})-[A-Z]{2,4}/)
  const siteCode = codeMatch?.[1] ?? null
  return { siteCode, woType, woNumber }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { project_id, fn_project_id, page_size = 100 } = req.body ?? {}
  if (!project_id) return res.status(400).json({ message: 'project_id required' })

  let creds
  try { creds = await getFNCredentials() }
  catch { return res.status(400).json({ message: 'FieldNation credentials not configured' }) }

  const { rows: siteRows } = await query(
    'SELECT id, code FROM sites WHERE project_id = $1',
    [project_id]
  )
  if (!siteRows.length) return res.status(400).json({ message: 'No sites found for this project' })

  const siteCodeMap = Object.fromEntries(siteRows.map(s => [s.code.toUpperCase(), s.id]))

  let allWOs = [], page = 1, total = null

  while (true) {
    const params = new URLSearchParams({ page, per_page: page_size, ...(fn_project_id ? { project: fn_project_id } : {}) })
    const fnRes = await fnFetch(`/workorders?${params}`, {}, creds)
    if (!fnRes.ok) {
      const err = await fnRes.json().catch(() => ({}))
      return res.status(500).json({ message: `FN API error ${fnRes.status}: ${err.message ?? ''}` })
    }

    const data = await fnRes.json()
    const wos  = data?.results ?? []
    if (total === null) total = data?.total ?? wos.length
    allWOs = [...allWOs, ...wos]
    console.log(`[FN Map] Page ${page}: ${wos.length} WOs (${allWOs.length}/${total})`)
    if (wos.length < page_size || allWOs.length >= total) break
    page++
    if (page > 200) break
  }

  let matched = 0, unmatched = 0
  const upsertRows_ = [], unmatchedTitles = []

  for (const wo of allWOs) {
    const fnId    = String(wo.id)
    const title   = wo.title ?? ''
    const siteId_ = wo.site_id ?? wo.location?.name ?? ''
    const status  = FN_STATUS_MAP[(wo.status?.name ?? wo.status ?? '').toLowerCase()] ?? wo.status?.name

    const { siteCode, woType, woNumber } = parseWOInfo(title, siteId_)
    const dbSiteId = siteCode ? siteCodeMap[siteCode.toUpperCase()] : null

    if (!dbSiteId) {
      unmatched++
      if (unmatchedTitles.length < 20) unmatchedTitles.push({ fn_id: fnId, title, site_id_field: siteId_ })
      continue
    }

    const assignedTech  = wo.routing?.assigned?.provider
      ? [wo.routing.assigned.provider.first_name, wo.routing.assigned.provider.last_name].filter(Boolean).join(' ')
      : null
    const scheduledDate = wo.scheduling?.start_time?.local_time?.split('T')[0]
      ?? wo.scheduling?.requested?.start?.local_time?.split(' ')[0]
      ?? null

    upsertRows_.push({
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

  const { count: upserted } = await upsertRows('site_work_orders', upsertRows_, ['site_id', 'wo_type', 'wo_number', 'day_number'])

  await query(
    "INSERT INTO sync_log (project_id, field_name, new_value) VALUES ($1, 'fn_map_work_orders', $2)",
    [project_id, `${allWOs.length} WOs pulled, ${matched} matched, ${unmatched} unmatched`]
  )

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
