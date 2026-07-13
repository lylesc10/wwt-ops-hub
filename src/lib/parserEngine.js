/**
 * Parser Engine
 *
 * Executes a saved parser config against raw input (text/CSV/paste).
 * Fully client-side — no server round-trip for the actual parsing.
 * Results are then saved to the database via the import hooks.
 */

// ── Transforms ────────────────────────────────────────────────
const TRANSFORMS = {
  trim:     (v) => String(v ?? '').trim(),
  upper:    (v) => String(v ?? '').trim().toUpperCase(),
  lower:    (v) => String(v ?? '').trim().toLowerCase(),
  phone:    (v) => {
    const digits = String(v ?? '').replace(/\D/g, '')
    if (digits.length === 10) return `+1${digits}`
    if (digits.length === 11 && digits[0] === '1') return `+${digits}`
    return String(v ?? '').trim()
  },
  date: (v) => {
    if (!v) return null
    const s = String(v).trim()
    if (!s) return null
    // Try common formats
    const parsed = new Date(s)
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0]  // YYYY-MM-DD
    }
    // MM/DD/YYYY
    const mmddyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    if (mmddyyyy) {
      const [, m, d, y] = mmddyyyy
      const year = y.length === 2 ? `20${y}` : y
      return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
    }
    return null
  },
  currency: (v) => {
    const num = parseFloat(String(v ?? '').replace(/[$,\s]/g, ''))
    return isNaN(num) ? null : num
  },
  integer: (v) => {
    const n = parseInt(String(v ?? '').replace(/[,\s]/g, ''), 10)
    return isNaN(n) ? null : n
  },
}

function applyTransform(value, transform) {
  if (!transform || !TRANSFORMS[transform]) return value == null ? null : String(value)
  return TRANSFORMS[transform](value)
}

// ── Delimiter detection ───────────────────────────────────────
function detectDelimiter(text) {
  const sample = text.split('\n').slice(0, 5).join('\n')
  const counts = {
    ',': (sample.match(/,/g) ?? []).length,
    '\t': (sample.match(/\t/g) ?? []).length,
    '|': (sample.match(/\|/g) ?? []).length,
    ';': (sample.match(/;/g) ?? []).length,
  }
  return Object.entries(counts).sort(([,a],[,b]) => b-a)[0][0]
}

// ── Parse raw text into rows ──────────────────────────────────
function parseRawText(text, config) {
  const delimiter = config.delimiter === '\\t' ? '\t' : (config.delimiter || detectDelimiter(text))
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const skipRows = config.skip_rows ?? (config.has_header ? 1 : 0)

  let headers = []
  if (config.has_header && lines.length > 0) {
    headers = splitLine(lines[0], delimiter, config.quote_char)
  }

  const dataLines = lines.slice(skipRows)

  return dataLines.map(line => {
    const cells = splitLine(line, delimiter, config.quote_char)
    if (config.has_header) {
      const row = {}
      headers.forEach((h, i) => { row[h.trim()] = cells[i] ?? '' })
      return row
    }
    return cells  // return as array if no header
  })
}

function splitLine(line, delimiter, quoteChar = '"') {
  // Handle quoted fields
  const cells = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === quoteChar) {
      inQuotes = !inQuotes
    } else if (char === delimiter && !inQuotes) {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells
}

// ── Apply skip_if rules ───────────────────────────────────────
function shouldSkipRow(row, skipIf = []) {
  for (const rule of skipIf) {
    const val = String(row[rule.col] ?? '').trim()
    if (rule.is_empty && !val) return true
    if (rule.equals !== undefined && val === String(rule.equals)) return true
    if (rule.not_equals !== undefined && val !== String(rule.not_equals)) return true
    if (rule.contains !== undefined && val.includes(String(rule.contains))) return true
  }
  return false
}

// ── Apply value_maps ──────────────────────────────────────────
function applyValueMap(value, field, valueMaps = {}) {
  const map = valueMaps[field]
  if (!map) return value
  const key = String(value ?? '').toLowerCase().trim()
  return map[key] ?? map[String(value ?? '').trim()] ?? value
}

// ── Extract with regex ────────────────────────────────────────
function regexExtract(value, pattern) {
  if (!pattern || !value) return value
  try {
    const match = String(value).match(new RegExp(pattern))
    return match ? (match[1] ?? match[0]) : value
  } catch { return value }
}

// ── Main: run parser against input ───────────────────────────
/**
 * @param {string} rawInput        - Raw text input (paste, CSV content, etc.)
 * @param {Object} parserConfig    - Parser config from DB (config jsonb field)
 * @param {Object} options
 * @param {number} options.previewRows  - If set, only return first N rows (for testing)
 * @returns {{ rows: Object[], errors: Object[], skipped: number }}
 */
