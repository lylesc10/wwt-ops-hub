/**
 * /api/smartsheet/sheets/[sheetId].js
 *
 * Vercel serverless proxy for Smartsheet API.
 * Access token stays server-side.
 *
 * GET /api/smartsheet/sheets/:sheetId → returns { rows, columns }
 */

import { logInfo, logError } from '../../_lib/log.js'

const SS_BASE = 'https://api.smartsheet.com/2.0'
const SS_TOKEN = process.env.SMARTSHEET_ACCESS_TOKEN

export default async function handler(req, res) {
  const { sheetId } = req.query

  if (!sheetId) {
    return res.status(400).json({ message: 'sheetId is required' })
  }

  // MOCK mode
  if (!SS_TOKEN) {
    logInfo('[Smartsheet Proxy] No token — returning mock sheet')
    return res.json(getMockSheet(sheetId))
  }

  try {
    const upstream = await fetch(`${SS_BASE}/sheets/${sheetId}`, {
      headers: {
        Authorization: `Bearer ${SS_TOKEN}`,
        Accept: 'application/json',
      },
    })

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}))
      return res.status(upstream.status).json({ message: err.message ?? 'Smartsheet error' })
    }

    const sheet = await upstream.json()

    // Normalize to { rows, columns } for the sync function
    const columns = sheet.columns.map(c => ({ id: c.id, title: c.title, type: c.type }))
    const rows = sheet.rows.map(row => {
      const cells = {}
      row.cells.forEach((cell, i) => {
        const col = columns[i]
        if (col) cells[col.title] = cell.value ?? null
      })
      return {
        rowId:        row.id,
        rowNumber:    row.rowNumber,
        modifiedAt:   row.modifiedAt,
        cells,
      }
    })

    return res.json({ sheetId, rows, columns, totalRows: rows.length })
  } catch (err) {
    logError('[Smartsheet Proxy] Error:', err)
    return res.status(500).json({ message: err.message })
  }
}

// ── Mock data for dev ─────────────────────────────────────────
function getMockSheet(sheetId) {
  const columns = [
    { id: 1, title: 'Site Code',       type: 'TEXT_NUMBER' },
    { id: 2, title: 'Branch Name',     type: 'TEXT_NUMBER' },
    { id: 3, title: 'Address',         type: 'TEXT_NUMBER' },
    { id: 4, title: 'City',            type: 'TEXT_NUMBER' },
    { id: 5, title: 'State',           type: 'TEXT_NUMBER' },
    { id: 6, title: 'ZIP',             type: 'TEXT_NUMBER' },
    { id: 7, title: 'Status',          type: 'TEXT_NUMBER' },
    { id: 8, title: 'Assigned Tech',   type: 'TEXT_NUMBER' },
    { id: 9, title: 'Scheduled Start', type: 'DATE' },
    { id: 10, title: 'Scheduled End',  type: 'DATE' },
  ]

  const mockSites = [
    ['PNC-0001', 'Main & Grant Branch',    '100 Main St',      'Pittsburgh', 'PA', '15201', 'scheduled',   'John T.',    '2026-04-01', '2026-04-03'],
    ['PNC-0002', 'Fifth Avenue Branch',    '500 Fifth Ave',    'Pittsburgh', 'PA', '15219', 'staffed',     'Maria G.',   '2026-04-05', '2026-04-07'],
    ['PNC-0003', 'Shadyside Branch',       '5401 Walnut St',   'Pittsburgh', 'PA', '15232', 'in_progress', 'Carlos R.',  '2026-03-28', '2026-03-30'],
    ['PNC-0004', 'Oakland Branch',         '4100 Forbes Ave',  'Pittsburgh', 'PA', '15213', 'scheduled',   null,         '2026-04-10', '2026-04-12'],
    ['PNC-0005', 'Squirrel Hill Branch',   '2100 Murray Ave',  'Pittsburgh', 'PA', '15217', 'completed',   'James W.',   '2026-03-15', '2026-03-17'],
    ['PNC-0006', 'South Hills Branch',     '3301 Library Rd',  'Pittsburgh', 'PA', '15234', 'scheduled',   null,         '2026-04-14', '2026-04-16'],
    ['PNC-0007', 'North Shore Branch',     '1 Federal St',     'Pittsburgh', 'PA', '15212', 'flagged_date_change', 'Kim L.', '2026-04-08', '2026-04-10'],
    ['PNC-0008', 'East Liberty Branch',    '6301 Penn Ave',    'Pittsburgh', 'PA', '15206', 'staffed',     'Raj P.',     '2026-04-18', '2026-04-20'],
  ]

  const rows = mockSites.map((cells, i) => ({
    rowId:      1000 + i,
    rowNumber:  i + 1,
    modifiedAt: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString(),
    cells: Object.fromEntries(columns.map((c, j) => [c.title, cells[j]])),
  }))

  return { sheetId, rows, columns, totalRows: rows.length, mock: true }
}
