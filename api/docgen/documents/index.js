/**
 * GET /api/docgen/documents?project_id= — list documents (optionally by project)
 */

import { withSecurity } from '../../_lib/middleware.js'
import { supa } from '../../_lib/db.js'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })

  let q = supa.from('documents')
    .select('id, project_id, title, doc_type, status, generation_progress, generation_time_seconds, created_at, updated_at')
    .order('created_at', { ascending: false })
  if (req.query?.project_id) q = q.eq('project_id', req.query.project_id)

  const { data, error } = await q
  if (error) return res.status(500).json({ message: error.message })
  return res.json(data ?? [])
}

export default withSecurity(handler)
