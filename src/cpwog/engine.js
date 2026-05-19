// ── WO Type definitions ────────────────────────────────────────
export const WO_TYPES = {
  LVL: { label: 'LVL — Low Voltage Lead',         siteIdSuffix: 'LVL(1)', numTechs: 1, numDays: 3, useBundle: true  },
  LVT: { label: 'LVT — Low Voltage Tech',          siteIdSuffix: 'LVT',    numTechs: 3, numDays: 3, useBundle: true  },
  DEL: { label: 'DEL — Delivery/Install',          siteIdSuffix: 'DEL',    numTechs: 1, numDays: 1, useBundle: false },
  BRK: { label: 'BRK — Backerboard Creation',      siteIdSuffix: 'BRK',    numTechs: 1, numDays: 1, useBundle: false },
  INT: { label: 'INT — Installation Technician',   siteIdSuffix: 'INT',    numTechs: 1, numDays: 1, useBundle: true  },
  INL: { label: 'INL — Installation Lead',         siteIdSuffix: 'INL',    numTechs: 1, numDays: 1, useBundle: true  },
}

const BLANK_CFG = {
  templateId: '', startTime: '', defaultDate: '', techType: '',
  numTechs: '1', numDays: '1', budgetTech: '', payRate: '',
  approxHours: '', country: '', payType: 'Fixed',
}

export const WO_DEFAULTS = {
  LVL: { ...BLANK_CFG, templateId: '103095' },
  LVT: { ...BLANK_CFG, templateId: '103094' },
  DEL: { ...BLANK_CFG, templateId: '102221' },
  BRK: { ...BLANK_CFG, templateId: '102222' },
  INT: { ...BLANK_CFG, templateId: '103096' },
  INL: { ...BLANK_CFG, templateId: '103097' },
}

export const WO_HEADERS = [
  'Template Id', 'Project ID', 'Site ID', 'Bundle (by Number)',
  'Address #1', 'Address #2', 'City', 'State', 'ZIP / Postal Code', 'Country',
  'Type', 'Scheduled Start Date', 'Scheduled End Date',
  'Scheduled Start Time', 'Scheduled End Time', 'Tech \nType', 'Tech Name',
  'Route To Provider (ID)', 'Budget (Tech)', 'Budget (Travel)', 'Max Budget',
  'Pay Rate', 'Additional Charges', 'Devices', 'EST Hours', 'Size',
  'Approximate Hours to Complete', 'Estimated Duration', 'Pay Type',
  'Location Display Name', 'Location Name',
]

// ── Site columns for the manual entry table ───────────────────
export const SITE_COLS = [
  { key: 'code',       label: 'Bldg Code',    width: 88,  ph: 'FB1A' },
  { key: 'branchName', label: 'Branch Name',  width: 160, ph: 'Cascade Branch' },
  { key: 'address',    label: 'Address *',    width: 185, ph: '2 N Cascade Ave' },
  { key: 'address2',   label: 'Suite/Floor',  width: 90,  ph: 'Ste 100' },
  { key: 'city',       label: 'City *',       width: 120, ph: 'Colorado Springs' },
  { key: 'state',      label: 'ST *',         width: 46,  ph: 'CO' },
  { key: 'zip',        label: 'ZIP *',        width: 70,  ph: '80903' },
  { key: 'date',       label: 'Start Date *', width: 128, ph: '', type: 'date' },
  { key: 'numTechs',   label: 'Techs',        width: 52,  ph: '↓' },
  { key: 'numDays',    label: 'Days',         width: 52,  ph: '↓' },
  { key: 'budgetTech', label: 'Budget $',     width: 76,  ph: '↓' },
  { key: 'payRate',    label: 'Pay $',        width: 76,  ph: '↓' },
]

export const EMPTY_SITE = () => ({
  code: '', branchName: '', address: '', address2: '',
  city: '', state: '', zip: '', date: '',
  numTechs: '', numDays: '', budgetTech: '', payRate: '',
  routeToTechs: [], verified: null, verifying: false, verifyError: '',
})

