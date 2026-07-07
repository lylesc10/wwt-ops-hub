/**
 * /api/route-plans/geocode — batch geocode "City, ST" strings via the
 * server-side Nominatim cache. POST { locations: ["City, ST", ...] } →
 * { results: { "City, ST": { lat, lng } | null } }
 */

import { withSecurity } from '../_lib/middleware.js'
import { batchGeocode } from '../_lib/route-planning/geo.js'

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const locations = req.body?.locations
  if (!Array.isArray(locations) || locations.length > 200) {
    return res.status(400).json({ message: 'Provide 1-200 locations' })
  }

  return res.json({ results: await batchGeocode(locations) })
}

export default withSecurity(handler)
