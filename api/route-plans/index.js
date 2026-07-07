/**
 * /api/route-plans — route plan CRUD.
 *
 *   GET              → list plans (with project/team/stop counts)
 *   GET ?id=<uuid>   → full plan detail (teams, members, stops; ?include=sites adds plan sites)
 *   POST             → create plan { name, team_mode, start_date, end_date?, include_travel_days?,
 *                                    max_sites_per_night?, work_days?, notes?, project_ids? }
 *   PATCH ?id=<uuid> → update plan fields
 *   DELETE ?id=<uuid>→ delete plan (cascades teams/stops)
 */

import { query, supa } from '../_lib/db.js'
import { withSecurity } from '../_lib/middleware.js'
import { getPlanDetail, getPlanSites, listPlans, dstr } from '../_lib/route-planning/service.js'

const PLAN_FIELDS = [
  'name', 'status', 'team_mode', 'start_date', 'end_date',
  'include_travel_days', 'max_sites_per_night', 'work_days', 'notes',
]

async function handler(req, res) {
  const id = req.query?.id

  if (req.method === 'GET') {
    if (!id) return res.json({ data: await listPlans() })
    const plan = await getPlanDetail(id)
    if (!plan) return res.status(404).json({ message: 'Route plan not found' })
    if (req.query?.include === 'sites') {
      const sites = await getPlanSites(id)
      plan.sites = sites.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.branch_name,
        address: s.address,
        city: s.city,
        state: s.state,
        scheduled_start: dstr(s.scheduled_start),
        scheduled_end: dstr(s.scheduled_end),
        project_id: s.project_id,
        project_name: s.project_name,
      }))
    }
    return res.json({ data: plan })
  }

  if (req.method === 'POST') {
    const body = req.body ?? {}
    if (!body.name || !body.start_date) {
      return res.status(400).json({ message: 'name and start_date are required' })
    }
    const { data: plan, error } = await supa.from('route_plans').insert({
      name: body.name,
      team_mode: body.team_mode ?? 'fixed_team',
      start_date: body.start_date,
      end_date: body.end_date ?? null,
      include_travel_days: body.include_travel_days ?? true,
      max_sites_per_night: body.max_sites_per_night ?? null,
      work_days: body.work_days ?? [0, 1, 2, 3, 4],
      notes: body.notes ?? null,
      status: 'draft',
    }).select().single()
    if (error) return res.status(500).json({ message: error.message })

    for (const projectId of body.project_ids ?? []) {
      await supa.from('route_plan_projects').insert({ route_plan_id: plan.id, project_id: projectId })
    }
    return res.status(201).json({ data: await getPlanDetail(plan.id) })
  }

  if (req.method === 'PATCH') {
    if (!id) return res.status(400).json({ message: 'id query param required' })
    const body = req.body ?? {}
    const updates = {}
    for (const f of PLAN_FIELDS) if (f in body) updates[f] = body[f]

    if (Object.keys(updates).length) {
      const { error } = await supa.from('route_plans').update(updates).eq('id', id)
      if (error) return res.status(500).json({ message: error.message })
    }
    if (Array.isArray(body.project_ids)) {
      await query('delete from route_plan_projects where route_plan_id = $1', [id])
      for (const projectId of body.project_ids) {
        await supa.from('route_plan_projects').insert({ route_plan_id: id, project_id: projectId })
      }
    }
    const plan = await getPlanDetail(id)
    if (!plan) return res.status(404).json({ message: 'Route plan not found' })
    return res.json({ data: plan })
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ message: 'id query param required' })
    const { error } = await supa.from('route_plans').delete().eq('id', id)
    if (error) return res.status(500).json({ message: error.message })
    return res.status(204).end()
  }

  return res.status(405).json({ message: 'Method not allowed' })
}

export default withSecurity(handler)
