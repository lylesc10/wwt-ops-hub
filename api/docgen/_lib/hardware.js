/**
 * Hardware repository data access. The repo is global (not per-project) and
 * auto-populated from BOM uploads — every new part number becomes a row.
 * Curated install steps are attached via the /api/docgen/hardware endpoints
 * and injected into generated documents by postProcessor.js.
 */

import { supa, query } from '../../_lib/db.js'
import { logWarn } from '../../_lib/log.js'
import { normalizePartNumber, normalizeDescription } from './hardwareMatcher.js'

export async function listHardware() {
  const { data, error } = await supa.from('docgen_hardware').select('*').order('description')
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Upsert BOM line items into the hardware repo. Re-sighting an existing part
 * number (or, for PN-less items, an existing normalized description) only
 * bumps seen_count/last_seen_at — it must never overwrite curated steps,
 * notes, or the original description. Hence raw ON CONFLICT SQL instead of
 * supa.upsert(), which updates every column.
 *
 * Never throws — a hardware-sync failure must not fail the upload itself.
 */
export async function upsertHardwareFromBom(bomItems) {
  const counts = { inserted: 0, seen: 0 }
  const seenKeys = new Set() // in-batch dedupe: pn:X or desc:Y

  for (const item of bomItems ?? []) {
    const partNumber = normalizePartNumber(item.part_number)
    const descriptionKey = normalizeDescription(item.description)
    if (!descriptionKey) continue

    const batchKey = partNumber ? `pn:${partNumber}` : `desc:${descriptionKey}`
    if (seenKeys.has(batchKey)) continue
    seenKeys.add(batchKey)

    try {
      const sql = partNumber
        ? `INSERT INTO docgen_hardware (part_number, description, description_key, source)
           VALUES ($1, $2, $3, 'bom')
           ON CONFLICT (part_number) DO UPDATE
             SET seen_count = docgen_hardware.seen_count + 1, last_seen_at = now()
           RETURNING (xmax = 0) AS inserted`
        : `INSERT INTO docgen_hardware (part_number, description, description_key, source)
           VALUES (null, $1, $2, 'bom')
           ON CONFLICT (description_key) WHERE part_number IS NULL DO UPDATE
             SET seen_count = docgen_hardware.seen_count + 1, last_seen_at = now()
           RETURNING (xmax = 0) AS inserted`
      const params = partNumber
        ? [partNumber, String(item.description).trim(), descriptionKey]
        : [String(item.description).trim(), descriptionKey]

      const { rows } = await query(sql, params)
      counts[rows[0]?.inserted ? 'inserted' : 'seen']++
    } catch (err) {
      logWarn('docgen hardware sync failed for BOM item', {
        part_number: partNumber, description: item.description, error: err.message,
      })
    }
  }

  return counts
}
