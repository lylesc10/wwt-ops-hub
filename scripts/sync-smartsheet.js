/**
 * Smartsheet → Supabase sync script
 * Usage: node scripts/sync-smartsheet.js [project_id]
 *
 * Omit project_id to sync all projects that have a smartsheet_id set.
 * The Smartsheet token and Supabase keys are read from .env
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Load .env ────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '../.env')
const env = {}
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const SUPABASE_URL     = env.VITE_SUPABASE_URL
const SUPABASE_KEY     = env.SUPABASE_SERVICE_ROLE_KEY
const SS_TOKEN         = env.SMARTSHEET_ACCESS_TOKEN
const SS_BASE          = 'https://api.smartsheet.com/2.0'

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing Supabase credentials in .env'); process.exit(1) }
if (!SS_TOKEN)                      { console.error('Missing SMARTSHEET_ACCESS_TOKEN in .env'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const projectIdArg = process.argv[2] ?? null

// ── Helpers ──────────────────────────────────────────────────
const STATUS_MAP = {
  'completed':'completed', 'complete':'completed',
  'scheduled':'scheduled', 'not started':'scheduled',
  'in progress':'in_progress',
  'blocked':'flagged_date_change', 'revisit':'flagged_date_change', 'reschedule':'flagged_date_change',
  'cancelled':'cancelled', 'canceled':'cancelled',
  'staffed':'staffed', 'none':'scheduled',
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

// ── Sync one project ─────────────────────────────────────────
async function syncProject(project) {
  console.log(`\n→ Syncing "${project.name}" (sheet: ${project.smartsheet_id})`)

  const ssRes = await fetch(`${SS_BASE}/sheets/${project.smartsheet_id}`, {
    headers: { Authorization: `Bearer ${SS_TOKEN}`, Accept: 'application/json' },
  })

  if (!ssRes.ok) {
    const err = await ssRes.json().catch(() => ({}))
    console.error(`  ✗ Smartsheet error ${ssRes.status}: ${err.message ?? ssRes.statusText}`)
    return
  }

  const sheet = await ssRes.json()
  console.log(`  Sheet: "${sheet.name}" — ${sheet.rows?.length ?? 0} rows`)

  const colMap = {}
  for (const col of sheet.columns ?? []) colMap[col.title] = col.id

  const cell = (row, title) => {
    const id = colMap[title]
    if (!id) return null
    const c = row.cells?.find(c => c.columnId === id)
    return c?.displayValue ?? c?.value ?? null
  }

  // Parse rows
  const incoming = {}
  for (const row of sheet.rows ?? []) {
    const code = clean(cell(row, 'Building Code'))
    if (!code) continue
    incoming[code] = {
      project_id:          project.id,
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
      smartsheet_row_id:   String(row.id),
      updated_at:          new Date().toISOString(),
    }
  }

  const incomingCodes = Object.keys(incoming)
  if (!incomingCodes.length) {
    console.error('  ✗ No rows with "Building Code" found — check column names')
    console.log('  Available columns:', Object.keys(colMap).join(', '))
    return
  }

  // Load existing sites
  let existing = []
  for (let i = 0; i < incomingCodes.length; i += 500) {
    const { data } = await supabase
      .from('sites')
      .select('id, code, route_id, fn_wo_id, scheduled_start, scheduled_end, status, onsite_tech, branch_name')
      .eq('project_id', project.id)
      .in('code', incomingCodes.slice(i, i + 500))
    if (data) existing = [...existing, ...data]
  }

  const existingMap = Object.fromEntries(existing.map(s => [s.code, s]))

  // Detect changes
  const dateChanges = [], techChanges = [], added = []
  for (const code of incomingCodes) {
    const n = incoming[code], prev = existingMap[code]
    if (!prev) { added.push(code); continue }
    if ((n.scheduled_start ?? '') !== (prev.scheduled_start ?? '') || (n.scheduled_end ?? '') !== (prev.scheduled_end ?? '')) {
      const pw = isoWeek(prev.scheduled_start), nw = isoWeek(n.scheduled_start)
      dateChanges.push({ code, from: prev.scheduled_start, to: n.scheduled_start, weekMoved: pw !== nw })
    }
    const pt = (prev.onsite_tech ?? '').trim(), nt = (n.onsite_tech ?? '').trim()
    if (pt !== nt) techChanges.push({ code, from: pt || null, to: nt || null })
  }

  // Upsert
  const records = Object.values(incoming).map(r => ({
    ...r,
    route_id: existingMap[r.code]?.route_id ?? null,
    fn_wo_id: existingMap[r.code]?.fn_wo_id ?? null,
  }))

  let upserted = 0
  for (let i = 0; i < records.length; i += 50) {
    const { error } = await supabase
      .from('sites')
      .upsert(records.slice(i, i + 50), { onConflict: 'project_id,code' })
    if (error) { console.error('  Upsert error:', error.message); continue }
    upserted += Math.min(50, records.length - i)
  }

  // Log alerts for date changes
  if (dateChanges.length) {
    await supabase.from('alert_log').insert(dateChanges.map(c => ({
      alert_type: 'date_change',
      title: `Date changed: ${c.code}`,
      detail: `${c.from} → ${c.to}${c.weekMoved ? ' (week shifted)' : ''}`,
    })))
  }

  await supabase.from('sync_log').insert({
    project_id: project.id,
    field_name: 'smartsheet_sync',
    new_value: `${upserted} sites, ${added.length} new, ${dateChanges.length} date changes, ${techChanges.length} tech changes`,
  })

  console.log(`  ✓ ${upserted} sites synced`)
  if (added.length)        console.log(`    + ${added.length} new sites added`)
  if (dateChanges.length)  console.log(`    ~ ${dateChanges.length} date changes (${dateChanges.filter(c=>c.weekMoved).length} week shifts)`)
  if (techChanges.length)  console.log(`    ~ ${techChanges.length} tech changes`)
}

// ── Main ─────────────────────────────────────────────────────
const { data: projects, error } = await supabase
  .from('projects')
  .select('id, name, client, smartsheet_id')
  .eq('is_active', true)
  .not('smartsheet_id', 'is', null)
  .neq('smartsheet_id', '')
  .match(projectIdArg ? { id: projectIdArg } : {})

if (error) { console.error('Failed to load projects:', error.message); process.exit(1) }
if (!projects?.length) {
  console.error(projectIdArg
    ? `No project found with id: ${projectIdArg}`
    : 'No active projects have a Smartsheet ID set. Add one in Settings → Projects.')
  process.exit(1)
}

for (const project of projects) await syncProject(project)
console.log('\nDone.')
