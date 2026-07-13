/**
 * Schedule generation for route plans.
 *
 * Assigns sites to teams across days, respecting:
 * - Locked dates (sites that already have a scheduled_start — customer-mandated)
 * - Max working hours per day
 * - Travel days when the previous leg exceeds 4 hours
 * - Technician PTO (tech_time_off) and busy ranges from other plans
 * - Per-plan work days (0=Mon .. 6=Sun; Mon-Fri default)
 *
 * Port of field-services app/route_planning/scheduler.py.
 */

import { query } from '../db.js'
import { geocodeLocation, haversineMiles, siteLocationString, techLocationString } from './geo.js'
import { dstr } from './service.js'

const AVG_HIGHWAY_MPH = 60.0
const TRAVEL_DAY_THRESHOLD_HOURS = 4.0
const DEFAULT_SITE_HOURS = 8.0

export const DEFAULT_MAX_WORK_HOURS = Number(process.env.MAX_WORK_HOURS_PER_DAY ?? 10)

// ── date helpers (all on 'YYYY-MM-DD' strings) ────────────────────────────────

function toDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(s, n) {
  const d = toDate(s)
  d.setDate(d.getDate() + n)
  return dstr(d)
}

/** Python weekday convention: 0=Mon .. 6=Sun */
export function pyWeekday(s) {
  return (toDate(s).getDay() + 6) % 7
}

export function nextWorkday(s, allowedDays) {
  let d = s
  while (!allowedDays.has(pyWeekday(d))) d = addDays(d, 1)
  return d
}

// ── data loading ──────────────────────────────────────────────────────────────

/** PTO + other-plan busy ranges per technician: { [techId]: [{start,end}] } */
export async function loadBusyRanges(techIds, currentPlanId, planStart, planEnd) {
  const busy = {}
  if (!techIds.length) return busy

  const { rows: pto } = await query(
    `select technician_id, start_date, end_date from tech_time_off
     where technician_id = any($1::uuid[])
       and end_date >= $2 and start_date <= $3`,
    [techIds, planStart, planEnd],
  )
  for (const r of pto) {
    (busy[r.technician_id] ??= []).push({ start: dstr(r.start_date), end: dstr(r.end_date) })
  }

  const { rows: other } = await query(
    `select m.technician_id, st.scheduled_start, st.scheduled_end
     from route_plan_stops st
     join route_plan_team_members m on m.team_id = st.team_id
     where m.technician_id = any($1::uuid[])
       and st.route_plan_id != $2
       and st.scheduled_start is not null and st.scheduled_end is not null
       and st.scheduled_end >= $3 and st.scheduled_start <= $4`,
    [techIds, currentPlanId, planStart, addDays(planEnd, 60)],
  )
  for (const r of other) {
    (busy[r.technician_id] ??= []).push({ start: dstr(r.scheduled_start), end: dstr(r.scheduled_end) })
  }
  return busy
}

function allMembersAvailable(memberIds, date, busyByTech) {
  for (const id of memberIds) {
    const ranges = busyByTech[id] ?? []
    if (ranges.some((r) => r.start <= date && date <= r.end)) return false
  }
  return true
}

async function computeTeamCentroid(team) {
  const coords = []
  for (const m of team.members ?? []) {
    const loc = techLocationString(m)
    if (!loc) continue
    const c = await geocodeLocation(loc)
    if (c) coords.push(c)
  }
  if (!coords.length) return null
  return {
    lat: coords.reduce((s, c) => s + c.lat, 0) / coords.length,
    lng: coords.reduce((s, c) => s + c.lng, 0) / coords.length,
  }
}

function nearestNeighborOrder(sites) {
  const withCoords = sites.filter((s) => s.lat != null && s.lng != null)
  const withoutCoords = sites.filter((s) => s.lat == null || s.lng == null)
  if (withCoords.length <= 1) return [...withCoords, ...withoutCoords]

  const ordered = [withCoords[0]]
  const remaining = new Set(withCoords.slice(1))
  while (remaining.size) {
    const current = ordered[ordered.length - 1]
    let best = null
    let bestDist = Infinity
    for (const cand of remaining) {
      const dist = haversineMiles(current.lat, current.lng, cand.lat, cand.lng)
      if (dist < bestDist) { bestDist = dist; best = cand }
    }
    ordered.push(best)
    remaining.delete(best)
  }
  return [...ordered, ...withoutCoords]
}

// ── main algorithm ────────────────────────────────────────────────────────────

