/**
 * POST /api/sync/smartsheet
 * Body: { project_id, sheet_id? }
 *
 * Pulls all rows from Smartsheet via API, runs the same
 * diff/upsert logic as the Excel upload. Uses the access token
 * stored in the credentials table.
 *
 * Call on-demand (Settings → Sync button) or via cron.
 */

import { withSecurity, requireAuth } from '../_lib/middleware.js'
import { supa as supabase } from '../../_lib/db.js'


const SS_BASE = 'https://api.smartsheet.com/2.0'

function parseCreds(encrypted_data) {
  if (!encrypted_data) return null
  try { return JSON.parse(Buffer.from(String(encrypted_data), 'base64').toString('utf-8')) } catch {}
  try { return JSON.parse(String(encrypted_data)) } catch {}
  return null
}

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

async function getToken() {
  // Try env first
  if (process.env.SMARTSHEET_ACCESS_TOKEN) return process.env.SMARTSHEET_ACCESS_TOKEN

  // Then credentials table
  const { data } = await supabase
    .from('credentials')
    .select('encrypted_data')
    .eq('service', 'smartsheet')
    .single()

  if (!data?.encrypted_data) throw new Error('Smartsheet token not configured. Add it in Settings → API & Webhooks.')

  try {
    const parsed = parseCreds(data.encrypted_data)
    return parsed.access_token
  } catch {
    throw new Error('Failed to read Smartsheet credentials')
  }
}

async function getSheetId(projectId) {
  const { data } = await supabase
    .from('projects')
    .select('smartsheet_id')
    .eq('id', projectId)
    .single()
  return data?.smartsheet_id ?? null
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { project_id, sheet_id: overrideSheetId } = req.body ?? {}
  if (!project_id) return res.status(400).json({ message: 'project_id required' })

  let token, sheetId
  try {
    token   = await getToken()
    sheetId = overrideSheetId ?? await getSheetId(project_id)
    if (!sheetId) return res.status(400).json({ message: 'No Smartsheet Sheet ID configured for this project. Set it in Settings → Projects → Edit.' })
  } catch (err) {
    return res.status(400).json({ message: err.message })
  }

  // ── Fetch sheet from Smartsheet ────────────────────────────
  const ssRes = await fetch(`${SS_BASE}/sheets/${sheetId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })

  if (!ssRes.ok) {
    const err = await ssRes.json().catch(() => ({}))
    return res.status(400).json({ message: `Smartsheet API error ${ssRes.status}: ${err.message ?? ssRes.statusText}` })
  }

  const sheet = await ssRes.json()

  // Build column name → id map
  const colMap = {}
  for (const col of sheet.columns ?? []) {
    colMap[col.title] = col.id
  }

  // Helper to get cell value by column title
  const cell = (row, colTitle) => {
    const colId = colMap[colTitle]
    if (!colId) return null
    const c = row.cells?.find(c => c.columnId === colId)
    return c?.displayValue ?? c?.value ?? null
  }

  // ── Parse rows into site records ───────────────────────────
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

  // ── Load existing + preserve route_id/fn_wo_id ─────────────
  let existingSiteIds = []
  for (let i = 0; i < incomingCodes.length; i += 500) {
    const { data } = await supabase
      .from('sites')
      .select('code, route_id, fn_wo_id, scheduled_start, scheduled_end, status, onsite_tech, branch_name')
      .eq('project_id', project_id)
      .in('code', incomingCodes.slice(i, i + 500))
    if (data) existingSiteIds = [...existingSiteIds, ...data]
  }

  const existingMap   = Object.fromEntries(existingSiteIds.map(s => [s.code, s]))
  const existingCodes = new Set(Object.keys(existingMap))

  // ── Diff ───────────────────────────────────────────────────
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

  // ── Alerts ─────────────────────────────────────────────────
  const alerts = []
  for (const c of diff.date_changes) {
    alerts.push({ alert_type: 'date_change', site_id: existingMap[c.code]?.id ?? null, title: `Date changed: ${c.code} — ${c.branch}`, detail: `${c.old_start} → ${c.new_start}${c.week_moved ? ` (Wk ${c.old_week} → Wk ${c.new_week})` : ''}` })
  }
  for (const s of diff.sites_added) {
    alerts.push({ alert_type: 'site_added', title: `New site: ${s.code} — ${s.branch}`, detail: `${s.start ?? 'TBD'}` })
  }
  if (alerts.length) await supabase.from('alert_log').insert(alerts)

  // ── Upsert ─────────────────────────────────────────────────
  const records = Object.values(incoming).map(r => ({
    ...r,
    route_id: existingMap[r.code]?.route_id ?? null,
    fn_wo_id: existingMap[r.code]?.fn_wo_id ?? null,
  }))

  let upserted = 0, errors = []
  for (let i = 0; i < records.length; i += 50) {
    const { error } = await supabase.from('sites').upsert(records.slice(i, i + 50), { onConflict: 'project_id,code' })
    if (error) errors.push(error.message)
    else upserted += Math.min(50, records.length - i)
  }

  const parts = []
  if (diff.date_changes.length)  parts.push(`${diff.date_changes.length} date changes`)
  if (diff.week_changes.length)  parts.push(`${diff.week_changes.length} week shifts`)
  if (diff.sites_added.length)   parts.push(`${diff.sites_added.length} new sites`)
  if (diff.tech_changes.length)  parts.push(`${diff.tech_changes.length} tech changes`)

  await supabase.from('sync_log').insert({ project_id, field_name: 'smartsheet_live_sync', new_value: parts.join(', ') || 'no changes' })

  return res.json({
    ok: !errors.length, upserted, source: 'smartsheet_api',
    sheet_name: sheet.name,
    diff,
    summary: { date_changes: diff.date_changes.length, week_changes: diff.week_changes.length, sites_added: diff.sites_added.length, sites_removed: diff.sites_removed.length, tech_changes: diff.tech_changes.length },
    message: `${upserted} sites synced from Smartsheet "${sheet.name}"${parts.length ? ' · ' + parts.join(', ') : ' · no changes'}`,
    errors: errors.length ? errors.slice(0,3) : undefined,
  })
}

function isoWeek(dateStr) {
  if (!dateStr) return null
  try {
    const d = new Date(dateStr + 'T12:00:00'), jan1 = new Date(d.getFullYear(), 0, 1)
    return Math.ceil((((d - jan1) / 86400000) + jan1.getDay() + 1) / 7)
  } catch { return null }
}

export default withSecurity(requireAuth(handler, 'pm'))
