/**
 * GET /api/docgen/documents/[id]/download — render the stored document as DOCX
 */

import { withSecurity } from '../../../_lib/middleware.js'
import { supa } from '../../../_lib/db.js'
import { renderDocx } from '../../_lib/renderer.js'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })

  const id = req.query?.id
  if (!id) return res.status(400).json({ message: 'id is required' })

  const { data: doc, error } = await supa.from('documents').select('*').eq('id', id).single()
  if (error) return res.status(500).json({ message: error.message })
  if (!doc) return res.status(404).json({ message: 'Document not found' })

  try {
    const buffer = await renderDocx(doc.schema_data ?? {})
    const filename = `${(doc.doc_type ?? 'Document').replace(/ /g, '_')}_${id}.docx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', buffer.byteLength)
    return res.end(Buffer.from(buffer))
  } catch (e) {
    console.error('[docgen/download] DOCX render failed:', e)
    return res.status(500).json({ message: e.message ?? 'DOCX generation failed' })
  }
}

export default withSecurity(handler)
