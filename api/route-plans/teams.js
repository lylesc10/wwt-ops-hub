/**
 * /api/route-plans/teams — team CRUD within a plan.
 *
 *   POST              → create { plan_id, name, color?, member_ids? (technician uuids) }
 *   PATCH ?id=<uuid>  → update { name?, color?, member_ids? (replaces members) }
 *   DELETE ?id=<uuid> → delete team (cascades members + stops)
 */

import { query, supa } from '../_lib/db.js'
import { withSecurity } from '../_lib/middleware.js'

async function teamResponse(teamId) {
  const { data: team } = await supa.from('route_plan_teams').select('*').eq('id', teamId).single()
  if (!team) return null
  const { rows: members } = await query(
    `select m.technician_id, m.role, t.full_name as tech_name
     from route_plan_team_members m
     join technicians t on t.id = m.technician_id
     where m.team_id = $1`,
    [teamId],
  )
  return {
    id: team.id,
    name: team.name,
    color: team.color ?? '#3B82F6',
    members: members.map((m) => ({
      technician_id: m.technician_id, tech_name: m.tech_name, role: m.role ?? 'member',
    })),
    stops: [],
  }
}

async function replaceMembers(teamId, memberIds) {
  await query('delete from route_plan_team_members where team_id = $1', [teamId])
  for (const techId of memberIds) {
    await supa.from('route_plan_team_members').insert({
      team_id: teamId, technician_id: techId, role: 'member',
    })
  }
}

async function handler(req, res) {
  const id = req.query?.id
  const body = req.body ?? {}

  if (req.method === 'POST') {
    if (!body.plan_id || !body.name) {
      return res.status(400).json({ message: 'plan_id and name are required' })
    }
    const { data: team, error } = await supa.from('route_plan_teams').insert({
      route_plan_id: body.plan_id,
      name: body.name,
      color: body.color ?? '#3B82F6',
    }).select().single()
    if (error) return res.status(500).json({ message: error.message })

    await replaceMembers(team.id, body.member_ids ?? [])
    return res.status(201).json({ data: await teamResponse(team.id) })
  }

  if (req.method === 'PATCH') {
    if (!id) return res.status(400).json({ message: 'id query param required' })
    const updates = {}
    if (body.name != null) updates.name = body.name
    if (body.color != null) updates.color = body.color
    if (Object.keys(updates).length) {
      const { error } = await supa.from('route_plan_teams').update(updates).eq('id', id)
      if (error) return res.status(500).json({ message: error.message })
    }
    if (Array.isArray(body.member_ids)) await replaceMembers(id, body.member_ids)

    const team = await teamResponse(id)
    if (!team) return res.status(404).json({ message: 'Team not found' })
    return res.json({ data: team })
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ message: 'id query param required' })
    const { error } = await supa.from('route_plan_teams').delete().eq('id', id)
    if (error) return res.status(500).json({ message: error.message })
    return res.status(204).end()
  }

  return res.status(405).json({ message: 'Method not allowed' })
}

export default withSecurity(handler)
