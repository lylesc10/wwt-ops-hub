/**
 * API client for the route planning endpoints (/api/route-plans/*).
 * Mirrors the field-services routePlanning API surface, adapted to
 * ops-hub entities (projects instead of engagements, technicians as members).
 */

import { getSession } from '@/lib/auth'

async function api(path, { method = 'GET', body } = {}) {
  const session = getSession()
  const headers = { 'Content-Type': 'application/json' }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`

  const res = await fetch(`/api/route-plans${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.message ?? `Request failed (${res.status})`)
  return json.data ?? json
}

// ── Plans ─────────────────────────────────────────────────────────────────────

export const listRoutePlans = () => api('')
export const getRoutePlan = (id, { includeSites = false } = {}) =>
  api(`?id=${id}${includeSites ? '&include=sites' : ''}`)
export const createRoutePlan = (body) => api('', { method: 'POST', body })
export const updateRoutePlan = (id, body) => api(`?id=${id}`, { method: 'PATCH', body })
export const deleteRoutePlan = (id) => api(`?id=${id}`, { method: 'DELETE' })

// ── Teams ─────────────────────────────────────────────────────────────────────

export const createTeam = (planId, body) =>
  api('/teams', { method: 'POST', body: { ...body, plan_id: planId } })
export const updateTeam = (teamId, body) =>
  api(`/teams?id=${teamId}`, { method: 'PATCH', body })
export const deleteTeam = (teamId) => api(`/teams?id=${teamId}`, { method: 'DELETE' })

// ── Stops ─────────────────────────────────────────────────────────────────────

export const createStop = (planId, body) =>
  api('/stops', { method: 'POST', body: { ...body, plan_id: planId } })
export const updateStop = (stopId, body) =>
  api(`/stops?id=${stopId}`, { method: 'PATCH', body })
export const deleteStop = (stopId) => api(`/stops?id=${stopId}`, { method: 'DELETE' })
export const reorderStops = (teamId, stopIds) =>
  api('/stops', { method: 'PUT', body: { team_id: teamId, stop_ids: stopIds } })

// ── Plan actions ──────────────────────────────────────────────────────────────

const action = (planId, name, extra = {}) =>
  api('/actions', { method: 'POST', body: { plan_id: planId, action: name, ...extra } })

export const generateSchedule = (planId) => action(planId, 'generate-schedule')
export const optimizePlan = (planId) => action(planId, 'optimize')
export const getConflicts = (planId) => action(planId, 'conflicts')
export const resolveConflict = (planId, body) => action(planId, 'resolve-conflict', body)
export const resolveAllConflicts = (planId) => action(planId, 'resolve-all-conflicts')
export const approvePlan = (planId) => action(planId, 'approve')
export const runWhatIf = (planId, scenarios) => action(planId, 'what-if', { scenarios })
export const suggestTeams = (planId, techsPerSite = 2) =>
  action(planId, 'suggest-teams', { techs_per_site: techsPerSite })

// ── Geocode + overview ────────────────────────────────────────────────────────

export const batchGeocode = async (locations) => {
  const json = await api('/geocode', { method: 'POST', body: { locations } })
  return json.results ?? {}
}

export const getScheduleOverview = (start, end) => {
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  const qs = params.toString()
  return api(`/overview${qs ? `?${qs}` : ''}`)
}
