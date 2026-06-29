/**
 * POST /api/sync/smartsheet
 * Body: { project_id, sheet_id? }
 *
 * Pulls all rows from Smartsheet via API, runs the same
 * diff/upsert logic as the Excel upload. Uses the access token
 * stored in the credentials table.
 */

import { withSecurity, requireAuth } from '../_lib/middleware.js'
import { query, insertRows, upsertRows } from '../_lib/db.js'
import { getSSToken } from '../_lib/credentials.js'

const SS_BASE = 'https://api.smartsheet.com/2.0'

const STATUS_MAP = {
  'completed':'completed','complete':'completed',
  'scheduled':'scheduled','not started':'scheduled',
  'in progress':'in_progress',
  'blocked':'flagged_date_change','revisit':'flagged_date_change','reschedule':'flagged_date_change',
  'cancelled':'cancelled','canceled':'cancelled','staffed':'staffed','none':'scheduled',
}

function mapStatus(v) {
  return STATUS_MAP[String(v ?? '').toLowerCase().trim()] ?? 'scheduled'
}

function fmtDate(v) {
  if (!v) return null
  const s = String(v).trim()
  if (!s || s === 'null') return null
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`
  return null
}

function clean(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s === 'null' || s === '' ? null : s
}

function cleanZip(v) {
  if (!v) return null
  return String(v).replace(/\.0+$/, '').split('.')[0].trim() || null
}

function isoWeek(dateStr) {
  if (!dateStr) return null
  try {
    const d = new Date(dateStr + 'T12:00:00'), jan1 = new Date(d.getFullYear(), 0, 1)
    return Math.ceil((((d - jan1) / 86400000) + jan1.getDay() + 1) / 7)
  } catch { return null }
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { project_id, sheet_id: overrideSheetId } = req.body ?? {}
  if (!project_id) return res.status(400).json({ message: 'project_id required' })

  let token, sheetId
  try {
    token = await getSSToken()
    if (!overrideSheetId) {
      const { rows } = await query('SELECT smartsheet_id FROM projects WHERE id = $1 LIMIT 1', [project_id])
      sheetId = rows[0]?.smartsheet_id ?? null
    } else {
      sheetId = overrideSheetId
    }
    if (!sheetId) return res.status(400).json({ message: 'No Smartsheet Sheet ID configured for this project. Set it in Settings → Projects → Edit.' })
  } catch (err) {
    return res.status(400).json({ message: err.message })
  }

  const ssRes = await fetch(`${SS_BASE}/sheets/${sheetId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })

  if (!ssRes.ok) {
    const err = await ssRes.json().catch(() => ({}))
    return res.status(400).json({ message: `Smartsheet API error ${ssRes.status}: ${err.message ?? ssRes.statusText}` })
  }

  const sheet = await ssRes.json()

  const colMap = {}
  for (const col of sheet.columns ?? []) colMap[col.title] = col.id

  const cell = (row, colTitle) => {
    const colId = colMap[colTitle]
    if (!colId) return null
    const c = row.cells?.find(c => c.columnId === colId)
    return c?.displayValue ?? c?.value ?? null
  }

  const incoming = {}
  for (const row of sheet.rows ?? []) {
    const code = clean(cell(row, 'Building Code'))
    if (!code) continue
    incoming[code] = {
      project_id,
      code,
      branch_name:         clean(cell(row, 'Branch Name')),
      address:             clean(cell(row, 'Address')),
      city:                clean(cell(row, 'City')),
      state:               clean(cell(row, 'State')),
      zip:                 cleanZip(cell(row, 'Zip Code')),
      time_zone:           clean(cell(row, 'Time Zone')),
      status:              mapStatus(cell(row, 'Current Status')),
      fst_owner:           clean(cell(row, 'Primary FST')),
      lead_technician:     clean(cell(row, 'Lead Tech')),
      onsite_tech:         clean(cell(row, 'Onsite Tech Name (use commas between names)')),
      onsite_email:        clean(cell(row, 'Onsite Tech Email (use commas between emails)')),
      onsite_phone:        clean(cell(row, 'Onsite Tech Phones (Use Commas between phones)')),
      scheduled_start:     fmtDate(cell(row, 'Current Planned Start Date')),
      scheduled_end:       fmtDate(cell(row, 'Current Planned End Date')),
      due_date_assign:     fmtDate(cell(row, 'Due Date to Assign Tech')),
      target_quarter:      clean(cell(row, 'Target Quarter')),
      lvv_in_scope:        clean(cell(row, 'LVV In Scope')),
      flag_late_assign:    String(cell(row, 'Flag Tech Assigned after due date') ?? '').toLowerCase() === 'true',
      smartsheet_modified: fmtDate(cell(row, 'Last Modified')),
      smartsheet_row_id:   String(row.id),
      updated_at:          new Date().toISOString(),
    }
  }

  const incomingCodes = Object.keys(incoming)
  if (!incomingCodes.length) {
    return res.status(400).json({ message: 'No rows with Building Code found in sheet' })
  }

  // Load existing sites in batches of 500
  let existingSites = []
  for (let i = 0; i < incomingCodes.length; i += 500) {
    const batch = incomingCodes.slice(i, i + 500)
    const { rows } = await query(
      'SELECT code, id, route_id, fn_wo_id, scheduled_start, scheduled_end, status, onsite_tech, branch_name FROM sites WHERE project_id = $1 AND code = ANY($2)',
      [project_id, batch]
    )
    existingSites = [...existingSites, ...rows]
  }

  const existingMap = Object.fromEntries(existingSites.map(s => [s.code, s]))
  const existingCodes = new Set(Object.keys(existingMap))

  const diff = { date_changes: [], week_changes: [], sites_added: [], sites_removed: [], tech_changes: [], status_changes: [] }

  for (const code of incomingCodes) {
    const n = incoming[code], prev = existingMap[code]
    if (!prev) { diff.sites_added.push({ code, branch: n.branch_name, start: n.scheduled_start, state: n.state }); continue }

    const startChanged = (n.scheduled_start ?? '') !== (prev.scheduled_start ?? '')
    const endChanged   = (n.scheduled_end   ?? '') !== (prev.scheduled_end   ?? '')
    if (startChanged || endChanged) {
      const prevWeek = isoWeek(prev.scheduled_start), newWeek = isoWeek(n.scheduled_start)
      diff.date_changes.push({ code, branch: n.branch_name ?? prev.branch_name, old_start: prev.scheduled_start, new_start: n.scheduled_start, old_week: prevWeek, new_week: newWeek, week_moved: prevWeek !== newWeek })
      if (prevWeek !== newWeek) diff.week_changes.push({ code, branch: n.branch_name ?? prev.branch_name, from_week: prevWeek, to_week: newWeek, from_date: prev.scheduled_start, to_date: n.scheduled_start })
    }
    const pt = (prev.onsite_tech ?? '').trim(), nt = (n.onsite_tech ?? '').trim()
    if (pt !== nt) diff.tech_changes.push({ code, branch: n.branch_name ?? prev.branch_name, old_tech: pt||null, new_tech: nt||null, added: !pt&&!!nt, removed: !!pt&&!nt })
    if ((n.status ?? '') !== (prev.status ?? '')) diff.status_changes.push({ code, branch: n.branch_name ?? prev.branch_name, old: prev.status, new: n.status })
  }
  for (const code of existingCodes) {
    if (!incoming[code]) { const s = existingMap[code]; diff.sites_removed.push({ code, branch: s.branch_name, start: s.scheduled_start }) }
  }

  const alerts = []
  for (const c of diff.date_changes) {
    alerts.push({ alert_type: 'date_change', site_id: existingMap[c.code]?.id ?? null, title: `Date changed: ${c.code} — ${c.branch}`, detail: `${c.old_start} → ${c.new_start}${c.week_moved ? ` (Wk ${c.old_week} → Wk ${c.new_week})` : ''}` })
  }
  for (const s of diff.sites_added) {
    alerts.push({ alert_type: 'site_added', title: `New site: ${s.code} — ${s.branch}`, detail: `${s.start ?? 'TBD'}`, site_id: null })
  }
  if (alerts.length) await insertRows('alert_log', alerts)

  const records = Object.values(incoming).map(r => ({
    ...r,
    route_id: existingMap[r.code]?.route_id ?? null,
    fn_wo_id: existingMap[r.code]?.fn_wo_id ?? null,
  }))

  const { count: upserted } = await upsertRows('sites', records, ['project_id', 'code'])

  const parts = []
  if (diff.date_changes.length)  parts.push(`${diff.date_changes.length} date changes`)
  if (diff.week_changes.length)  parts.push(`${diff.week_changes.length} week shifts`)
  if (diff.sites_added.length)   parts.push(`${diff.sites_added.length} new sites`)
  if (diff.tech_changes.length)  parts.push(`${diff.tech_changes.length} tech changes`)

  await query(
    "INSERT INTO sync_log (project_id, field_name, new_value) VALUES ($1, 'smartsheet_live_sync', $2)",
    [project_id, parts.join(', ') || 'no changes']
  )

  return res.json({
    ok: true, upserted, source: 'smartsheet_api',
    sheet_name: sheet.name,
    diff,
    summary: { date_changes: diff.date_changes.length, week_changes: diff.week_changes.length, sites_added: diff.sites_added.length, sites_removed: diff.sites_removed.length, tech_changes: diff.tech_changes.length },
    message: `${upserted} sites synced from Smartsheet "${sheet.name}"${parts.length ? ' · ' + parts.join(', ') : ' · no changes'}`,
  })
}

export default withSecurity(requireAuth(handler, 'pm'))
