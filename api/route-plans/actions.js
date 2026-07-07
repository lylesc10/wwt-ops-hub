/**
 * /api/route-plans/actions — plan-level operations. POST { plan_id, action, ... }.
 *
 * Actions:
 *   generate-schedule      → clear stops, distribute plan sites across teams/days
 *   optimize               → reorder each team's stops (ORS or nearest-neighbor), travel times
 *   conflicts              → list PTO overlaps / double-bookings
 *   resolve-conflict       → { stop_id, resolution: 'reschedule' } | { resolution: 'substitute', tech_id, replacement_tech_id }
 *   resolve-all-conflicts  → bulk-reschedule all conflicting stops
 *   approve                → block on critical conflicts; push dates/techs to sites; status=approved
 *   what-if                → { scenarios: [...] } run schedule scenarios without persisting
 *   suggest-teams          → { techs_per_site? } cluster sites + score techs into suggested teams
 */

import { query, supa } from '../_lib/db.js'
import { withSecurity } from '../_lib/middleware.js'
import { geocodeLocation, siteLocationString, techLocationString } from '../_lib/route-planning/geo.js'
import { detectConflicts, getDistanceMatrix, optimizeTeamRoute } from '../_lib/route-planning/optimization.js'
import {
  addDays, generateSchedule, loadBusyRanges, nextWorkday, DEFAULT_MAX_WORK_HOURS,
} from '../_lib/route-planning/scheduler.js'
import { dstr, getPlanDetail, getPlanSites, getTeamsWithMembers } from '../_lib/route-planning/service.js'
import { assembleTeams } from '../_lib/route-planning/teamAssembler.js'

// ── generate-schedule ─────────────────────────────────────────────────────────

async function actionGenerateSchedule(plan, res) {
  const teams = await getTeamsWithMembers(plan.id)
  if (!teams.length) {
    return res.status(400).json({ message: 'Plan has no teams. Add teams before generating a schedule.' })
  }
  const sites = await getPlanSites(plan.id)

  await query('delete from route_plan_stops where route_plan_id = $1', [plan.id])

  const generated = await generateSchedule(plan, { teams, sites })
  for (const g of generated) {
    await supa.from('route_plan_stops').insert({
      route_plan_id: plan.id,
      team_id: g.team_id,
      site_id: g.site_id,
      stop_order: g.stop_order,
      scheduled_start: g.scheduled_start,
      scheduled_end: g.scheduled_end,
      estimated_hours: g.estimated_hours,
      travel_hours_from_prev: g.travel_hours,
      travel_date: g.travel_date,
      status: 'planned',
    })
  }

  let latestEnd = null
  if (generated.length) {
    latestEnd = generated.map((g) => g.scheduled_end).sort().at(-1)
    await supa.from('route_plans').update({ end_date: latestEnd }).eq('id', plan.id)
  }

  const detail = await getPlanDetail(plan.id)
  return res.json({
    data: {
      ...detail,
      schedule_stats: {
        total_sites: sites.length,
        scheduled: generated.length,
        unscheduled: sites.length - generated.length,
        computed_end_date: latestEnd,
      },
    },
  })
}

// ── optimize ──────────────────────────────────────────────────────────────────

