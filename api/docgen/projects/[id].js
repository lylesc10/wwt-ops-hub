/**
 * GET    /api/docgen/projects/[id] — get one project
 * PATCH  /api/docgen/projects/[id] — update project fields
 * DELETE /api/docgen/projects/[id] — delete project (cascades uploads/responses/documents)
 */

import { withSecurity } from '../../_lib/middleware.js'
import { supa } from '../../_lib/db.js'

async function handler(req, res) {
  const id = req.query?.id
  if (!id) return res.status(400).json({ message: 'id is required' })

  if (req.method === 'GET') {
    const { data, error } = await supa.from('docgen_projects').select('*').eq('id', id).single()
    if (error) return res.status(500).json({ message: error.message })
    if (!data) return res.status(404).json({ message: 'Project not found' })
    return res.json(data)
  }

  if (req.method === 'PATCH') {
    const allowed = ['name', 'customer', 'practice_area', 'site_address', 'pm_name']
    const updates = Object.fromEntries(
      Object.entries(req.body ?? {}).filter(([k]) => allowed.includes(k))
    )
    if (!Object.keys(updates).length) return res.status(400).json({ message: 'No valid fields to update' })

    const { data, error } = await supa.from('docgen_projects').update(updates).eq('id', id).select().single()
    if (error) return res.status(500).json({ message: error.message })
    return res.json(data)
  }

  if (req.method === 'DELETE') {
    const { error } = await supa.from('docgen_projects').delete().eq('id', id)
    if (error) return res.status(500).json({ message: error.message })
    return res.status(204).end()
  }

  return res.status(405).json({ message: 'Method not allowed' })
}

export default withSecurity(handler)
