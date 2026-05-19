// Deno edge function — same logic as /api/sync/smartsheet.js
// Deploy: supabase functions deploy smartsheet-sync

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const SS_TOKEN = Deno.env.get('SMARTSHEET_ACCESS_TOKEN')

const STATUS_MAP: Record<string, string> = {
  'not started': 'scheduled', 'in progress': 'in_progress',
  'complete': 'completed',    'completed':   'completed',
  'cancelled': 'cancelled',   'canceled':    'cancelled',
  'scheduled': 'scheduled',   'staffed':     'staffed',
  'on hold':   'scheduled',   'pending':     'scheduled',
}

function mapStatus(raw: string | null) {
  if (!raw) return 'scheduled'
  return STATUS_MAP[raw.toLowerCase().trim()] ?? 'scheduled'
}

function generateCode(rowNumber: number) {
  return `SS-${String(rowNumber).padStart(4, '0')}`
}

function buildNotes(cells: Record<string, any>) {
  const parts = []
  if (cells['Target Quarter'])        parts.push(`Quarter: ${cells['Target Quarter']}`)
  if (cells['LVV In Scope'])          parts.push(`LVV In Scope: ${cells['LVV In Scope']}`)
  if (cells['Due Date to Assign Tech']) parts.push(`Due to Assign: ${cells['Due Date to Assign Tech']}`)
  if (cells['Lead Tech Onsite Tech Name (use commas between names)'])
    parts.push(`Lead Tech: ${cells['Lead Tech Onsite Tech Name (use commas between names)']}`)
  if (cells['Onsite Tech Name (use commas between names)'])
    parts.push(`Onsite Techs: ${cells['Onsite Tech Name (use commas between names)']}`)
  return parts.join(' | ') || null
}

function parseDate(raw: string | null) {
  if (!raw) return null
  try {
    const d = new Date(raw)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  } catch {}
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    const [, mo, dy, yr] = m
    return `${yr.length === 2 ? '20'+yr : yr}-${mo.padStart(2,'0')}-${dy.padStart(2,'0')}`
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })

  try {
    const body = await req.json().catch(() => ({}))
    const projectId = body.project_id

    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, client, smartsheet_id')
      .eq('is_active', true)
      .match(projectId ? { id: projectId } : {})

    const results = []
    for (const project of projects ?? []) {
      if (!project.smartsheet_id) continue
      const result = await syncProject(project)
      results.push(result)
    }

    return json({ ok: true, results })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})

async function syncProject(project: any) {
  if (!SS_TOKEN) return { project_id: project.id, error: 'No Smartsheet token configured' }

  const ssRes = await fetch(`https://api.smartsheet.com/2.0/sheets/${project.smartsheet_id}`, {
    headers: { Authorization: `Bearer ${SS_TOKEN}`, Accept: 'application/json' },
  })

  if (!ssRes.ok) return { project_id: project.id, error: `Smartsheet HTTP ${ssRes.status}` }

  const raw = await ssRes.json()
  const columns = raw.columns.map((c: any) => ({ id: c.id, title: c.title }))
  const rows = (raw.rows ?? []).map((row: any) => {
    const cells: Record<string, any> = {}
    ;(row.cells ?? []).forEach((cell: any, i: number) => {
      cells[columns[i]?.title] = cell.displayValue ?? cell.value ?? null
    })
    return { rowId: row.id, rowNumber: row.rowNumber, modifiedAt: row.modifiedAt, cells }
  })

  const { data: existing } = await supabase
    .from('sites')
    .select('id, code, smartsheet_row_id, branch_name, address, city, state, zip, assigned_tech, scheduled_start, scheduled_end, status')
    .eq('project_id', project.id)

  const byRowId = Object.fromEntries((existing ?? []).filter(s => s.smartsheet_row_id).map((s: any) => [s.smartsheet_row_id, s]))
  const byCode  = Object.fromEntries((existing ?? []).map((s: any) => [s.code, s]))

  let synced = 0, changes = 0

  for (const row of rows) {
    const cells = row.cells
    const branchName = cells['Branch Name']?.trim()
    if (!branchName) continue

    const code    = generateCode(row.rowNumber)
    const rowIdStr = String(row.rowId)

    const incoming = {
      project_id:          project.id,
      code,
      branch_name:         branchName,
      address:             cells['Address']?.trim() ?? null,
      city:                cells['City']?.trim() ?? null,
      state:               cells['State']?.trim() ?? null,
      zip:                 cells['Zip Code']?.trim() ?? null,
      assigned_tech:       cells['Primary FST']?.trim() ?? null,
      scheduled_start:     parseDate(cells['Current Planned Start Date']),
      scheduled_end:       parseDate(cells['Current Planned End Date']),
      status:              mapStatus(cells['Current Status']),
      notes:               buildNotes(cells),
      smartsheet_row_id:   rowIdStr,
      smartsheet_modified: row.modifiedAt,
    }

    const prev = byRowId[rowIdStr] ?? byCode[code]

    if (!prev) {
      await supabase.from('sites').insert(incoming)
      await supabase.from('sync_log').insert({ project_id: project.id, field_name: 'site_added', new_value: code })
      await supabase.from('alert_log').insert({ alert_type: 'site_added', title: `New site: ${code} — ${branchName}`, detail: `Synced from Smartsheet — ${project.name}` })
      changes++
    } else {
      const TRACK = ['branch_name','address','city','state','zip','assigned_tech','scheduled_start','scheduled_end','status']
      const updates: Record<string, any> = { notes: incoming.notes, smartsheet_row_id: rowIdStr, smartsheet_modified: incoming.smartsheet_modified }
      let hasChange = false

      for (const field of TRACK) {
        const nv = (incoming as any)[field]
        const ov = (prev as any)[field]
        if (String(nv ?? '') !== String(ov ?? '')) {
          updates[field] = nv
          hasChange = true
          await supabase.from('sync_log').insert({ project_id: project.id, site_id: prev.id, field_name: field, old_value: String(ov ?? ''), new_value: String(nv ?? '') })
          if (field === 'scheduled_start' || field === 'scheduled_end') {
            await supabase.from('alert_log').insert({ alert_type: 'date_change', site_id: prev.id, title: `Date change: ${code} — ${branchName}`, detail: `${field} changed in Smartsheet` })
          }
        }
      }

      await supabase.from('sites').update(updates).eq('id', prev.id)
      if (hasChange) changes++
    }
    synced++
  }

  return { project_id: project.id, synced, changes }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } })
}

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
}