async function actionOptimize(plan, res) {
  const detail = await getPlanDetail(plan.id)

  for (const team of detail.teams) {
    const stops = [...team.stops].sort((a, b) => a.stop_order - b.stop_order)
    if (!stops.length) continue

    const coords = []
    const serviceSeconds = []
    const validStops = []
    for (const stop of stops) {
      const loc = [stop.site_city, stop.site_state].filter(Boolean).join(', ')
      if (!loc) continue
      const geo = await geocodeLocation(loc)
      if (!geo) continue
      coords.push(geo)
      serviceSeconds.push((stop.estimated_hours ?? 8) * 3600)
      validStops.push(stop)
    }
    if (validStops.length < 2) continue

    const order = await optimizeTeamRoute(coords, serviceSeconds)
    const reordered = order.map((i) => validStops[i])
    const reorderedCoords = order.map((i) => coords[i])

    for (let idx = 0; idx < reordered.length; idx++) {
      await supa.from('route_plan_stops').update({ stop_order: idx }).eq('id', reordered[idx].id)
    }

    const matrix = await getDistanceMatrix(reorderedCoords)
    const durations = matrix?.durations
    if (durations) {
      for (let idx = 1; idx < reordered.length; idx++) {
        const travelHours = durations[idx - 1][idx] / 3600
        const updates = { travel_hours_from_prev: Math.round(travelHours * 100) / 100 }
        if (travelHours > 4 && reordered[idx].scheduled_start) {
          updates.travel_date = addDays(reordered[idx].scheduled_start, -1)
        }
        await supa.from('route_plan_stops').update(updates).eq('id', reordered[idx].id)
      }
    }
  }

  await supa.from('route_plans').update({ status: 'optimized' }).eq('id', plan.id)
  return res.json({ data: await getPlanDetail(plan.id) })
}

// ── conflict resolution ───────────────────────────────────────────────────────

/** Next conflict-free start/end for a stop, checking all its team members. */
async function findNextAvailableDate(plan, stop) {
  const allowedDays = new Set(plan.work_days?.length ? plan.work_days : [0, 1, 2, 3, 4])
  const start = dstr(stop.scheduled_start)
  const end = dstr(stop.scheduled_end) ?? start
  const durationDays = start && end
    ? Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000))
    : 0

  const { rows: memberRows } = await query(
    'select technician_id from route_plan_team_members where team_id = $1', [stop.team_id])
  const memberIds = memberRows.map((r) => r.technician_id)

  const searchStart = addDays(end ?? dstr(new Date()), 1)
  const busy = await loadBusyRanges(memberIds, plan.id, searchStart, addDays(searchStart, 365))
  const allRanges = Object.values(busy).flat()

  let candidate = nextWorkday(searchStart, allowedDays)
  for (let i = 0; i < 120; i++) {
    candidate = nextWorkday(candidate, allowedDays)
    const candidateEnd = addDays(candidate, durationDays)
    const overlap = allRanges.find((r) => r.start <= candidateEnd && r.end >= candidate)
    if (!overlap) return { start: candidate, end: candidateEnd }
    candidate = nextWorkday(addDays(overlap.end, 1), allowedDays)
  }
  const fallback = nextWorkday(addDays(end ?? dstr(new Date()), 7), allowedDays)
  return { start: fallback, end: addDays(fallback, durationDays) }
}

async function actionResolveConflict(plan, body, res) {
  const { rows } = await query(
    'select * from route_plan_stops where id = $1 and route_plan_id = $2',
    [body.stop_id, plan.id],
  )
  if (!rows.length) return res.status(404).json({ message: 'Stop not found' })
  const stop = rows[0]

  if (body.resolution === 'reschedule') {
    const { start, end } = await findNextAvailableDate(plan, stop)
    await supa.from('route_plan_stops')
      .update({ scheduled_start: start, scheduled_end: end }).eq('id', stop.id)
    return res.json({ data: { resolved: true, resolution: 'reschedule', new_start: start, new_end: end } })
  }

  if (body.resolution === 'substitute') {
    if (!body.tech_id || !body.replacement_tech_id) {
      return res.status(400).json({ message: 'tech_id and replacement_tech_id required for substitute' })
    }
    const { rows: memberRows } = await query(
      'select id from route_plan_team_members where team_id = $1 and technician_id = $2',
      [stop.team_id, body.tech_id],
    )
    if (!memberRows.length) return res.status(404).json({ message: 'Tech not found in team' })

    const { data: replacement } = await supa.from('technicians')
      .select('id, full_name').eq('id', body.replacement_tech_id).single()
    if (!replacement) return res.status(404).json({ message: 'Replacement tech not found' })

    await supa.from('route_plan_team_members')
      .update({ technician_id: body.replacement_tech_id }).eq('id', memberRows[0].id)
    return res.json({
      data: {
        resolved: true,
        resolution: 'substitute',
        replaced_tech_id: body.tech_id,
        new_tech_id: replacement.id,
        new_tech_name: replacement.full_name,
      },
    })
  }

  return res.status(400).json({ message: `Unknown resolution: ${body.resolution}` })
}

