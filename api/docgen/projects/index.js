/**
 * GET  /api/docgen/projects — list projects (with document/upload counts)
 * POST /api/docgen/projects — create a project
 */

import { withSecurity } from '../../_lib/middleware.js'
import { supa, query } from '../../_lib/db.js'

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { rows } = await query(`
        SELECT p.*,
               (SELECT count(*) FROM documents d      WHERE d.project_id = p.id) AS document_count,
               (SELECT count(*) FROM docgen_uploads u WHERE u.project_id = p.id) AS upload_count
        FROM docgen_projects p
        ORDER BY p.created_at DESC
      `)
      return res.json(rows)
    } catch (e) {
      return res.status(500).json({ message: e.message })
    }
  }

  if (req.method === 'POST') {
    const { name, customer, practice_area = 'Network', site_address, pm_name } = req.body ?? {}
    if (!name?.trim()) return res.status(400).json({ message: 'name is required' })

    const { data, error } = await supa.from('docgen_projects').insert({
      name: name.trim(),
      customer: customer ?? null,
      practice_area,
      site_address: site_address ?? null,
      pm_name: pm_name ?? null,
    }).select().single()

    if (error) return res.status(500).json({ message: error.message })
    return res.status(201).json(data)
  }

  return res.status(405).json({ message: 'Method not allowed' })
}

export default withSecurity(handler)
