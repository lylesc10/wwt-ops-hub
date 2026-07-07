/**
 * Route planning data access + response shaping.
 * All handlers speak the same JSON shapes the frontend client expects.
 */

import { query } from '../db.js'

/** date | string | null → 'YYYY-MM-DD' | null */
export function dstr(d) {
  if (!d) return null
  if (d instanceof Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return String(d).slice(0, 10)
}

export function stopToResponse(row) {
  return {
    id: row.id,
    team_id: row.team_id,
    site_id: row.site_id,
    site_code: row.site_code ?? null,
    site_name: row.site_name ?? null,
    site_address: row.site_address ?? null,
    site_city: row.site_city ?? null,
    site_state: row.site_state ?? null,
    stop_order: row.stop_order,
    scheduled_start: dstr(row.scheduled_start),
    scheduled_end: dstr(row.scheduled_end),
    travel_date: dstr(row.travel_date),
    estimated_hours: row.estimated_hours != null ? Number(row.estimated_hours) : null,
    travel_hours_from_prev: row.travel_hours_from_prev != null ? Number(row.travel_hours_from_prev) : null,
    status: row.status ?? 'planned',
    notes: row.notes ?? null,
  }
}

const STOP_SELECT = `
  select st.*, s.code as site_code, s.branch_name as site_name,
         s.address as site_address, s.city as site_city, s.state as site_state
  from route_plan_stops st
  join sites s on s.id = st.site_id`

/** Load a full plan (teams → members + stops). Returns null if not found. */
export async function getPlanDetail(planId) {
  const { rows: plans } = await query('select * from route_plans where id = $1', [planId])
  if (!plans.length) return null
  const plan = plans[0]

  const { rows: links } = await query(
    'select project_id from route_plan_projects where route_plan_id = $1', [planId])

  const { rows: teams } = await query(
    'select * from route_plan_teams where route_plan_id = $1 order by created_at', [planId])

  const { rows: members } = await query(
    `select m.*, t.full_name as tech_name
     from route_plan_team_members m
     join technicians t on t.id = m.technician_id
     where m.team_id = any($1::uuid[])`,
    [teams.map((t) => t.id)],
  )

  const { rows: stops } = await query(
    `${STOP_SELECT} where st.route_plan_id = $1 order by st.stop_order`, [planId])

  const membersByTeam = new Map()
  for (const m of members) {
    if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, [])
    membersByTeam.get(m.team_id).push({
      technician_id: m.technician_id, tech_name: m.tech_name, role: m.role ?? 'member',
    })
  }
  const stopsByTeam = new Map()
  for (const st of stops) {
    if (!stopsByTeam.has(st.team_id)) stopsByTeam.set(st.team_id, [])
    stopsByTeam.get(st.team_id).push(stopToResponse(st))
  }

  return {
    id: plan.id,
    name: plan.name,
    status: plan.status ?? 'draft',
    team_mode: plan.team_mode ?? 'fixed_team',
    start_date: dstr(plan.start_date) ?? '',
    end_date: dstr(plan.end_date) ?? '',
    include_travel_days: !!plan.include_travel_days,
    max_sites_per_night: plan.max_sites_per_night,
    work_days: plan.work_days ?? [0, 1, 2, 3, 4],
    notes: plan.notes,
    created_by: plan.created_by,
    created_at: plan.created_at,
    updated_at: plan.updated_at,
    project_ids: links.map((l) => l.project_id),
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color ?? '#3B82F6',
      members: membersByTeam.get(t.id) ?? [],
      stops: stopsByTeam.get(t.id) ?? [],
    })),
  }
}

export async function listPlans() {
  const { rows } = await query(
    `select p.*,
       (select count(*) from route_plan_projects l where l.route_plan_id = p.id)::int as project_count,
       (select count(*) from route_plan_teams t where t.route_plan_id = p.id)::int as team_count,
       (select count(*) from route_plan_stops s where s.route_plan_id = p.id)::int as stop_count
     from route_plans p
     order by p.created_at desc`)
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status ?? 'draft',
    team_mode: p.team_mode ?? 'fixed_team',
    start_date: dstr(p.start_date) ?? '',
    end_date: dstr(p.end_date) ?? '',
    project_count: p.project_count,
    team_count: p.team_count,
    stop_count: p.stop_count,
    created_at: p.created_at,
  }))
}

/** All sites belonging to a plan's linked projects. */
export async function getPlanSites(planId) {
  const { rows } = await query(
    `select s.*, pr.name as project_name
     from sites s
     join projects pr on pr.id = s.project_id
     where s.project_id in (select project_id from route_plan_projects where route_plan_id = $1)
     order by s.state, s.city, s.code`,
    [planId],
  )
  return rows
}

/** Teams with member technician rows (used by scheduler / conflicts). */
export async function getTeamsWithMembers(planId) {
  const { rows: teams } = await query(
    'select * from route_plan_teams where route_plan_id = $1 order by created_at', [planId])
  const { rows: members } = await query(
    `select m.team_id, m.technician_id, m.role, t.full_name, t.city, t.states
     from route_plan_team_members m
     join technicians t on t.id = m.technician_id
     where m.team_id = any($1::uuid[])`,
    [teams.map((t) => t.id)],
  )
  return teams.map((t) => ({
    ...t,
    members: members.filter((m) => m.team_id === t.id),
  }))
}