async function actionResolveAllConflicts(plan, res) {
  const conflicts = await detectConflicts(plan.id)
  if (!conflicts.length) return res.json({ data: { resolved: 0, message: 'No conflicts found' } })

  const seen = new Set()
  let resolved = 0
  for (const conflict of conflicts) {
    if (!conflict.stop_id || seen.has(conflict.stop_id)) continue
    seen.add(conflict.stop_id)
    const { rows } = await query(
      'select * from route_plan_stops where id = $1 and route_plan_id = $2',
      [conflict.stop_id, plan.id],
    )
    if (!rows.length) continue
    const { start, end } = await findNextAvailableDate(plan, rows[0])
    await supa.from('route_plan_stops')
      .update({ scheduled_start: start, scheduled_end: end }).eq('id', conflict.stop_id)
    resolved++
  }
  return res.json({ data: { resolved, message: `Rescheduled ${resolved} stops` } })
}

// ── approve ───────────────────────────────────────────────────────────────────

async function actionApprove(plan, res) {
  const conflicts = await detectConflicts(plan.id)
  const critical = conflicts.filter((c) => c.severity === 'critical')
  if (critical.length) {
    return res.status(409).json({
      message: 'Cannot approve: critical conflicts exist',
      conflicts: critical,
    })
  }

  // Push scheduled dates + assigned techs back onto the sites (Site Board)
  const { rows: stops } = await query(
    `select st.site_id, st.scheduled_start, st.scheduled_end, st.team_id
     from route_plan_stops st where st.route_plan_id = $1
       and st.scheduled_start is not null`,
    [plan.id],
  )
  const { rows: members } = await query(
    `select m.team_id, t.full_name
     from route_plan_team_members m
     join technicians t on t.id = m.technician_id
     where m.team_id in (select id from route_plan_teams where route_plan_id = $1)`,
    [plan.id],
  )
  const namesByTeam = {}
  for (const m of members) (namesByTeam[m.team_id] ??= []).push(m.full_name)

  let sitesUpdated = 0
  for (const stop of stops) {
    const techNames = (namesByTeam[stop.team_id] ?? []).join(', ')
    const updates = {
      scheduled_start: dstr(stop.scheduled_start),
      scheduled_end: dstr(stop.scheduled_end) ?? dstr(stop.scheduled_start),
    }
    if (techNames) updates.assigned_tech = techNames
    const { error } = await supa.from('sites').update(updates).eq('id', stop.site_id)
    if (!error) sitesUpdated++
  }

  await supa.from('route_plans').update({ status: 'approved' }).eq('id', plan.id)
  return res.json({ data: { approved: true, sites_updated: sitesUpdated } })
}

// ── what-if ───────────────────────────────────────────────────────────────────

const VIRTUAL_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899']
const EXTRA_COLORS = ['#06B6D4', '#84CC16', '#F97316', '#6366F1', '#D946EF', '#0EA5E9']

function buildVirtualTeams(realTeams, techsPerSite) {
  const allMembers = realTeams.flatMap((t) => t.members ?? [])
  if (!allMembers.length || techsPerSite < 1) {
    return { teams: realTeams, names: Object.fromEntries(realTeams.map((t) => [t.id, t.name])) }
  }
  const nTeams = Math.ceil(allMembers.length / techsPerSite)
  const teams = []
  const names = {}
  for (let i = 0; i < nTeams; i++) {
    const chunk = allMembers.slice(i * techsPerSite, (i + 1) * techsPerSite)
    const id = `virtual-${i}`
    const name = `Virtual Team ${i + 1} (${chunk.length} techs)`
    teams.push({ id, name, color: VIRTUAL_COLORS[i % VIRTUAL_COLORS.length], members: chunk })
    names[id] = name
  }
  return { teams, names }
}

