/**
 * DAB-compatible entity collection endpoint (see api/_lib/entity.js):
 *   GET  /api/{table}?$filter=&$select=&$orderby=&$first=  → { value: [...] }
 *   POST /api/{table}                                       → { value: [row] }
 *
 * Serves the src/lib/dab.js client without a Data API Builder deployment.
 * Named handler routes (e.g. /api/docgen/*, /api/auth/*) take precedence —
 * this only catches bare single-segment table paths.
 */

import { withSecurity } from '../_lib/middleware.js'
import { resolveTable, entitySelect, entityInsert } from '../_lib/entity.js'

async function handler(req, res) {
  const entity = await resolveTable(req.query?.table)
  if (!entity) return res.status(404).json({ message: `Unknown entity: ${req.query?.table}` })

  try {
    if (req.method === 'GET') {
      const rows = await entitySelect(entity, {
        $filter:  req.query?.$filter,
        $select:  req.query?.$select,
        $orderby: req.query?.$orderby,
        $first:   req.query?.$first,
      })
      return res.json({ value: rows })
    }

    if (req.method === 'POST') {
      const row = await entityInsert(entity, req.body)
      return res.status(201).json({ value: [row] })
    }

    return res.status(405).json({ message: 'Method not allowed' })
  } catch (e) {
    const status = /Unknown column|Unsupported|Invalid|No valid columns/.test(e.message) ? 400 : 500
    if (status === 500) console.error(`[entity/${entity.table}]`, e.message)
    return res.status(status).json({ message: e.message })
  }
}

export default withSecurity(handler)