/**
 * Generate a schedule for a plan.
 *
 * @param plan route_plans row
 * @param options { params?: { maxSitesPerNight, maxWorkHoursPerDay, estimatedHoursOverride },
 *                  teamsOverride?: teams array (what-if virtual teams) }
 * @returns [{ team_id, site_id, scheduled_start, scheduled_end, estimated_hours,
 *             stop_order, travel_hours, travel_date }]
 */
export async function generateSchedule(plan, { params = null, teamsOverride = null, teams: teamsInput, sites: sitesInput } = {}) {
  const maxHours = params?.maxWorkHoursPerDay ?? DEFAULT_MAX_WORK_HOURS
  const maxSites = params ? (params.maxSitesPerNight ?? null) : (plan.max_sites_per_night ?? null)
  const allowedDays = new Set(plan.work_days?.length ? plan.work_days : [0, 1, 2, 3, 4])

  const sitesRaw = sitesInput ?? []
  const teams = teamsOverride ?? teamsInput ?? []
  if (!sitesRaw.length || !teams.length) return []

  // Flatten + geocode sites
  const hoursOverride = params?.estimatedHoursOverride ?? null
  const sites = []
  for (const s of sitesRaw) {
    const loc = siteLocationString(s)
    const geo = loc ? await geocodeLocation(loc) : null
    sites.push({
      site_id: s.id,
      estimated_hours: hoursOverride ?? DEFAULT_SITE_HOURS,
      scheduled_date: dstr(s.scheduled_start),
      scheduled_end_date: dstr(s.scheduled_end),
      date_locked: !!s.scheduled_start,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
    })
  }

  const lockedSites = sites.filter((s) => s.date_locked && s.scheduled_date)
  const flexibleSites = sites.filter((s) => !s.date_locked || !s.scheduled_date)

  const planStart = dstr(plan.start_date) ?? dstr(new Date())
  const planEndHint = dstr(plan.end_date) ?? addDays(planStart, 365)

  const allMemberIds = [...new Set(teams.flatMap((t) => (t.members ?? []).map((m) => m.technician_id)))]
  // Phantom what-if members have no real IDs — filter them from busy lookups
  const realMemberIds = allMemberIds.filter(Boolean)
  const busyByTech = await loadBusyRanges(realMemberIds, plan.id, planStart, planEndHint)

  const teamInfo = teams.map((t) => ({
    team: t,
    memberIds: (t.members ?? []).map((m) => m.technician_id).filter(Boolean),
  }))

  const results = []
  let stopCounter = 0

  const teamDayHours = Object.fromEntries(teamInfo.map((ti) => [ti.team.id, {}]))
  const globalDaySiteCount = {}

  const reserveDay = (teamId, date, hours) => {
    teamDayHours[teamId][date] = (teamDayHours[teamId][date] ?? 0) + hours
    globalDaySiteCount[date] = (globalDaySiteCount[date] ?? 0) + 1
  }

  // 1. Locked sites first, on their mandated dates, to the least-loaded available team
  for (const site of lockedSites) {
    let best = null
    let bestHours = Infinity
    for (const ti of teamInfo) {
      if (!allMembersAvailable(ti.memberIds, site.scheduled_date, busyByTech)) continue
      const h = teamDayHours[ti.team.id][site.scheduled_date] ?? 0
      if (h < bestHours) { best = ti; bestHours = h }
    }
    if (!best) best = teamInfo[0] // force-place rather than drop

    const start = site.scheduled_date
    const end = site.scheduled_end_date ?? start
    reserveDay(best.team.id, start, site.estimated_hours)
    results.push({
      team_id: best.team.id, site_id: site.site_id,
      scheduled_start: start, scheduled_end: end,
      estimated_hours: site.estimated_hours, stop_order: stopCounter++,
      travel_hours: null, travel_date: null,
    })
  }

  // 2. Flexible sites — proximity-aware if every team has a centroid, else round-robin
  const centroids = {}
  for (const ti of teamInfo) {
    const c = await computeTeamCentroid(ti.team)
    if (c) centroids[ti.team.id] = c
  }

  const placeSite = (ti, site, date) => {
    reserveDay(ti.team.id, date, site.estimated_hours)
    results.push({
      team_id: ti.team.id, site_id: site.site_id,
      scheduled_start: date, scheduled_end: date,
      estimated_hours: site.estimated_hours, stop_order: stopCounter++,
      travel_hours: null, travel_date: null,
    })
  }

  if (Object.keys(centroids).length === teamInfo.length && teamInfo.length > 0) {
    // Assign each site to nearest team centroid
    const teamSites = Object.fromEntries(teamInfo.map((ti) => [ti.team.id, []]))
    const firstTeamId = teamInfo[0].team.id
    for (const site of flexibleSites) {
      if (site.lat == null || site.lng == null) {
        teamSites[firstTeamId].push(site)
        continue
      }
      let bestId = firstTeamId
      let bestDist = Infinity
      for (const [teamId, c] of Object.entries(centroids)) {
        const dist = haversineMiles(site.lat, site.lng, c.lat, c.lng)
        if (dist < bestDist) { bestDist = dist; bestId = teamId }
      }
      teamSites[bestId].push(site)
    }

    for (const ti of teamInfo) {
      const ordered = nearestNeighborOrder(teamSites[ti.team.id])
      let currentDate = nextWorkday(planStart, allowedDays)

      for (const site of ordered) {
        let placed = false
        let attempts = 0
        while (!placed && attempts < 365) {
          currentDate = nextWorkday(currentDate, allowedDays)
          if (!allMembersAvailable(ti.memberIds, currentDate, busyByTech)) {
            currentDate = addDays(currentDate, 1)
            attempts++
            continue
          }
          const dayHours = teamDayHours[ti.team.id][currentDate] ?? 0
          const globalSites = globalDaySiteCount[currentDate] ?? 0
          if (dayHours + site.estimated_hours <= maxHours && (maxSites == null || globalSites < maxSites)) {
            placeSite(ti, site, currentDate)
            placed = true
          } else {
            currentDate = addDays(currentDate, 1)
            attempts++
          }
        }
        if (!placed) {
          currentDate = nextWorkday(addDays(currentDate, 1), allowedDays)
          placeSite(ti, site, currentDate)
        }
      }
    }
  } else {
    // Fallback: sort by state/city, round-robin across teams
    let currentDate = nextWorkday(planStart, allowedDays)
    const sorted = [...flexibleSites].sort((a, b) => {
      const sa = sitesRaw.find((s) => s.id === a.site_id)
      const sb = sitesRaw.find((s) => s.id === b.site_id)
      return `${sa?.state ?? ''}${sa?.city ?? ''}`.localeCompare(`${sb?.state ?? ''}${sb?.city ?? ''}`)
    })
    let teamIdx = 0

    for (const site of sorted) {
      let placed = false
      let attempts = 0
      while (!placed && attempts < 365) {
        currentDate = nextWorkday(currentDate, allowedDays)
        const ti = teamInfo[teamIdx % teamInfo.length]
        if (!allMembersAvailable(ti.memberIds, currentDate, busyByTech)) {
          teamIdx++
          attempts++
          continue
        }
        const dayHours = teamDayHours[ti.team.id][currentDate] ?? 0
        const globalSites = globalDaySiteCount[currentDate] ?? 0
        if (dayHours + site.estimated_hours <= maxHours && (maxSites == null || globalSites < maxSites)) {
          placeSite(ti, site, currentDate)
          placed = true
        } else {
          teamIdx++
          if (teamIdx % teamInfo.length === 0) currentDate = addDays(currentDate, 1)
          attempts++
        }
      }
      if (!placed) {
        currentDate = nextWorkday(addDays(currentDate, 1), allowedDays)
        placeSite(teamInfo[0], site, currentDate)
      }
    }
  }

  // 3. Travel estimates: haversine / 60 mph between consecutive stops per team;
  //    travel day inserted when a leg exceeds 4 hours.
  const siteCoords = new Map(sites.filter((s) => s.lat != null).map((s) => [s.site_id, s]))
  const byTeam = {}
  for (const stop of results) (byTeam[stop.team_id] ??= []).push(stop)
  for (const teamStops of Object.values(byTeam)) {
    teamStops.sort((a, b) =>
      a.scheduled_start === b.scheduled_start
        ? a.stop_order - b.stop_order
        : a.scheduled_start.localeCompare(b.scheduled_start))
    for (let i = 1; i < teamStops.length; i++) {
      const prev = siteCoords.get(teamStops[i - 1].site_id)
      const curr = siteCoords.get(teamStops[i].site_id)
      if (!prev || !curr) continue
      const travelHours = haversineMiles(prev.lat, prev.lng, curr.lat, curr.lng) / AVG_HIGHWAY_MPH
      teamStops[i].travel_hours = Math.round(travelHours * 100) / 100
      if (travelHours > TRAVEL_DAY_THRESHOLD_HOURS) {
        teamStops[i].travel_date = addDays(teamStops[i].scheduled_start, -1)
      }
    }
  }

  return results
}
