/**
 * All paste format parsers from CPWOG src/App.jsx
 * Supports Formats 1-9 including services sheet variants
 */

function parseDate(raw, fallback = '') {
  if (!raw?.trim()) return fallback
  const mdyMatch = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (mdyMatch) {
    let [, m, d, y] = mdyMatch
    if (y.length === 2) y = '20' + y
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  const dt = new Date(raw)
  return !isNaN(dt) ? dt.toISOString().split('T')[0] : fallback
}

// Collapse quoted multiline fields (handles services sheet)
function collapseQuotedLines(raw) {
  const result = []
  let current  = ''
  let inQuote  = false
  for (const ch of raw) {
    if (ch === '"') { inQuote = !inQuote; current += ch }
    else if (ch === '\n' && inQuote) { current += ' ' }
    else if (ch === '\n' && !inQuote) { result.push(current); current = '' }
    else { current += ch }
  }
  if (current.trim()) result.push(current)
  return result
}

const HEADER_WORDS = ['code','name','address','city','state','zip','branch','building','date','site','location']

function isHeaderRow(row) {
  if (!row.length) return false
  const first = (row[0] || '').trim().toLowerCase()
  if (/^[a-z]{1,4}\d/.test(first)) return false
  const labelLike = row.filter(h => h.trim()).every(h => /^[a-zA-Z\s]+$/.test(h.trim()))
  const hasKnownLabel = row.some(h => HEADER_WORDS.includes(h.trim().toLowerCase()))
  return labelLike && hasKnownLabel
}

/**
 * Main paste parser — detects format and returns array of site objects
 * @param {string} pasteText
 * @param {Object} defaults - { numTechs, numDays, defaultDate }
 * @returns {{ sites: Array, error: string|null }}
 */
export function parsePaste(pasteText, defaults = {}) {
  if (!pasteText?.trim()) return { sites: [], error: 'Nothing pasted yet.' }

  const siteDefaults = {
    numTechs: defaults.numTechs || '1',
    numDays:  defaults.numDays  || '1',
    verified: null, verifying: false, verifyError: '',
  }

  const fallbackDate = defaults.defaultDate || ''

  const rawLines = collapseQuotedLines(pasteText.trim()).filter(l => l.trim())
  if (!rawLines.length) return { sites: [], error: 'No data rows found.' }

  // ── Format 9: 3-line blocks (code / date / address,city,ST zip) ──
  const isFormat9 = (() => {
    if (rawLines.length < 3) return false
    const l0 = rawLines[0].trim()
    const l1 = rawLines[1].trim()
    const isBarCode  = /^[A-Z0-9]{2,8}$/.test(l0)
    const isDateLike = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(l1) || /^\d{4}-\d{2}-\d{2}$/.test(l1)
    return isBarCode && isDateLike
  })()

  if (isFormat9) {
    const sites = []
    for (let i = 0; i + 2 < rawLines.length; i += 3) {
      const code    = rawLines[i].trim()
      const date    = parseDate(rawLines[i + 1].trim(), fallbackDate)
      const addrStr = rawLines[i + 2].trim()
      const parts   = addrStr.split(',').map(p => p.trim())
      let address = parts[0] || ''
      let city    = parts[1] || ''
      let state = '', zip = ''
      const stateZip = parts[2] || ''
      const svMatch  = stateZip.match(/^([A-Z]{2})\s+(\d{5}(-\d{4})?)$/)
      if (svMatch) { state = svMatch[1]; zip = svMatch[2] }
      else { state = stateZip; zip = parts[3] || '' }
      sites.push({ code, branchName: '', address, address2: '', city, state, zip, date, ...siteDefaults })
    }
    if (!sites.length) return { sites: [], error: 'Could not parse Format 9 blocks.' }
    return { sites, error: null }
  }

  // Detect delimiter
  const delim  = rawLines[0].includes('\t') ? '\t' : ','
  const lines  = rawLines.map(l => l.split(delim).map(c => c.replace(/^"|"$/g, '').trim()))
  const firstRow = lines[0].map(h => h.toLowerCase().replace(/[^a-z]/g, ''))

  const isBuildingFormat = firstRow.some(h => h === 'buildingcode' || h === 'buildingname')

  // ── Services sheet family detection ──────────────────────────
  const isServicesFamily = delim === '\t' && lines.length > 0 && (() => {
    const sample = lines[0]
    const hasQuarter   = sample.some(c => /^\d[HhSs]\d{4}$/.test(c))
    const hasScheduled = sample.some(c => /^scheduled$/i.test(c))
    return (hasQuarter || hasScheduled) && sample.length >= 8
  })()
  const isFormat5 = isServicesFamily && /^\d[HhSs]\d{4}$/.test((lines[0] || [])[2] || '')
  const isServicesFormat = isServicesFamily && !isFormat5

  // ── Format 4: code|branchName|services|quarter|region|addr|city|state|zip|fullAddr|status|date
  if (isServicesFormat) {
    const dataLines = isHeaderRow(lines[0]) ? lines.slice(1) : lines
    const sites = dataLines.map(cols => {
      let address = cols[5] || '', city = cols[6] || '', state = cols[7] || '', zip = cols[8] || ''
      let date = parseDate(cols[11] || '', fallbackDate)
      if (!/^\d{5}(-\d{4})?$/.test(zip)) {
        for (let ci = 5; ci < cols.length; ci++) {
          if (/^\d{5}(-\d{4})?$/.test(cols[ci])) {
            zip = cols[ci]; state = cols[ci-1] || state; city = cols[ci-2] || city; address = cols[ci-3] || address
            const lastDate = [...cols].reverse().find(c => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(c))
            if (lastDate) date = parseDate(lastDate, fallbackDate)
            break
          }
        }
      }
      return { code: cols[0] || '', branchName: cols[1] || '', address, address2: '', city, state, zip, date, ...siteDefaults }
    })
    const valid = sites.filter(s => s.code || s.address)
    if (!valid.length) return { sites: [], error: 'No rows parsed from Format 4 paste.' }
    return { sites: valid, error: null }
  }

  // ── Format 5: code|branchName|quarter|region|addr|city|state|zip|fullAddr|bool|status|date
  if (isFormat5) {
    const dataLines = isHeaderRow(lines[0]) ? lines.slice(1) : lines
    const sites = dataLines.map(cols => {
      let address = cols[4] || '', city = cols[5] || '', state = cols[6] || '', zip = cols[7] || ''
      let date = parseDate(cols[11] || '', fallbackDate)
      if (!/^\d{5}(-\d{4})?$/.test(zip)) {
        for (let ci = 4; ci < cols.length; ci++) {
          if (/^\d{5}(-\d{4})?$/.test(cols[ci])) {
            zip = cols[ci]; state = cols[ci-1] || state; city = cols[ci-2] || city; address = cols[ci-3] || address
            const lastDate = [...cols].reverse().find(c => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(c))
            if (lastDate) date = parseDate(lastDate, fallbackDate)
            break
          }
        }
      }
      return { code: cols[0] || '', branchName: cols[1] || '', address, address2: '', city, state, zip, date, ...siteDefaults }
    })
    const valid = sites.filter(s => s.code || s.address)
    if (!valid.length) return { sites: [], error: 'No rows parsed from Format 5 paste.' }
    return { sites: valid, error: null }
  }

  // ── Format 2 (tab, headers): buildingcode, buildingname, address, city, state, zip
  if (isBuildingFormat) {
    const headers = firstRow
    const idx = (name) => headers.findIndex(h => h === name || h.includes(name))
    const iCode = idx('buildingcode'), iName = idx('buildingname')
    const iAddr = idx('address'), iCity = idx('city'), iState = idx('state'), iZip = idx('zip'), iDate = idx('date')
    const sites = lines.slice(1).map(cols => ({
      code:       iCode  >= 0 ? cols[iCode]  : '',
      branchName: iName  >= 0 ? cols[iName]  : '',
      address:    iAddr  >= 0 ? cols[iAddr]  : '',
      address2:   '',
      city:       iCity  >= 0 ? cols[iCity]  : '',
      state:      iState >= 0 ? cols[iState] : '',
      zip:        iZip   >= 0 ? cols[iZip]   : '',
      date:       parseDate(iDate >= 0 ? cols[iDate] : '', fallbackDate),
      ...siteDefaults
    }))
    const valid = sites.filter(s => s.code || s.address)
    if (!valid.length) return { sites: [], error: 'No rows parsed from building format.' }
    return { sites: valid, error: null }
  }

  // ── Comma-delimited formats ───────────────────────────────────
  if (delim === ',') {
    const firstCommaCol = (lines[0] || [])[0] || ''
    const isFormat8 = /^[A-Z0-9]{2,6}\s+\S/.test(firstCommaCol.trim())

    if (isFormat8) {
      const sites = lines.map(cols => {
        const full = cols.join(',')
        const codeMatch = full.match(/^([A-Z0-9]{2,6})\s+(.*)/)
        if (!codeMatch) return null
        const code = codeMatch[1]
        const rest = codeMatch[2]
        const parts = rest.split(',').map(p => p.trim())
        const lastPart = parts[parts.length - 1] || ''
        const svMatch  = lastPart.match(/^([A-Z]{2})\s+(\d{5}(-\d{4})?)$/)
        let state = '', zip = ''
        if (svMatch) { state = svMatch[1]; zip = svMatch[2] }
        else { state = lastPart }
        const city      = parts[parts.length - 2] || ''
        const firstPart = parts[0] || ''
        const streetMatch = firstPart.match(/^(.*?)\s+(\d+\s+.+)$/)
        const branchName = streetMatch ? streetMatch[1].trim() : ''
        const address    = streetMatch ? streetMatch[2].trim() : firstPart
        return { code, branchName, address, address2: '', city, state, zip, date: parseDate('', fallbackDate), ...siteDefaults }
      }).filter(Boolean)
      const valid = sites.filter(s => s.code || s.address)
      if (!valid.length) return { sites: [], error: 'No rows parsed from Format 8.' }
      return { sites: valid, error: null }
    }

    // Format 3: code, name, address, city, state zip (or separate)
    const sites = lines.map(cols => {
      const last = cols[cols.length - 1] || ''
      const stateZipMatch = last.match(/^([A-Z]{2})\s+(\d{5}(-\d{4})?)$/)
      if (stateZipMatch) {
        return { code: cols[0] || '', branchName: cols[1] || '', address: cols[2] || '', address2: '', city: cols[3] || '', state: stateZipMatch[1], zip: stateZipMatch[2], date: parseDate('', fallbackDate), ...siteDefaults }
      }
      return { code: cols[0] || '', branchName: cols[1] || '', address: cols[2] || '', address2: '', city: cols[3] || '', state: cols[4] || '', zip: cols[5] || '', date: parseDate('', fallbackDate), ...siteDefaults }
    })
    const valid = sites.filter(s => s.code || s.address)
    if (!valid.length) return { sites: [], error: 'No rows parsed from CSV paste.' }
    return { sites: valid, error: null }
  }

  // ── Tab-delimited formats ─────────────────────────────────────
  const dataLines = isHeaderRow(lines[0]) ? lines.slice(1) : lines
  const isFormat6  = /^(true|false)$/i.test((dataLines[0] || [])[2] || '')
  const isFormat7  = !isFormat6 && (dataLines[0] || []).length <= 3 && (dataLines[0] || []).length >= 2 && ((dataLines[0] || [])[dataLines[0].length - 1] || '').includes(',')
  const isCompact  = !isFormat6 && !isFormat7 && dataLines.length > 0 && dataLines[0].length <= 9

  // Format 7: code | [date | branchName |] "address, city, ST zip"
  if (isFormat7) {
    const sites = dataLines.map(cols => {
      const addrCol = cols[cols.length - 1] || ''
      const col1    = cols.length === 3 ? (cols[1] || '') : ''
      const col1IsDate = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(col1.trim()) || /^\d{4}-\d{2}-\d{2}$/.test(col1.trim())
      const branchName = col1IsDate ? '' : col1
      const dateVal    = col1IsDate ? parseDate(col1, fallbackDate) : fallbackDate
      const parts  = addrCol.split(',').map(p => p.trim())
      let address  = parts[0] || '', city = parts[1] || '', state = '', zip = ''
      const stateZip = parts[2] || ''
      const svMatch  = stateZip.match(/^([A-Z]{2})\s+(\d{5}(-\d{4})?)$/)
      if (svMatch) { state = svMatch[1]; zip = svMatch[2] }
      else { state = stateZip; zip = parts[3] || '' }
      return { code: cols[0] || '', branchName, address, address2: '', city, state, zip, date: dateVal, ...siteDefaults }
    })
    const valid = sites.filter(s => s.code || s.address)
    if (!valid.length) return { sites: [], error: 'No rows parsed from Format 7.' }
    return { sites: valid, error: null }
  }

  // Format 6: code | branchName | bool | ... | addr | city | state | zip | ... | date
  if (isFormat6) {
    const sites = dataLines.map(cols => ({
      code: cols[0] || '', branchName: cols[1] || '',
      address: cols[4] || '', address2: '', city: cols[5] || '',
      state: cols[6] || '', zip: cols[7] || '',
      date: parseDate(cols[9] || '', fallbackDate), ...siteDefaults
    }))
    const valid = sites.filter(s => s.code || s.address)
    if (!valid.length) return { sites: [], error: 'No rows parsed from Format 6.' }
    return { sites: valid, error: null }
  }

  // Format 3b (compact tab, 6-9 cols): code, name, address, city, state, zip[, budget[, payRate[, date]]]
  if (isCompact) {
    const sites = dataLines.map(cols => ({
      code:       cols[0] || '', branchName: cols[1] || '',
      address:    cols[2] || '', address2: '', city: cols[3] || '',
      state:      cols[4] || '', zip: cols[5] || '',
      budgetTech: cols[6] || '',
      payRate:    cols[7] || '',
      date:       parseDate(cols[8] || '', fallbackDate),
      ...siteDefaults
    }))
    const valid = sites.filter(s => s.code || s.address)
    if (!valid.length) return { sites: [], error: 'No rows parsed from compact format.' }
    return { sites: valid, error: null }
  }

  // Format 1 (original SiteList tab, 12+ cols): col 0,1,4,5,6,7,11
  const sites = dataLines.map(cols => ({
    code: cols[0] || '', branchName: cols[1] || '',
    address: cols[4] || '', address2: '', city: cols[5] || '',
    state: cols[6] || '', zip: cols[7] || '',
    date: parseDate(cols[11] || '', fallbackDate), ...siteDefaults
  }))
  const valid = sites.filter(s => s.code || s.address)
  if (!valid.length) return { sites: [], error: 'Could not parse any rows. Make sure you copied headers too.' }
  return { sites: valid, error: null }
}

// ── CSV re-import parser ───────────────────────────────────────
export function parseCSVImport(text, defaults = {}) {
  const lines = text.trim().split('\n').map(l => {
    const cols = []; let cur = '', inQ = false
    for (let i = 0; i < l.length; i++) {
      const ch = l[i]
      if (ch === '"' && !inQ)  { inQ = true }
      else if (ch === '"' && inQ && l[i+1] === '"') { cur += '"'; i++ }
      else if (ch === '"' && inQ) { inQ = false }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
      else { cur += ch }
    }
    cols.push(cur.trim())
    return cols
  })

  const dataLines = lines.slice(1).filter(cols => cols.length > 10 && cols[2])
  const getBaseCode = (siteId) => siteId.replace(/-[A-Z]+.*$/, '').trim()
  const seen = new Set()
  const unique = dataLines.filter(cols => {
    const base = getBaseCode(cols[2] || '')
    if (!base || seen.has(base)) return false
    seen.add(base); return true
  })

  if (!unique.length) return { sites: [], error: 'No valid site rows found in this CSV.' }

  const siteDefaults = { numTechs: defaults.numTechs || '1', numDays: defaults.numDays || '1', verified: null, verifying: false, verifyError: '' }
  const sites = unique.map(cols => ({
    code:       getBaseCode(cols[2] || ''),
    branchName: '',
    address:    cols[4]  || '',
    address2:   cols[5]  || '',
    city:       cols[6]  || '',
    state:      cols[7]  || '',
    zip:        cols[8]  || '',
    date:       cols[11] || defaults.defaultDate || '',
    ...siteDefaults
  }))
  return { sites, error: null }
}