export function runParser(rawInput, parserConfig, { previewRows } = {}) {
  const config = parserConfig

  // Parse into raw rows
  const rawRows = parseRawText(rawInput, config)

  const rows = []
  const errors = []
  let skipped = 0

  const processRows = previewRows ? rawRows.slice(0, previewRows) : rawRows

  for (let i = 0; i < processRows.length; i++) {
    const raw = processRows[i]
    const rowErrors = []

    // Skip check
    if (shouldSkipRow(raw, config.skip_if)) {
      skipped++
      continue
    }

    const mapped = {}

    // Apply mappings
    for (const mapping of config.mappings ?? []) {
      const sourceKey = mapping.source_col
      let rawValue

      // Support column index or name
      if (typeof sourceKey === 'number') {
        rawValue = Array.isArray(raw) ? raw[sourceKey] : Object.values(raw)[sourceKey]
      } else {
        rawValue = raw[sourceKey]
      }

      // Required check
      if (mapping.required && (rawValue === undefined || rawValue === null || String(rawValue).trim() === '')) {
        if (mapping.default_value !== undefined && mapping.default_value !== null) {
          rawValue = mapping.default_value
        } else {
          rowErrors.push(`Row ${i + 1}: required field "${sourceKey}" is empty`)
          continue
        }
      }

      // Use default if empty
      if ((rawValue === undefined || rawValue === null || String(rawValue).trim() === '') && mapping.default_value != null) {
        rawValue = mapping.default_value
      }

      // Regex extract
      if (mapping.regex_extract) {
        rawValue = regexExtract(rawValue, mapping.regex_extract)
      }

      // Transform
      let value = applyTransform(rawValue, mapping.transform)

      // Value map
      value = applyValueMap(value, mapping.target_field, config.value_maps)

      mapped[mapping.target_field] = value || null
    }

    if (rowErrors.length) {
      errors.push(...rowErrors)
    }

    if (Object.keys(mapped).length > 0) {
      rows.push(mapped)
    }
  }

  return { rows, errors, skipped, total: rawRows.length }
}

// ── Detect headers from sample input ─────────────────────────
export function detectHeaders(rawInput, config = {}) {
  const delimiter = config.delimiter === '\\t' ? '\t' : (config.delimiter || detectDelimiter(rawInput))
  const lines = rawInput.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return []
  return splitLine(lines[0], delimiter, config.quote_char ?? '"').map(h => h.trim())
}

// ── Get sample rows ───────────────────────────────────────────
export function getSampleRows(rawInput, config = {}, count = 3) {
  const delimiter = config.delimiter === '\\t' ? '\t' : (config.delimiter || detectDelimiter(rawInput))
  const lines = rawInput.split(/\r?\n/).filter(l => l.trim())
  const skip = config.skip_rows ?? 1
  return lines.slice(skip, skip + count).map(l =>
    splitLine(l, delimiter, config.quote_char ?? '"')
  )
}

// ── Available target fields ───────────────────────────────────
export const TARGET_FIELDS = {
  sites: [
    { key: 'code',            label: 'Site Code',       required: true },
    { key: 'branch_name',     label: 'Branch Name',     required: true },
    { key: 'address',         label: 'Address' },
    { key: 'city',            label: 'City' },
    { key: 'state',           label: 'State' },
    { key: 'zip',             label: 'ZIP' },
    { key: 'assigned_tech',   label: 'Assigned Tech' },
    { key: 'scheduled_start', label: 'Scheduled Start' },
    { key: 'scheduled_end',   label: 'Scheduled End' },
    { key: 'status',          label: 'Status' },
    { key: 'notes',           label: 'Notes' },
  ],
  work_orders: [
    { key: 'fn_wo_id',    label: 'FN Work Order ID', required: true },
    { key: 'title',       label: 'Title',            required: true },
    { key: 'status',      label: 'Status' },
    { key: 'pay_type',    label: 'Pay Type' },
    { key: 'budget',      label: 'Budget' },
    { key: 'hourly_rate', label: 'Hourly Rate' },
    { key: 'assigned_tech', label: 'Provider / Tech' },
  ],
  assignments: [
    { key: 'provider_id',   label: 'Provider ID',   required: true },
    { key: 'provider_name', label: 'Provider Name' },
    { key: 'status',        label: 'Status' },
  ],
}

export const TRANSFORM_OPTIONS = [
  { value: '',         label: 'None' },
  { value: 'trim',     label: 'Trim whitespace' },
  { value: 'upper',    label: 'UPPERCASE' },
  { value: 'lower',    label: 'lowercase' },
  { value: 'phone',    label: 'Format phone (+1XXXXXXXXXX)' },
  { value: 'date',     label: 'Parse date → YYYY-MM-DD' },
  { value: 'currency', label: 'Parse currency → number' },
  { value: 'integer',  label: 'Parse integer' },
]