function buildExtraTeams(baseCount, extraCount) {
  const teams = []
  const names = {}
  for (let i = 0; i < extraCount; i++) {
    const id = `extra-${i}`
    const name = `New Team ${baseCount + i + 1}`
    // Phantom members (no technician_id) never hit PTO/double-booking checks
    teams.push({
      id, name,
      color: EXTRA_COLORS[i % EXTRA_COLORS.length],
      members: [{ technician_id: null }, { technician_id: null }],
    })
    names[id] = name
  }
  return { teams, names }
}

function computeScenarioStats(label, stops, teamNames, planEndDate) {
  if (!stops.length) {
    return {
      label, total_stops: 0, work_days: 0, calendar_span: 0,
      date_range_start: null, date_range_end: null,
      avg_hours_per_day: 0, max_daily_hours: 0, unscheduled_sites: 0, teams: [],
    }
  }
  const allDates = new Set()
  const hoursByTeamDay = {}
  let unscheduled = 0
  for (const s of stops) {
    allDates.add(s.scheduled_start)
    ;((hoursByTeamDay[s.team_id] ??= {})[s.scheduled_start] ??= 0)
    hoursByTeamDay[s.team_id][s.scheduled_start] += s.estimated_hours
    if (planEndDate && s.scheduled_start > planEndDate) unscheduled++
  }
  const sorted = [...allDates].sort()
  const minDate = sorted[0]
  const maxDate = sorted.at(-1)
  const calendarSpan = Math.round((new Date(maxDate) - new Date(minDate)) / 86400000) + 1

  const allDayHours = Object.values(hoursByTeamDay).flatMap((d) => Object.values(d))
  const avgHours = allDayHours.length ? allDayHours.reduce((a, b) => a + b, 0) / allDayHours.length : 0
  const maxHours = allDayHours.length ? Math.max(...allDayHours) : 0

  const byTeam = {}
  for (const s of stops) (byTeam[s.team_id] ??= []).push(s)
  const teams = Object.entries(byTeam).map(([teamId, tStops]) => {
    const tDates = [...new Set(tStops.map((s) => s.scheduled_start))].sort()
    return {
      team_id: teamId,
      team_name: teamNames[teamId] ?? teamId.slice(0, 8),
      stop_count: tStops.length,
      total_hours: Math.round(tStops.reduce((sum, s) => sum + s.estimated_hours, 0) * 10) / 10,
      work_days: Object.keys(hoursByTeamDay[teamId]).length,
      first_date: tDates[0],
      last_date: tDates.at(-1),
    }
  })

  return {
    label,
    total_stops: stops.length,
    work_days: allDates.size,
    calendar_span: calendarSpan,
    date_range_start: minDate,
    date_range_end: maxDate,
    avg_hours_per_day: Math.round(avgHours * 10) / 10,
    max_daily_hours: Math.round(maxHours * 10) / 10,
    unscheduled_sites: unscheduled,
    teams,
  }
}

async function actionWhatIf(plan, body, res) {
  const scenarios = body.scenarios ?? []
  if (scenarios.length < 1 || scenarios.length > 4) {
    return res.status(400).json({ message: 'Provide 1-4 scenarios' })
  }
  const realTeams = await getTeamsWithMembers(plan.id)
  if (!realTeams.length) {
    return res.status(400).json({ message: 'Plan has no teams. Add teams before running scenarios.' })
  }
  const sites = await getPlanSites(plan.id)
  const baseNames = Object.fromEntries(realTeams.map((t) => [t.id, t.name]))
  const planEnd = dstr(plan.end_date)

  const results = []
  for (const scenario of scenarios) {
    let teamsOverride = null
    let names = baseNames

    if (scenario.techs_per_site >= 1) {
      const virtual = buildVirtualTeams(realTeams, scenario.techs_per_site)
      teamsOverride = virtual.teams
      names = virtual.names
    }
    if (scenario.extra_teams >= 1) {
      const base = teamsOverride ?? realTeams
      const extra = buildExtraTeams(base.length, scenario.extra_teams)
      teamsOverride = [...base, ...extra.teams]
      names = { ...names, ...extra.names }
    }

    const stops = await generateSchedule(plan, {
      params: {
        maxSitesPerNight: scenario.max_sites_per_night ?? null,
        maxWorkHoursPerDay: scenario.max_work_hours_per_day ?? DEFAULT_MAX_WORK_HOURS,
        estimatedHoursOverride: scenario.estimated_hours_override ?? null,
      },
      teams: realTeams,
      teamsOverride,
      sites,
    })
    results.push(computeScenarioStats(scenario.label ?? 'Scenario', stops, names, planEnd))
  }

  return res.json({ data: { scenarios: results } })
}

