/**
 * GET    /api/docgen/documents/[id] — fetch one document (polled during generation)
 * PATCH  /api/docgen/documents/[id] — update { schema_data, title?, status? }
 * DELETE /api/docgen/documents/[id] — delete
 */

import { withSecurity } from '../../_lib/middleware.js'
import { supa } from '../../_lib/db.js'

async function handler(req, res) {
  const id = req.query?.id
  if (!id) return res.status(400).json({ message: 'id is required' })

  if (req.method === 'GET') {
    const { data, error } = await supa.from('documents').select('*').eq('id', id).single()
    if (error) return res.status(500).json({ message: error.message })
    if (!data) return res.status(404).json({ message: 'Document not found' })
    return res.json(data)
  }

  if (req.method === 'PATCH') {
    const { schema_data, title, status } = req.body ?? {}
    const updates = {}
    if (schema_data !== undefined) {
      updates.schema_data = schema_data
      if (schema_data?.title) updates.title = schema_data.title
    }
    if (title !== undefined) updates.title = title
    if (status !== undefined) {
      if (!['generating', 'draft', 'in_review', 'approved'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' })
      }
      updates.status = status
    }
    if (!Object.keys(updates).length) return res.status(400).json({ message: 'Nothing to update' })

    const { data, error } = await supa.from('documents').update(updates).eq('id', id).select().single()
    if (error) return res.status(500).json({ message: error.message })
    if (!data) return res.status(404).json({ message: 'Document not found' })
    return res.json(data)
  }

  if (req.method === 'DELETE') {
    const { error } = await supa.from('documents').delete().eq('id', id)
    if (error) return res.status(500).json({ message: error.message })
    return res.status(204).end()
  }

  return res.status(405).json({ message: 'Method not allowed' })
}

export default withSecurity(handler)
