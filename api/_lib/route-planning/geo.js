/**
 * Geocoding + distance helpers for route planning.
 * Nominatim (OpenStreetMap) with a Postgres cache table, 1 req/sec rate limit.
 */

import { query, supa } from '../db.js'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT    = 'WWTOpsHub/1.0'

const EARTH_RADIUS_MILES = 3958.8

export function haversineMiles(lat1, lng1, lat2, lng2) {
  const rad  = (d) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function normalizeKey(location) {
  return location.trim().toLowerCase()
}

let lastRequestTime = 0

async function fetchFromNominatim(locationStr) {
  // Enforce 1 req/sec against Nominatim
  const elapsed = Date.now() - lastRequestTime
  if (elapsed < 1000) await new Promise((r) => setTimeout(r, 1000 - elapsed))

  try {
    const params = new URLSearchParams({
      q: locationStr, format: 'json', limit: '1', countrycodes: 'us',
    })
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    })
    lastRequestTime = Date.now()
    if (!res.ok) return null
    const results = await res.json()
    if (!results?.length) return null
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) }
  } catch {
    return null
  }
}

/** Geocode a "City, ST" string → { lat, lng } | null. Cache-first. */
export async function geocodeLocation(locationStr) {
  if (!locationStr?.trim()) return null
  const key = normalizeKey(locationStr)

  const { data: cached } = await supa.from('geocode_cache')
    .select('lat, lng').eq('location_key', key).single()
  if (cached) return { lat: cached.lat, lng: cached.lng }

  const coords = await fetchFromNominatim(locationStr)
  if (!coords) return null

  await query(
    `insert into geocode_cache (location_key, lat, lng) values ($1, $2, $3)
     on conflict (location_key) do nothing`,
    [key, coords.lat, coords.lng],
  )
  return coords
}

/** Batch geocode. Returns { [location]: {lat,lng} | null }. */
export async function batchGeocode(locations) {
  const results = {}
  for (const loc of locations) {
    if (typeof loc !== 'string' || !loc.trim()) continue
    results[loc] = await geocodeLocation(loc.trim())
  }
  return results
}

/** "City, ST" for a site row (city/state columns). */
export function siteLocationString(site) {
  return [site.city, site.state].filter(Boolean).join(', ')
}

/** "City, ST" for a technician row (city + first covered state). */
export function techLocationString(tech) {
  const state = Array.isArray(tech.states) && tech.states.length ? tech.states[0] : null
  return [tech.city, state].filter(Boolean).join(', ')
}