// ── Row builder ────────────────────────────────────────────────
function addDays(dateStr, n) {
  if (!dateStr?.trim()) return ''
  const d = new Date(dateStr + 'T12:00:00')
  if (isNaN(d.getTime())) return dateStr
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function makeRow({ templateId, projectId, siteId, bundle, site, date, startTime, techType, budgetTech, maxBudget, payRate, approxHours, estDuration, country, locName, payType, routeTo }) {
  return [
    templateId, projectId, siteId, bundle,
    site.address, site.address2 || '', site.city, site.state, site.zip,
    country, '', date, '', startTime, '',
    techType, '', routeTo || '',
    budgetTech, '', maxBudget, payRate,
    '', '', '', '', approxHours, estDuration, payType || 'Fixed',
    locName, locName,
  ]
}

export function buildRows(site, projectId, displayName, woType, cfg, allTypes = WO_TYPES) {
  const locPrefix = displayName?.trim() || projectId
  const meta = allTypes[woType] || WO_TYPES[woType] || { siteIdSuffix: woType, numTechs: 1, numDays: 1, useBundle: false }
  const rows = []
  const tId = Number(cfg.templateId)
  const cfgBudget = Number(cfg.budgetTech)
  const cfgPay    = Number(cfg.payRate)
  const hours     = Number(cfg.approxHours)
  const numTechs  = Number(site.numTechs || cfg.numTechs) || 1
  const numDays   = Number(site.numDays  || cfg.numDays)  || 1
  const budget    = site.budgetTech ? Number(site.budgetTech) : cfgBudget
  const pay       = site.payRate    ? Number(site.payRate)    : cfgPay

  if (numTechs > 1) {
    for (let t = 1; t <= numTechs; t++) {
      for (let d = 0; d < numDays; d++) {
        const date   = addDays(site.date, d)
        const siteId = `${site.code}-${meta.siteIdSuffix}(${t})`
        const locName = `${locPrefix}-${siteId}-${site.city}, ${site.state}`
        rows.push(makeRow({ templateId: tId, projectId, siteId, bundle: meta.useBundle ? siteId : '', site, date, startTime: cfg.startTime, techType: `${cfg.techType} ${t}`, budgetTech: budget, maxBudget: budget, payRate: pay, approxHours: hours, estDuration: hours, country: cfg.country, locName, payType: cfg.payType || 'Fixed', routeTo: (site.routeToTechs || [])[t - 1] || '' }))
      }
    }
  } else {
    for (let d = 0; d < numDays; d++) {
      const date   = addDays(site.date, d)
      const siteId = `${site.code}-${meta.siteIdSuffix}`
      const locName = `${locPrefix}-${siteId}-${site.city}, ${site.state}`
      rows.push(makeRow({ templateId: tId, projectId, siteId, bundle: meta.useBundle ? siteId : '', site, date, startTime: cfg.startTime, techType: cfg.techType, budgetTech: budget, maxBudget: budget, payRate: pay, approxHours: hours, estDuration: hours, country: cfg.country, locName, payType: cfg.payType || 'Fixed', routeTo: (site.routeToTechs || [])[0] || '' }))
    }
    if (numDays > 1) rows.push([])
  }
  return rows
}

// ── CSV export ─────────────────────────────────────────────────
export function toCSV(headers, rows) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.map(escape).join(',')]
  for (const row of rows) {
    if (row.length === 0) { lines.push(''); continue }
    lines.push(row.map(escape).join(','))
  }
  return lines.join('\r\n')
}

// ── Gzip compression for job history ──────────────────────────
export async function compressString(str) {
  const stream = new CompressionStream('gzip')
  const writer = stream.writable.getWriter()
  writer.write(new TextEncoder().encode(str))
  writer.close()
  const chunks = []
  const reader = stream.readable.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total  = chunks.reduce((n, c) => n + c.length, 0)
  const merged = new Uint8Array(total)
  let offset   = 0
  for (const c of chunks) { merged.set(c, offset); offset += c.length }
  let binary = ''
  for (let i = 0; i < merged.length; i++) binary += String.fromCharCode(merged[i])
  return btoa(binary)
}

export async function decompressString(b64) {
  const binary = atob(b64)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const stream = new DecompressionStream('gzip')
  const writer = stream.writable.getWriter()
  writer.write(bytes)
  writer.close()
  const chunks = []
  const reader = stream.readable.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total  = chunks.reduce((n, c) => n + c.length, 0)
  const merged = new Uint8Array(total)
  let offset   = 0
  for (const c of chunks) { merged.set(c, offset); offset += c.length }
  return new TextDecoder().decode(merged)
}

// ── Helpers ────────────────────────────────────────────────────
export function rowComplete(s) {
  return !!(s.code && s.address && s.city && s.state && s.zip && s.date)
}

export function isPastDate(dateStr) {
  if (!dateStr) return false
  const d = new Date(dateStr + 'T12:00:00')
  if (isNaN(d)) return false
  const today = new Date(); today.setHours(0,0,0,0)
  return d < today
}

export function triggerDownload(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.style.display = 'none'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
