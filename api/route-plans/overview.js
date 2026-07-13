/**
 * /api/route-plans/overview — all scheduled stops across all plans,
 * with project + team member info, for the Schedule Overview gantt.
 *
 *   GET ?start=YYYY-MM-DD&end=YYYY-MM-DD
 */

import { query } from '../_lib/db.js'
import { withSecurity } from '../_lib/middleware.js'
import { dstr } from '../_lib/route-planning/service.js'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })

  const { start, end } = req.query ?? {}
  const params = []
  let where = 'where 1=1'
  if (start) { params.push(start); where += ` and (st.scheduled_end >= $${params.length} or st.scheduled_end is null)` }
  if (end)   { params.push(end);   where += ` and (st.scheduled_start <= $${params.length} or st.scheduled_start is null)` }

  const { rows } = await query(
    `select st.id as stop_id, st.scheduled_start, st.scheduled_end, st.estimated_hours, st.status,
            p.id as plan_id, p.name as plan_name,
            tm.id as team_id, tm.name as team_name, tm.color as team_color,
            s.branch_name as site_name, s.city as site_city, s.state as site_state,
            pr.id as project_id, pr.name as project_name
     from route_plan_stops st
     join route_plans p on p.id = st.route_plan_id
     join route_plan_teams tm on tm.id = st.team_id
     join sites s on s.id = st.site_id
     join projects pr on pr.id = s.project_id
     ${where}
     order by st.scheduled_start nulls last`,
    params,
  )

  const teamIds = [...new Set(rows.map((r) => r.team_id))]
  const { rows: members } = teamIds.length
    ? await query(
      `select m.team_id, m.technician_id, t.full_name
       from route_plan_team_members m
       join technicians t on t.id = m.technician_id
       where m.team_id = any($1::uuid[])`,
      [teamIds],
    )
    : { rows: [] }
  const membersByTeam = {}
  for (const m of members) {
    (membersByTeam[m.team_id] ??= []).push({ technician_id: m.technician_id, tech_name: m.full_name })
  }

  const data = rows.map((r) => ({
    stop_id: r.stop_id,
    plan_id: r.plan_id,
    plan_name: r.plan_name,
    team_id: r.team_id,
    team_name: r.team_name,
    team_color: r.team_color ?? '#3B82F6',
    site_name: r.site_name ?? 'Unnamed',
    site_city: r.site_city,
    site_state: r.site_state,
    project_id: r.project_id,
    project_name: r.project_name ?? 'Unknown',
    scheduled_start: dstr(r.scheduled_start),
    scheduled_end: dstr(r.scheduled_end),
    estimated_hours: r.estimated_hours != null ? Number(r.estimated_hours) : null,
    status: r.status ?? 'planned',
    members: membersByTeam[r.team_id] ?? [],
  }))

  return res.json({ data })
}

export default withSecurity(handler)
