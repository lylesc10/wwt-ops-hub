/**
 * POST /api/ai/map-columns
 * Body: { project_id, headers: string[], sample_rows: object[], map_name?: string }
 *
 * Sends headers + sample rows to Claude, returns a column mapping.
 * Stores the mapping in column_maps table.
 */

import { query } from '../_lib/db.js'

const TARGET_FIELDS = {
  code:           'Unique site/building identifier code (e.g. B015, Y796)',
  branch_name:    'Branch or location name (e.g. "Crest Hill", "Downtown Columbus")',
  address:        'Street address',
  city:           'City name',
  state:          'US state abbreviation (2 letters)',
  zip:            'ZIP or postal code',
  time_zone:      'Time zone (e.g. Central, Eastern)',
  status:         'Current status of the site (e.g. Scheduled, Completed, Cancelled)',
  scheduled_start: 'Planned/scheduled start date for the work',
  scheduled_end:  'Planned/scheduled end date for the work',
  due_date_assign: 'Deadline to assign a technician',
  fst_owner:      'Primary FST, staffing coordinator, or project manager assigned',
  lead_tech:      'Lead technician name',
  onsite_tech:    'Onsite technician name(s) — may be comma-separated',
  onsite_email:   'Onsite technician email(s)',
  onsite_phone:   'Onsite technician phone number(s)',
  lvv_in_scope:   'Boolean flag — is this site in scope for LVV work',
  target_quarter: 'Target fiscal or calendar quarter',
  flag_late:      'Boolean flag — was tech assigned after the due date',
  last_modified:  'Last modified / updated timestamp',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { project_id, headers, sample_rows, map_name } = req.body ?? {}
  if (!headers?.length)     return res.status(400).json({ message: 'headers required' })
  if (!sample_rows?.length) return res.status(400).json({ message: 'sample_rows required' })

  const fieldDescriptions = Object.entries(TARGET_FIELDS).map(([k, v]) => `  "${k}": ${v}`).join('\n')
  const sampleStr  = JSON.stringify(sample_rows.slice(0, 5), null, 2)
  const headerStr  = JSON.stringify(headers)

  const prompt = `You are a data mapping assistant for a field services operations platform.

I have a spreadsheet with these column headers:
${headerStr}

Here are the first few rows of data:
${sampleStr}

I need to map these columns to our internal field names. Here are the fields I need:
${fieldDescriptions}

Instructions:
- Look at the actual header names AND the sample data to determine the best match
- Only map a field if you are confident the column contains that data
- If a field has no matching column, set it to null
- For date fields, note the format you see in the data (e.g. "MM/DD/YYYY", "ISO datetime", "Excel serial")
- If multiple columns could match a field, pick the best one
- Return ONLY valid JSON, no explanation, no markdown

Return this exact JSON structure:
{
  "mapping": {
    "code": "exact column header name or null",
    "branch_name": "exact column header name or null",
    "address": "exact column header name or null",
    "city": "exact column header name or null",
    "state": "exact column header name or null",
    "zip": "exact column header name or null",
    "time_zone": "exact column header name or null",
    "status": "exact column header name or null",
    "scheduled_start": "exact column header name or null",
    "scheduled_end": "exact column header name or null",
    "due_date_assign": "exact column header name or null",
    "fst_owner": "exact column header name or null",
    "lead_tech": "exact column header name or null",
    "onsite_tech": "exact column header name or null",
    "onsite_email": "exact column header name or null",
    "onsite_phone": "exact column header name or null",
    "lvv_in_scope": "exact column header name or null",
    "target_quarter": "exact column header name or null",
    "flag_late": "exact column header name or null",
    "last_modified": "exact column header name or null"
  },
  "date_format": "describe the date format seen (e.g. ISO datetime string, MM/DD/YYYY, Excel serial number)",
  "confidence": 0.95,
  "notes": "any important observations about this sheet structure",
  "unmapped_source_cols": ["list of source columns that had no obvious mapping"]
}`

  let mapping, confidence, notes, dateFormat, unmappedCols
  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
    })

    if (!aiRes.ok) {
      const err = await aiRes.json().catch(() => ({}))
      throw new Error(`Claude API error ${aiRes.status}: ${err.error?.message ?? aiRes.statusText}`)
    }

    const aiData  = await aiRes.json()
    const rawText = aiData.content?.[0]?.text ?? ''
    const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed  = JSON.parse(jsonStr)

    mapping      = parsed.mapping
    confidence   = parsed.confidence ?? 0.8
    notes        = parsed.notes ?? ''
    dateFormat   = parsed.date_format ?? ''
    unmappedCols = parsed.unmapped_source_cols ?? []
  } catch (err) {
    return res.status(500).json({ message: `AI mapping failed: ${err.message}` })
  }

  const headerSet = new Set(headers)
  const validated = {}
  for (const [field, col] of Object.entries(mapping)) {
    validated[field] = (col && headerSet.has(col)) ? col : null
  }

  const mappedCount   = Object.values(validated).filter(Boolean).length
  const missingFields = Object.keys(TARGET_FIELDS).filter(f => !validated[f])

  let savedId = null
  if (project_id) {
    const { rows } = await query(
      'INSERT INTO column_maps (project_id, name, source_cols, sample_headers, confidence, verified) VALUES ($1, $2, $3, $4, $5, false) RETURNING id',
      [project_id, map_name ?? `Auto-mapped ${new Date().toLocaleDateString()}`, JSON.stringify(validated), JSON.stringify(headers), confidence]
    )
    savedId = rows[0]?.id ?? null
  }

  return res.json({
    ok:            true,
    mapping:       validated,
    confidence,
    mapped_count:  mappedCount,
    total_fields:  Object.keys(TARGET_FIELDS).length,
    missing_fields: missingFields,
    unmapped_source_cols: unmappedCols,
    date_format:   dateFormat,
    notes,
    saved_id:      savedId,
  })
}
