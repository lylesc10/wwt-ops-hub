/**
 * DAB-compatible entity item endpoint (see api/_lib/entity.js):
 *   GET    /api/{table}/id/{pk} → { value: [row] }
 *   PATCH  /api/{table}/id/{pk} → { value: [row] }
 *   DELETE /api/{table}/id/{pk} → 204
 */

import { withSecurity } from '../../_lib/middleware.js'
import { resolveTable, entitySelect, entityUpdate, entityDelete } from '../../_lib/entity.js'
import { logError } from '../../_lib/log.js'

async function handler(req, res) {
  const entity = await resolveTable(req.query?.table)
  if (!entity) return res.status(404).json({ message: `Unknown entity: ${req.query?.table}` })

  const id = req.query?.id
  if (!id) return res.status(400).json({ message: 'id is required' })

  try {
    if (req.method === 'GET') {
      const rows = await entitySelect(entity, { $filter: `id eq '${String(id).replace(/'/g, "''")}'` })
      if (!rows.length) return res.status(404).json({ message: 'Not found' })
      return res.json({ value: rows })
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const row = await entityUpdate(entity, id, req.body)
      if (!row) return res.status(404).json({ message: 'Not found' })
      return res.json({ value: [row] })
    }

    if (req.method === 'DELETE') {
      await entityDelete(entity, id)
      return res.status(204).end()
    }

    return res.status(405).json({ message: 'Method not allowed' })
  } catch (e) {
    const status = /Unknown column|Unsupported|Invalid|No valid columns/.test(e.message) ? 400 : 500
    if (status === 500) logError(`[entity/${entity.table}]`, e.message)
    return res.status(status).json({ message: e.message })
  }
}

export default withSecurity(handler)
