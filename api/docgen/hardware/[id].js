/**
 * GET    /api/docgen/hardware/[id] — get one hardware entry
 * PATCH  /api/docgen/hardware/[id] — update part_number/description/notes/steps
 * DELETE /api/docgen/hardware/[id] — delete entry
 */

import { withSecurity } from '../../_lib/middleware.js'
import { supa } from '../../_lib/db.js'
import { normalizePartNumber, normalizeDescription, validateSteps } from '../_lib/hardwareMatcher.js'

async function handler(req, res) {
  const id = req.query?.id
  if (!id) return res.status(400).json({ message: 'id is required' })

  if (req.method === 'GET') {
    const { data, error } = await supa.from('docgen_hardware').select('*').eq('id', id).single()
    if (error) return res.status(500).json({ message: error.message })
    if (!data) return res.status(404).json({ message: 'Hardware not found' })
    return res.json(data)
  }

  if (req.method === 'PATCH') {
    const body = req.body ?? {}
    const updates = {}

    if ('part_number' in body) updates.part_number = normalizePartNumber(body.part_number)
    if ('description' in body) {
      const trimmed = String(body.description ?? '').trim()
      if (!trimmed) return res.status(400).json({ message: 'description cannot be empty' })
      updates.description = trimmed
      updates.description_key = normalizeDescription(trimmed)
    }
    if ('notes' in body) updates.notes = body.notes ?? null
    if ('steps' in body) {
      try {
        updates.steps = JSON.stringify(validateSteps(body.steps))
      } catch (err) {
        return res.status(400).json({ message: err.message })
      }
    }
    if (!Object.keys(updates).length) return res.status(400).json({ message: 'No valid fields to update' })

    const { data, error } = await supa.from('docgen_hardware').update(updates).eq('id', id).select().single()
    if (error) {
      if (/duplicate key/i.test(error.message)) {
        return res.status(409).json({ message: 'Hardware with this part number or description already exists' })
      }
      return res.status(500).json({ message: error.message })
    }
    if (!data) return res.status(404).json({ message: 'Hardware not found' })
    return res.json(data)
  }

  if (req.method === 'DELETE') {
    const { error } = await supa.from('docgen_hardware').delete().eq('id', id)
    if (error) return res.status(500).json({ message: error.message })
    return res.status(204).end()
  }

  return res.status(405).json({ message: 'Method not allowed' })
}

export default withSecurity(handler)
