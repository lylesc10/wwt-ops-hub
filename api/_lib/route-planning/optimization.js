/**
 * Route optimization (OpenRouteService) and conflict detection.
 * Port of field-services app/route_planning/optimization.py.
 *
 * ORS is optional — set ORS_API_KEY. Without it (or on API failure)
 * optimization falls back to a local nearest-neighbor ordering.
 */

import { query } from '../db.js'
import { haversineMiles } from './geo.js'
import { dstr } from './service.js'

const ORS_MATRIX_URL = 'https://api.openrouteservice.org/v2/matrix/driving-car'
const ORS_OPTIMIZATION_URL = 'https://api.openrouteservice.org/optimization'

function orsHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  if (process.env.ORS_API_KEY) headers.Authorization = process.env.ORS_API_KEY
  return headers
}

/** Duration/distance matrix. coords: [{lat,lng}]. Returns { durations, distances } or null. */
export async function getDistanceMatrix(coords) {
  try {
    const res = await fetch(ORS_MATRIX_URL, {
      method: 'POST',
      headers: orsHeaders(),
      body: JSON.stringify({
        locations: coords.map((c) => [c.lng, c.lat]),
        metrics: ['duration', 'distance'],
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function nearestNeighborIndices(coords) {
  if (coords.length <= 2) return coords.map((_, i) => i)
  const order = [0]
  const remaining = new Set(coords.map((_, i) => i).slice(1))
  while (remaining.size) {
    const cur = coords[order[order.length - 1]]
    let best = null
    let bestDist = Infinity
    for (const i of remaining) {
      const d = haversineMiles(cur.lat, cur.lng, coords[i].lat, coords[i].lng)
      if (d < bestDist) { bestDist = d; best = i }
    }
    order.push(best)
    remaining.delete(best)
  }
  return order
}

/**
 * Optimize visit order via ORS; falls back to nearest-neighbor.
 * coords: [{lat,lng}], serviceSeconds: seconds on site per stop.
 * Returns array of indices in optimized visit order.
 */
export async function optimizeTeamRoute(coords, serviceSeconds) {
  if (coords.length <= 2) return coords.map((_, i) => i)
  if (!process.env.ORS_API_KEY) return nearestNeighborIndices(coords)

  try {
    const res = await fetch(ORS_OPTIMIZATION_URL, {
      method: 'POST',
      headers: orsHeaders(),
      body: JSON.stringify({
        jobs: coords.map((c, i) => ({
          id: i, location: [c.lng, c.lat], service: Math.round(serviceSeconds[i] ?? 28800),
        })),
        vehicles: [{ id: 0, start: [coords[0].lng, coords[0].lat] }],
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return nearestNeighborIndices(coords)
    const data = await res.json()
    const steps = data.routes?.[0]?.steps ?? []
    const order = steps.filter((s) => s.type === 'job').map((s) => s.id)
    return order.length === coords.length ? order : nearestNeighborIndices(coords)
  } catch {
    return nearestNeighborIndices(coords)
  }
}

/**
 * Detect scheduling conflicts for a plan:
 * 1. PTO overlaps (tech_time_off) — critical
 * 2. Double-bookings against stops in other plans — critical
 */
export async function detectConflicts(planId) {
  const { rows: stops } = await query(
    `select st.id, st.team_id, st.scheduled_start, st.scheduled_end,
            s.branch_name as site_name, s.city as site_city
     from route_plan_stops st
     join sites s on s.id = st.site_id
     where st.route_plan_id = $1
       and st.scheduled_start is not null and st.scheduled_end is not null`,
    [planId],
  )
  if (!stops.length) return []

  const { rows: members } = await query(
    `select m.team_id, m.technician_id, t.full_name
     from route_plan_team_members m
     join technicians t on t.id = m.technician_id
     where m.team_id in (select id from route_plan_teams where route_plan_id = $1)`,
    [planId],
  )
  if (!members.length) return []

  const techIds = [...new Set(members.map((m) => m.technician_id))]

  const { rows: pto } = await query(
    `select technician_id, start_date, end_date, reason from tech_time_off
     where technician_id = any($1::uuid[])`,
    [techIds],
  )
  const { rows: otherStops } = await query(
    `select m.technician_id, st.scheduled_start, st.scheduled_end
     from route_plan_stops st
     join route_plan_team_members m on m.team_id = st.team_id
     where m.technician_id = any($1::uuid[])
       and st.route_plan_id != $2
       and st.scheduled_start is not null and st.scheduled_end is not null`,
    [techIds, planId],
  )

  const conflicts = []
  for (const stop of stops) {
    const start = dstr(stop.scheduled_start)
    const end = dstr(stop.scheduled_end)
    const siteName = stop.site_name || stop.site_city || 'unknown site'

    for (const member of members.filter((m) => m.team_id === stop.team_id)) {
      for (const p of pto.filter((p) => p.technician_id === member.technician_id)) {
        const ps = dstr(p.start_date)
        const pe = dstr(p.end_date)
        if (ps <= end && pe >= start) {
          conflicts.push({
            type: 'pto_overlap',
            severity: 'critical',
            message: `${member.full_name} has ${p.reason ?? 'PTO'} from ${ps} to ${pe} overlapping stop at ${siteName}`,
            tech_id: member.technician_id,
            tech_name: member.full_name,
            stop_id: stop.id,
            team_id: stop.team_id,
            site_name: siteName,
            stop_start: start,
            stop_end: end,
          })
        }
      }
      for (const o of otherStops.filter((o) => o.technician_id === member.technician_id)) {
        const os = dstr(o.scheduled_start)
        const oe = dstr(o.scheduled_end)
        if (os <= end && oe >= start) {
          conflicts.push({
            type: 'double_booking',
            severity: 'critical',
            message: `${member.full_name} is already scheduled at another stop from ${os} to ${oe}`,
            tech_id: member.technician_id,
            tech_name: member.full_name,
            stop_id: stop.id,
            team_id: stop.team_id,
            site_name: siteName,
            stop_start: start,
            stop_end: end,
          })
        }
      }
    }
  }
  return conflicts
}
