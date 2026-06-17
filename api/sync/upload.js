/**
 * POST /api/sync/upload
 * Body: { project_id, rows, fileName }
 *
 * Receives pre-parsed rows from SheetJS (client-side Excel parse).
 * Diffs against DB, fires alerts for changes, upserts all rows.
 */

import { query, insertRows, upsertRows } from '../_lib/db.js'

const STATUS_MAP = {
  'completed':'completed','complete':'completed','scheduled':'scheduled','not started':'scheduled',
  'in progress':'in_progress','blocked':'flagged_date_change','revisit':'flagged_date_change',
  'reschedule':'flagged_date_change','cancelled':'cancelled','canceled':'cancelled','staffed':'staffed','none':'scheduled',
}

function mapStatus(v) { return STATUS_MAP[String(v ?? '').toLowerCase().trim()] ?? 'scheduled' }

function fmtDate(v) {
  if (!v) return null
  const s = String(v).trim()
  if (!s || s === 'null' || s === 'undefined' || s.toUpperCase() === 'TBD') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoMatch) return isoMatch[1]
  if (/^\d{5}$/.test(s)) {
    const d = new Date(Math.round((parseInt(s) - 25569) * 86400 * 1000))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
  }
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`
  try {
    const d = new Date(s)
    if (!isNaN(d.getTime())) return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
  } catch {}
  return null
}

function clean(v) { if (v == null) return null; const s = String(v).trim(); return s === 'null' || s === 'undefined' || s === '' ? null : s }
function cleanZip(v) { if (!v) return null; return String(v).replace(/\.0+$/, '').split('.')[0].trim() || null }
function humanDate(d) { if (!d) return 'TBD'; try { return new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) } catch { return d } }
function isoWeek(dateStr) { if (!dateStr) return null; try { const d=new Date(dateStr+'T12:00:00'),jan1=new Date(d.getFullYear(),0,1); return Math.ceil((((d-jan1)/86400000)+jan1.getDay()+1)/7) } catch { return null } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { project_id, rows, fileName = 'upload' } = req.body ?? {}
  if (!project_id)   return res.status(400).json({ message: 'project_id required' })
  if (!rows?.length) return res.status(400).json({ message: 'No rows received' })

  const keys = Object.keys(rows[0])

  // Check for stored column map
  let storedMap = null
  const { rows: [project] } = await query('SELECT active_column_map_id FROM projects WHERE id = $1 LIMIT 1', [project_id])
  if (project?.active_column_map_id) {
    const { rows: [colMap] } = await query('SELECT source_cols FROM column_maps WHERE id = $1 LIMIT 1', [project.active_column_map_id])
    if (colMap?.source_cols) storedMap = typeof colMap.source_cols === 'string' ? JSON.parse(colMap.source_cols) : colMap.source_cols
  }

  let COL
  if (storedMap) {
    COL = {
      code: storedMap.code ?? null, branch: storedMap.branch_name ?? null, address: storedMap.address ?? null,
      city: storedMap.city ?? null, state: storedMap.state ?? null, zip: storedMap.zip ?? null,
      timezone: storedMap.time_zone ?? null, status: storedMap.status ?? null,
      start_date: storedMap.scheduled_start ?? null, end_date: storedMap.scheduled_end ?? null,
      due_date: storedMap.due_date_assign ?? null, fst: storedMap.fst_owner ?? null,
      lead_tech: storedMap.lead_tech ?? null, onsite_tech: storedMap.onsite_tech ?? null,
      onsite_email: storedMap.onsite_email ?? null, onsite_phone: storedMap.onsite_phone ?? null,
      lvv_in_scope: storedMap.lvv_in_scope ?? null, target_quarter: storedMap.target_quarter ?? null,
      flag_late: storedMap.flag_late ?? null, last_modified: storedMap.last_modified ?? null,
    }
  } else {
    const find = (...candidates) => keys.find(k => candidates.some(c => k.toLowerCase().includes(c.toLowerCase()))) ?? null
    COL = {
      code: find('Building Code','BuildingCode','Site Code'), branch: find('Branch Name','BranchName'),
      address: find('Address'), city: find('City'), state: find('State'),
      zip: find('Zip Code','ZipCode','ZIP'), timezone: find('Time Zone','TimeZone'),
      status: find('Current Status'), start_date: find('Current Planned Start','NewLVL_Date','Start Date','Planned Start'),
      end_date: find('Current Planned End','InstallStartDate','End Date','Planned End'),
      due_date: find('Due Date'), fst: find('Primary FST'), lead_tech: find('Lead Tech'),
      onsite_tech: find('Onsite Tech Name'), onsite_email: find('Onsite Tech Email'),
      onsite_phone: find('Onsite Tech Phone'), lvv_in_scope: find('LVV In Scope','LVV in Scope'),
      target_quarter: find('Target Quarter'), flag_late: find('Flag Tech Assigned'), last_modified: find('Last Modified'),
    }
  }

  const incoming = {}
  let skipped = 0

  for (const row of rows) {
    const code = clean(COL.code ? row[COL.code] : null)
    if (!code || code === 'Building Code' || code === 'Test Site') { skipped++; continue }
    incoming[code] = {
      project_id, code,
      branch_name:         clean(COL.branch       ? row[COL.branch]       : null),
      address:             clean(COL.address       ? row[COL.address]      : null),
      city:                clean(COL.city          ? row[COL.city]         : null),
      state:               clean(COL.state         ? row[COL.state]        : null),
      zip:                 cleanZip(COL.zip        ? row[COL.zip]          : null),
      time_zone:           clean(COL.timezone      ? row[COL.timezone]     : null),
      status:              mapStatus(COL.status    ? row[COL.status]       : null),
      fst_owner:           clean(COL.fst           ? row[COL.fst]          : null),
      lead_technician:     clean(COL.lead_tech     ? row[COL.lead_tech]    : null),
      onsite_tech:         clean(COL.onsite_tech   ? row[COL.onsite_tech]  : null),
      onsite_email:        clean(COL.onsite_email  ? row[COL.onsite_email] : null),
      onsite_phone:        clean(COL.onsite_phone  ? row[COL.onsite_phone] : null),
      scheduled_start:     fmtDate(COL.start_date  ? row[COL.start_date]   : null),
      scheduled_end:       fmtDate(COL.end_date    ? row[COL.end_date]     : null),
      due_date_assign:     fmtDate(COL.due_date    ? row[COL.due_date]     : null),
      target_quarter:      clean(COL.target_quarter? row[COL.target_quarter]: null),
      lvv_in_scope:        clean(COL.lvv_in_scope  ? row[COL.lvv_in_scope] : null),
      flag_late_assign:    String(COL.flag_late ? (row[COL.flag_late] ?? '') : '').toLowerCase() === 'true',
      smartsheet_modified: fmtDate(COL.last_modified ? row[COL.last_modified] : null),
      updated_at:          new Date().toISOString(),
    }
  }

  const incomingCodes = Object.keys(incoming)
  if (!incomingCodes.length) return res.status(400).json({ message: `No valid site rows parsed. Skipped ${skipped} blank rows.` })

  const { rows: existing } = await query(
    'SELECT id, code, branch_name, scheduled_start, scheduled_end, status, fst_owner, onsite_tech FROM sites WHERE project_id = $1',
    [project_id]
  )
  const existingMap   = Object.fromEntries(existing.map(s => [s.code, s]))
  const existingCodes = new Set(Object.keys(existingMap))

  const diff = { date_changes:[], week_changes:[], sites_added:[], sites_removed:[], tech_changes:[], status_changes:[] }

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
  for (const c of diff.date_changes) alerts.push({ alert_type:'date_change', site_id: existingMap[c.code]?.id ?? null, title:`Date changed: ${c.code} — ${c.branch}`, detail:`Start: ${humanDate(c.old_start)} → ${humanDate(c.new_start)}${c.week_moved ? ` (Wk ${c.old_week} → Wk ${c.new_week})` : ''}` })
  for (const s of diff.sites_added) alerts.push({ alert_type:'site_added', title:`New site in upload: ${s.code} — ${s.branch}`, detail:`Scheduled: ${humanDate(s.start)}${s.state ? ` · ${s.state}` : ''}`, site_id: null })
  if (alerts.length) await insertRows('alert_log', alerts)

  // Preserve route_id and fn_wo_id
  let sitePreserve = []
  for (let i = 0; i < incomingCodes.length; i += 500) {
    const { rows: batch } = await query(
      'SELECT code, route_id, fn_wo_id FROM sites WHERE project_id = $1 AND code = ANY($2)',
      [project_id, incomingCodes.slice(i, i + 500)]
    )
    sitePreserve = [...sitePreserve, ...batch]
  }
  const preserveMap = Object.fromEntries(sitePreserve.map(s => [s.code, { route_id: s.route_id, fn_wo_id: s.fn_wo_id }]))

  const records = Object.values(incoming).map(r => ({
    ...r,
    route_id: preserveMap[r.code]?.route_id ?? null,
    fn_wo_id: preserveMap[r.code]?.fn_wo_id ?? null,
  }))

  const { count: upserted } = await upsertRows('sites', records, ['project_id', 'code'])

  const parts = []
  if (diff.date_changes.length)  parts.push(`${diff.date_changes.length} date changes`)
  if (diff.week_changes.length)  parts.push(`${diff.week_changes.length} week shifts`)
  if (diff.sites_added.length)   parts.push(`${diff.sites_added.length} new sites`)
  if (diff.sites_removed.length) parts.push(`${diff.sites_removed.length} not in upload`)
  if (diff.tech_changes.length)  parts.push(`${diff.tech_changes.length} tech changes`)

  await query("INSERT INTO sync_log (project_id, field_name, new_value) VALUES ($1, 'excel_upload', $2)", [project_id, parts.join(', ') || 'no changes detected'])

  return res.json({
    ok: true, upserted, skipped, fileName, diff,
    summary: { date_changes: diff.date_changes.length, week_changes: diff.week_changes.length, sites_added: diff.sites_added.length, sites_removed: diff.sites_removed.length, tech_changes: diff.tech_changes.length, status_changes: diff.status_changes.length },
    message: `${upserted} sites synced${parts.length ? ' · ' + parts.join(', ') : ' · no changes detected'}`,
  })
}
