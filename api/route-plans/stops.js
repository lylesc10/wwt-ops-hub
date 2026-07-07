/**
 * /api/route-plans/stops — stop CRUD + reorder.
 *
 *   POST              → create { plan_id, team_id, site_id, stop_order?, scheduled_start?,
 *                                scheduled_end?, estimated_hours?, travel_date?, notes? }
 *   PATCH ?id=<uuid>  → update stop fields
 *   DELETE ?id=<uuid> → remove stop
 *   PUT               → reorder { team_id, stop_ids: [uuid, ...] } (index = new stop_order)
 */

import { query, supa } from '../_lib/db.js'
import { withSecurity } from '../_lib/middleware.js'
import { stopToResponse } from '../_lib/route-planning/service.js'

const STOP_FIELDS = [
  'team_id', 'stop_order', 'scheduled_start', 'scheduled_end',
  'estimated_hours', 'travel_hours_from_prev', 'travel_date', 'status', 'notes',
]

async function stopDetail(stopId) {
  const { rows } = await query(
    `select st.*, s.code as site_code, s.branch_name as site_name,
            s.address as site_address, s.city as site_city, s.state as site_state
     from route_plan_stops st
     join sites s on s.id = st.site_id
     where st.id = $1`,
    [stopId],
  )
  return rows.length ? stopToResponse(rows[0]) : null
}

async function handler(req, res) {
  const id = req.query?.id
  const body = req.body ?? {}

  if (req.method === 'POST') {
    if (!body.plan_id || !body.team_id || !body.site_id) {
      return res.status(400).json({ message: 'plan_id, team_id and site_id are required' })
    }
    const { data: stop, error } = await supa.from('route_plan_stops').insert({
      route_plan_id: body.plan_id,
      team_id: body.team_id,
      site_id: body.site_id,
      stop_order: body.stop_order ?? 0,
      scheduled_start: body.scheduled_start ?? null,
      scheduled_end: body.scheduled_end ?? null,
      estimated_hours: body.estimated_hours ?? null,
      travel_date: body.travel_date ?? null,
      notes: body.notes ?? null,
      status: 'planned',
    }).select().single()
    if (error) return res.status(500).json({ message: error.message })
    return res.status(201).json({ data: await stopDetail(stop.id) })
  }

  if (req.method === 'PATCH') {
    if (!id) return res.status(400).json({ message: 'id query param required' })
    const updates = {}
    for (const f of STOP_FIELDS) if (f in body) updates[f] = body[f]
    if (Object.keys(updates).length) {
      const { error } = await supa.from('route_plan_stops').update(updates).eq('id', id)
      if (error) return res.status(500).json({ message: error.message })
    }
    const stop = await stopDetail(id)
    if (!stop) return res.status(404).json({ message: 'Stop not found' })
    return res.json({ data: stop })
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ message: 'id query param required' })
    const { error } = await supa.from('route_plan_stops').delete().eq('id', id)
    if (error) return res.status(500).json({ message: error.message })
    return res.status(204).end()
  }

  if (req.method === 'PUT') {
    if (!body.team_id || !Array.isArray(body.stop_ids)) {
      return res.status(400).json({ message: 'team_id and stop_ids are required' })
    }
    for (let i = 0; i < body.stop_ids.length; i++) {
      await query(
        'update route_plan_stops set stop_order = $1 where id = $2 and team_id = $3',
        [i, body.stop_ids[i], body.team_id],
      )
    }
    return res.json({ ok: true })
  }

  return res.status(405).json({ message: 'Method not allowed' })
}

export default withSecurity(handler)
