// ── WO Type definitions ────────────────────────────────────────
export const WO_TYPES = {
  LVL: { label: 'LVL — Low Voltage Lead',           siteIdSuffix: 'LVL(1)', numTechs: 1, numDays: 3, useBundle: true  },
  LVT: { label: 'LVT — Low Voltage Tech',            siteIdSuffix: 'LVT',    numTechs: 3, numDays: 3, useBundle: true  },
  DEL: { label: 'DEL — Delivery/Install',            siteIdSuffix: 'DEL',    numTechs: 1, numDays: 1, useBundle: false },
  BRK: { label: 'BRK — Backerboard Creation',        siteIdSuffix: 'BRK',    numTechs: 1, numDays: 1, useBundle: false },
  SDT: { label: 'SDT — Security Device Technician',  siteIdSuffix: 'SDT',    numTechs: 1, numDays: 3, useBundle: true, customBuild: 'SDT' },
  INT: { label: 'INT — Installation Technician',     siteIdSuffix: 'INT',    numTechs: 1, numDays: 1, useBundle: true  },
  INL: { label: 'INL — Installation Lead',           siteIdSuffix: 'INL',    numTechs: 1, numDays: 1, useBundle: true  },
  WRK: { label: 'WRK — Walk In Ready Kit',           siteIdSuffix: 'WRK',    numTechs: 1, numDays: 1, useBundle: false },
}

// Plain-English descriptions for the Guided mode type picker
export const WO_TYPE_DESCRIPTIONS = {
  LVL: 'Main installation lead — manages the site over multiple days',
  LVT: 'Low voltage technicians — multiple techs per site over multiple days',
  DEL: 'Equipment delivery and installation — one tech, one day',
  BRK: 'Backerboard creation — one tech, one day',
  INT: 'Installation technician — one tech, flexible days',
  INL: 'Installation lead — one tech, flexible days',
  WRK: 'Walk-in ready kit — one tech, one day',
  SDT: 'Security device technician — bundled BH/AH schedule over three days',
}

const BLANK_CFG = {
  templateId: '', startTime: '', defaultDate: '', techType: 'Tech',
  numTechs: '1', numDays: '1', budgetTech: '', payRate: '',
  approxHours: '', country: 'US', payType: 'Fixed',
}

export const WO_DEFAULTS = {
  LVL: { ...BLANK_CFG, templateId: '103095' },
  LVT: { ...BLANK_CFG, templateId: '103094' },
  DEL: { ...BLANK_CFG, templateId: '102221' },
  BRK: { ...BLANK_CFG, templateId: '102222' },
  SDT: { ...BLANK_CFG, templateId: '104516' },
  INT: { ...BLANK_CFG, templateId: '103096' },
  INL: { ...BLANK_CFG, templateId: '103097' },
  WRK: { ...BLANK_CFG, templateId: '' },
}

// Default SDT schedule — 3 days of BH/AH slots, user-editable per plan
export const SDT_DEFAULTS = [
  { id: 's1', type: 'AH', day: 1, time: '2:00pm',  hours: 10, budget: 650, numTechs: 1 },
  { id: 's2', type: 'BH', day: 2, time: '11:00am', hours: 8,  budget: 450, numTechs: 2 },
  { id: 's3', type: 'AH', day: 2, time: '4:00pm',  hours: 10, budget: 600, numTechs: 1 },
  { id: 's4', type: 'AH', day: 2, time: '5:00pm',  hours: 9,  budget: 550, numTechs: 1 },
  { id: 's5', type: 'BH', day: 3, time: '11:00am', hours: 8,  budget: 450, numTechs: 2 },
  { id: 's6', type: 'AH', day: 3, time: '4:00pm',  hours: 10, budget: 600, numTechs: 1 },
  { id: 's7', type: 'AH', day: 3, time: '5:00pm',  hours: 9,  budget: 550, numTechs: 1 },
]

export const WO_HEADERS = [
  'Template Id', 'Project ID', 'Site ID', 'Bundle (by Number)',
  'Address #1', 'Address #2', 'City', 'State', 'ZIP / Postal Code', 'Country',
  'Type', 'Scheduled Start Date', 'Scheduled End Date',
  'Scheduled Start Time', 'Scheduled End Time', 'Tech \nType', 'Tech Name',
  'Route To Provider (ID)', 'Budget (Tech)', 'Budget (Travel)', 'Max Budget',
  'Pay Rate', 'Additional Charges', 'Devices', 'EST Hours', 'Size',
  'Approximate Hours to Complete', 'Estimated Duration', 'Pay Type',
  'Location Display Name', 'Location Name', 'Work Order Manager',
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
  { key: 'womId',      label: 'WOM ID',       width: 100, ph: 'WO-12345' },
]

