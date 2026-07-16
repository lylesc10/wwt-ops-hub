/**
 * POST /api/docgen/upload
 * Body: { project_id, file_type, filename, content_base64 }
 *
 * field-services accepts multipart; serverless functions here take JSON with
 * base64 content (the client reads the file with FileReader). The file is
 * parsed immediately (Excel/PDF/Word/CSV) and the parsed data stored — raw
 * bytes are not persisted.
 */

import { withSecurity } from '../_lib/middleware.js'
import { supa } from '../_lib/db.js'
import { parseUpload, isAllowedExtension, ALLOWED_EXTENSIONS } from './_lib/parsers.js'
import { extractBomItems } from './_lib/service.js'
import { upsertHardwareFromBom } from './_lib/hardware.js'

const MAX_FILE_BYTES = 15 * 1024 * 1024 // serverless request body limits are the real cap

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { project_id, file_type = 'other', filename, content_base64 } = req.body ?? {}
  if (!project_id) return res.status(400).json({ message: 'project_id is required' })
  if (!filename || !content_base64) return res.status(400).json({ message: 'filename and content_base64 are required' })

  if (!isAllowedExtension(filename)) {
    return res.status(400).json({ message: `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` })
  }

  let buffer
  try {
    buffer = Buffer.from(content_base64, 'base64')
  } catch {
    return res.status(400).json({ message: 'content_base64 is not valid base64' })
  }
  if (buffer.length > MAX_FILE_BYTES) {
    return res.status(400).json({ message: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)` })
  }

  const parsed_data = await parseUpload(buffer, filename)

  const { data, error } = await supa.from('docgen_uploads').insert({
    project_id,
    file_type,
    original_filename: filename,
    parsed_data,
  }).select().single()

  if (error) return res.status(500).json({ message: error.message })

  // BOM uploads seed the global hardware repo (new part numbers become
  // entries; re-sightings only bump counters). Never fails the upload.
  let hardware_sync = null
  if (file_type === 'bom' && parsed_data && !parsed_data.parse_error) {
    hardware_sync = await upsertHardwareFromBom(extractBomItems([data]))
  }

  return res.status(201).json({ ...data, hardware_sync })
}

export default withSecurity(handler)