// ── suggest-teams ─────────────────────────────────────────────────────────────

async function actionSuggestTeams(plan, body, res) {
  const sitesRaw = await getPlanSites(plan.id)
  if (!sitesRaw.length) {
    return res.json({ data: { teams: [], unassigned_techs: [], warnings: ['No projects linked to this route plan.'] } })
  }

  const sites = []
  for (const s of sitesRaw) {
    const loc = siteLocationString(s)
    const geo = loc ? await geocodeLocation(loc) : null
    sites.push({
      id: s.id, name: s.branch_name, city: s.city, state: s.state,
      lat: geo?.lat ?? null, lng: geo?.lng ?? null,
    })
  }

  const { rows: techsRaw } = await query(
    'select * from technicians where is_active is not false order by full_name')
  const { rows: pto } = await query('select technician_id, start_date, end_date from tech_time_off')
  const { rows: activeStops } = await query(
    `select m.technician_id, count(*)::int as n
     from route_plan_stops st
     join route_plan_team_members m on m.team_id = st.team_id
     join route_plans p on p.id = st.route_plan_id
     where p.status in ('approved', 'in_progress') and p.id != $1
     group by m.technician_id`,
    [plan.id],
  )
  const activeByTech = Object.fromEntries(activeStops.map((r) => [r.technician_id, r.n]))

  const techs = []
  for (const t of techsRaw) {
    const loc = techLocationString(t)
    const geo = loc ? await geocodeLocation(loc) : null
    techs.push({
      id: t.id,
      name: t.full_name,
      location: loc || (t.region ?? null),
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      ptoRanges: pto
        .filter((p) => p.technician_id === t.id)
        .map((p) => ({ start: dstr(p.start_date), end: dstr(p.end_date) })),
      activeAssignments: activeByTech[t.id] > 0 ? 1 : 0,
    })
  }

  const result = assembleTeams({
    techs,
    sites,
    techsPerSite: body.techs_per_site ?? 2,
    startDate: dstr(plan.start_date),
    endDate: dstr(plan.end_date),
  })
  return res.json({ data: result })
}

// ── dispatcher ────────────────────────────────────────────────────────────────

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const body = req.body ?? {}
  const { plan_id: planId, action } = body
  if (!planId || !action) return res.status(400).json({ message: 'plan_id and action are required' })

  const { rows } = await query('select * from route_plans where id = $1', [planId])
  if (!rows.length) return res.status(404).json({ message: 'Route plan not found' })
  const plan = rows[0]

  try {
    switch (action) {
      case 'generate-schedule':     return await actionGenerateSchedule(plan, res)
      case 'optimize':              return await actionOptimize(plan, res)
      case 'conflicts':             return res.json({ data: await detectConflicts(plan.id) })
      case 'resolve-conflict':      return await actionResolveConflict(plan, body, res)
      case 'resolve-all-conflicts': return await actionResolveAllConflicts(plan, res)
      case 'approve':               return await actionApprove(plan, res)
      case 'what-if':               return await actionWhatIf(plan, body, res)
      case 'suggest-teams':         return await actionSuggestTeams(plan, body, res)
      default:
        return res.status(400).json({ message: `Unknown action: ${action}` })
    }
  } catch (e) {
    console.error(`[route-plans] action ${action} failed:`, e)
    return res.status(500).json({ message: e.message })
  }
}

export default withSecurity(handler)
