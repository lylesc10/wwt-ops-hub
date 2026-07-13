/**
 * POST /api/docgen/download
 * Body: { schema_data, title? }
 *
 * Renders a schema_data payload directly to DOCX without touching the DB —
 * used by the editor to export unsaved work. The saved-document variant is
 * GET /api/docgen/documents/[id]/download.
 */

import { withSecurity } from '../_lib/middleware.js'
import { renderDocx } from './_lib/renderer.js'
import { logError } from '../_lib/log.js'

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { schema_data, title = 'document' } = req.body ?? {}
  if (!schema_data) return res.status(400).json({ message: 'schema_data is required' })

  try {
    const buffer = await renderDocx(schema_data)
    const safe = (schema_data.title ?? title ?? 'document')
      .replace(/[^a-z0-9_\-. ]/gi, '_').trim().slice(0, 60) || 'document'
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.docx"`)
    res.setHeader('Content-Length', buffer.byteLength)
    return res.end(Buffer.from(buffer))
  } catch (err) {
    logError('[docgen/download] Error:', err)
    return res.status(500).json({ message: err.message ?? 'DOCX generation failed' })
  }
}

export default withSecurity(handler)
