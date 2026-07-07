/**
 * GET    /api/docgen/uploads/[projectId]          — list uploads for a project
 * DELETE /api/docgen/uploads/[projectId]?upload_id — delete one upload
 */

import { withSecurity } from '../../_lib/middleware.js'
import { supa } from '../../_lib/db.js'

async function handler(req, res) {
  const projectId = req.query?.projectId
  if (!projectId) return res.status(400).json({ message: 'projectId is required' })

  if (req.method === 'GET') {
    const { data, error } = await supa.from('docgen_uploads')
      .select('id, project_id, file_type, original_filename, parsed_data, created_at')
      .eq('project_id', projectId)
      .order('created_at')
    if (error) return res.status(500).json({ message: error.message })
    return res.json(data ?? [])
  }

  if (req.method === 'DELETE') {
    const uploadId = req.query?.upload_id
    if (!uploadId) return res.status(400).json({ message: 'upload_id is required' })
    const { error } = await supa.from('docgen_uploads')
      .delete().eq('id', uploadId).eq('project_id', projectId)
    if (error) return res.status(500).json({ message: error.message })
    return res.status(204).end()
  }

  return res.status(405).json({ message: 'Method not allowed' })
}

export default withSecurity(handler)
