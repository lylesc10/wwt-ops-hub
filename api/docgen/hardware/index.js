/**
 * GET  /api/docgen/hardware — list the global hardware repo
 * POST /api/docgen/hardware — manually add a hardware entry
 */

import { withSecurity } from '../../_lib/middleware.js'
import { supa } from '../../_lib/db.js'
import { listHardware } from '../_lib/hardware.js'
import { normalizePartNumber, normalizeDescription, validateSteps } from '../_lib/hardwareMatcher.js'

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      return res.json(await listHardware())
    } catch (err) {
      return res.status(500).json({ message: err.message })
    }
  }

  if (req.method === 'POST') {
    const { part_number, description, steps, notes } = req.body ?? {}
    const trimmedDescription = String(description ?? '').trim()
    if (!trimmedDescription) return res.status(400).json({ message: 'description is required' })

    let validSteps
    try {
      validSteps = validateSteps(steps ?? [])
    } catch (err) {
      return res.status(400).json({ message: err.message })
    }

    const { data, error } = await supa.from('docgen_hardware').insert({
      part_number: normalizePartNumber(part_number),
      description: trimmedDescription,
      description_key: normalizeDescription(trimmedDescription),
      steps: JSON.stringify(validSteps),
      notes: notes ?? null,
      source: 'manual',
    }).select().single()

    if (error) {
      if (/duplicate key/i.test(error.message)) {
        return res.status(409).json({ message: 'Hardware with this part number or description already exists' })
      }
      return res.status(500).json({ message: error.message })
    }
    return res.status(201).json(data)
  }

  return res.status(405).json({ message: 'Method not allowed' })
}

export default withSecurity(handler)
