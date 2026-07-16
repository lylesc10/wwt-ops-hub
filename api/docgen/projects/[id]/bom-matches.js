/**
 * GET /api/docgen/projects/[id]/bom-matches
 *
 * Computed view: BOM line items from the project's uploads matched against
 * the global hardware repo. Nothing is persisted — matching is deterministic
 * and recomputed on demand, so it can never go stale when hardware entries
 * or their steps are edited.
 */

import { withSecurity } from '../../../_lib/middleware.js'
import { listUploads, extractBomItems } from '../../_lib/service.js'
import { listHardware } from '../../_lib/hardware.js'
import { matchBomItems } from '../../_lib/hardwareMatcher.js'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })
  const id = req.query?.id
  if (!id) return res.status(400).json({ message: 'id is required' })

  try {
    const uploads = await listUploads(id)
    const bomItems = extractBomItems(uploads)
    const hardware = await listHardware()
    const matched = matchBomItems(bomItems, hardware)

    const items = matched.map(({ description, part_number, quantity, match }) => ({
      description,
      part_number,
      quantity,
      match: match && {
        hardware_id: match.hardware_id,
        matched_by: match.matched_by,
        hardware_description: match.hardware_description,
        step_count: match.steps.length,
      },
    }))

    return res.json({
      items,
      summary: {
        total: items.length,
        matched: items.filter(i => i.match).length,
        with_steps: items.filter(i => i.match?.step_count > 0).length,
      },
    })
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
}

export default withSecurity(handler)
