/**
 * Deterministic BOM → hardware-repo matching. Exact part number first, then
 * case-insensitive description substring (both directions). No AI pass —
 * since the repo is auto-populated from BOM uploads, part numbers usually
 * match exactly.
 *
 * Pure functions only — no DB dependencies.
 */

export function normalizePartNumber(pn) {
  const normalized = String(pn ?? '').trim().toUpperCase().replace(/\s+/g, '')
  return normalized || null
}

export function normalizeDescription(desc) {
  return String(desc ?? '')
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[^\w\s]/g, '')
    .split(/\s+/).filter(Boolean).join(' ')
}

/**
 * Sanitize a steps array to [{text, warning, photo_required}]. Drops steps
 * with empty text and strips unknown keys. Throws on non-array input.
 */
export function validateSteps(steps) {
  if (!Array.isArray(steps)) throw new Error('steps must be an array')
  return steps
    .filter(s => s && typeof s === 'object' && String(s.text ?? '').trim())
    .map(s => ({
      text: String(s.text).trim(),
      warning: !!s.warning,
      photo_required: !!s.photo_required,
    }))
}

// Descriptions shorter than this (normalized) are too generic to substring-match.
const MIN_DESC_MATCH_LENGTH = 4

/**
 * Annotate BOM items with their best hardware-repo match.
 *
 * bomItems: [{ description, part_number, ... }]
 * hardware: docgen_hardware rows [{ id, part_number, description, steps }]
 *
 * Returns bomItems.map(item => ({ ...item, match: {
 *   hardware_id, matched_by: 'part_number'|'description',
 *   hardware_description, steps,
 * } | null }))
 */
export function matchBomItems(bomItems, hardware) {
  const byPartNumber = new Map()
  for (const hw of hardware) {
    const pn = normalizePartNumber(hw.part_number)
    if (pn && !byPartNumber.has(pn)) byPartNumber.set(pn, hw)
  }

  const descCandidates = hardware
    .map(hw => ({ hw, desc: normalizeDescription(hw.description) }))
    .filter(c => c.desc.length >= MIN_DESC_MATCH_LENGTH)

  return bomItems.map(item => {
    const pn = normalizePartNumber(item.part_number)
    let matched = pn ? byPartNumber.get(pn) : undefined
    let matchedBy = 'part_number'

    if (!matched) {
      const itemDesc = normalizeDescription(item.description)
      let best = null
      if (itemDesc.length >= MIN_DESC_MATCH_LENGTH) {
        for (const { hw, desc } of descCandidates) {
          if (!itemDesc.includes(desc) && !desc.includes(itemDesc)) continue
          if (!best || desc.length > best.desc.length) best = { hw, desc }
        }
      }
      matched = best?.hw
      matchedBy = 'description'
    }

    if (!matched) return { ...item, match: null }
    return {
      ...item,
      match: {
        hardware_id: matched.id,
        matched_by: matchedBy,
        hardware_description: matched.description,
        steps: Array.isArray(matched.steps) ? matched.steps : [],
      },
    }
  })
}