export const EMPTY_SITE = () => ({
  code: '', branchName: '', address: '', address2: '',
  city: '', state: '', zip: '', date: '',
  numTechs: '', numDays: '', budgetTech: '', payRate: '', womId: '',
  routeToTechs: [], verified: null, verifying: false, verifyError: '',
})

// Converts any time format to "H:MMam/pm" as expected by FieldNation CSV
// e.g. "4:30pm", "4:30 PM", "16:30", "16:30:00" all → "4:30pm"
export function normalizeTime(raw) {
  if (!raw || !raw.trim()) return ''
  const s = raw.trim()
  const already = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i)
  if (already) return `${parseInt(already[1])}:${already[2]}${already[3].toLowerCase()}`
  const hourOnly = s.match(/^(\d{1,2})\s*(am|pm)$/i)
  if (hourOnly) return `${parseInt(hourOnly[1])}:00${hourOnly[2].toLowerCase()}`
  const mil = s.match(/^(\d{1,2}):(\d{2})(:\d{2})?$/)
  if (mil) {
    let h = parseInt(mil[1])
    const m = mil[2]
    const suffix = h >= 12 ? 'pm' : 'am'
    if (h > 12) h -= 12
    if (h === 0) h = 12
    return `${h}:${m}${suffix}`
  }
  return s
}

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
    locName, locName, site.womId || '',
  ]
}

// SDT — bundled BH/AH schedule across 3 consecutive days.
// Site IDs run sequential per type/day: CODE-SDT-BH(1), CODE-SDT-BH(2), CODE-SDT-AH(1)…
export function buildSDTRows(site, projectId, displayName, cfg, sdtCfg) {
  const slots = Array.isArray(sdtCfg) && sdtCfg.length ? sdtCfg : SDT_DEFAULTS
  const locPrefix = displayName?.trim() || projectId
  const tId = Number(cfg.templateId) || 104516
  const country = cfg.country || 'US'
  const techType = cfg.techType || 'Tech'
  const payType = cfg.payType || 'Fixed'
  const rows = []

  const dates = [site.date, addDays(site.date, 1), addDays(site.date, 2)]

  for (let day = 1; day <= 3; day++) {
    const counters = {}
    for (const slot of slots.filter((s) => s.day === day)) {
      const n = Number(slot.numTechs) || 1
      for (let t = 0; t < n; t++) {
        counters[slot.type] = (counters[slot.type] || 0) + 1
        const siteId  = `${site.code}-SDT-${slot.type}(${counters[slot.type]})`
        const bundle  = `${site.code}-SDT-${slot.type}`
        const locName = `${locPrefix}-${siteId}-${site.city}, ${site.state}`
        rows.push(makeRow({
          templateId: tId, projectId, siteId, bundle,
          site, date: dates[day - 1], startTime: normalizeTime(slot.time),
          techType, budgetTech: Number(slot.budget), maxBudget: Number(slot.budget),
          payRate: Number(slot.budget), approxHours: Number(slot.hours), estDuration: Number(slot.hours),
          country, locName, payType, routeTo: '',
        }))
      }
    }
  }

  rows.push([])
  return rows
}

export function buildRows(site, projectId, displayName, woType, cfg, allTypes = WO_TYPES, sdtCfg) {
  const meta = allTypes[woType] || WO_TYPES[woType] || { siteIdSuffix: woType, numTechs: 1, numDays: 1, useBundle: false }
  if (woType === 'SDT' || meta.customBuild === 'SDT') {
    return buildSDTRows(site, projectId, displayName, cfg, sdtCfg)
  }
  const locPrefix = displayName?.trim() || projectId
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
        rows.push(makeRow({ templateId: tId, projectId, siteId, bundle: meta.useBundle ? siteId : '', site, date, startTime: normalizeTime(cfg.startTime), techType: cfg.techType, budgetTech: budget, maxBudget: budget, payRate: pay, approxHours: hours, estDuration: hours, country: cfg.country, locName, payType: cfg.payType || 'Fixed', routeTo: (site.routeToTechs || [])[t - 1] || '' }))
      }
    }
  } else {
    for (let d = 0; d < numDays; d++) {
      const date   = addDays(site.date, d)
      const siteId = `${site.code}-${meta.siteIdSuffix}`
      const locName = `${locPrefix}-${siteId}-${site.city}, ${site.state}`
      rows.push(makeRow({ templateId: tId, projectId, siteId, bundle: meta.useBundle ? siteId : '', site, date, startTime: normalizeTime(cfg.startTime), techType: cfg.techType, budgetTech: budget, maxBudget: budget, payRate: pay, approxHours: hours, estDuration: hours, country: cfg.country, locName, payType: cfg.payType || 'Fixed', routeTo: (site.routeToTechs || [])[0] || '' }))
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
