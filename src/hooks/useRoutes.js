import { useState, useEffect, useCallback } from 'react'
import { dab } from '@/lib/dab'

export function useRoutes({ projectId = null } = {}) {
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchRoutes = useCallback(async () => {
    setLoading(true)
    let query = dab
      .from('routes')
      .select('*')
      .eq('is_active', true)
      .order('week_start', { ascending: true })

    if (projectId) query = query.eq('project_id', projectId)

    const { data: routeRows, error: routeErr } = await query
    if (routeErr) { setError(routeErr.message); setLoading(false); return }

    // Fetch projects and sites separately (DAB doesn't support PostgREST embedding)
    const routeIds  = (routeRows ?? []).map(r => r.id)
    const projIds   = [...new Set((routeRows ?? []).map(r => r.project_id).filter(Boolean))]

    const [projectsRes, sitesRes] = await Promise.all([
      projIds.length
        ? dab.from('projects').select('id,name,client,color').in('id', projIds)
        : { data: [] },
      routeIds.length
        ? dab.from('sites')
            .select('id,code,branch_name,status,scheduled_start,scheduled_end,state,city,route_id')
            .in('route_id', routeIds)
        : { data: [] },
    ])

    const projectMap = Object.fromEntries((projectsRes.data ?? []).map(p => [p.id, p]))
    const sitesByRoute = {}
    for (const s of sitesRes.data ?? []) {
      if (!sitesByRoute[s.route_id]) sitesByRoute[s.route_id] = []
      sitesByRoute[s.route_id].push(s)
    }

    const hydrated = (routeRows ?? []).map(r => ({
      ...r,
      project: projectMap[r.project_id] ?? null,
      sites:   sitesByRoute[r.id] ?? [],
    }))

    setRoutes(hydrated)
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetchRoutes() }, [fetchRoutes])

  const createRoute = useCallback(async (fields) => {
    const { data, error } = await dab
      .from('routes')
      .insert(fields)
      .select()
      .single()
    if (error) throw new Error(error.message)
    await fetchRoutes()
    return data
  }, [fetchRoutes])

  const updateRoute = useCallback(async (id, fields) => {
    const { error } = await dab
      .from('routes')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchRoutes()
  }, [fetchRoutes])

  const deleteRoute = useCallback(async (id) => {
    await dab.from('sites').update({ route_id: null }).eq('route_id', id)
    const { error } = await dab.from('routes').update({ is_active: false }).eq('id', id)
    if (error) throw new Error(error.message)
    await fetchRoutes()
  }, [fetchRoutes])

  const assignSiteToRoute = useCallback(async (siteId, routeId) => {
    const { error } = await dab
      .from('sites')
      .update({ route_id: routeId })
      .eq('id', siteId)
    if (error) throw new Error(error.message)
    await fetchRoutes()
  }, [fetchRoutes])

  const removeSiteFromRoute = useCallback(async (siteId) => {
    const { error } = await dab
      .from('sites')
      .update({ route_id: null })
      .eq('id', siteId)
    if (error) throw new Error(error.message)
    await fetchRoutes()
  }, [fetchRoutes])

  const suggestRoutes = useCallback(async (pId) => {
    const { data: sites } = await dab
      .from('sites')
      .select('id,code,branch_name,state,city,scheduled_start,scheduled_end,route_id')
      .eq('project_id', pId)
      .is('route_id', null)
      .not('scheduled_start', 'is', null)
      .order('scheduled_start')
      .limit(2000)

    if (!sites?.length) return []

    const groups = {}
    for (const site of sites) {
      const weekStart = getWeekStart(new Date(site.scheduled_start))
      const cityKey   = `${site.state}-${site.city ?? ''}-${weekStart}`
      if (!groups[cityKey]) {
        groups[cityKey] = {
          state: site.state,
          city:  site.city ?? null,
          weekStart,
          weekEnd: getWeekEnd(new Date(site.scheduled_start)),
          sites:   [],
        }
      }
      groups[cityKey].sites.push(site)
    }

    const merged = {}
    for (const [key, group] of Object.entries(groups)) {
      if (group.sites.length >= 2) {
        merged[key] = group
      } else {
        const stateKey = `${group.state}-${group.weekStart}`
        if (!merged[stateKey]) {
          merged[stateKey] = { state: group.state, city: null, weekStart: group.weekStart, weekEnd: group.weekEnd, sites: [] }
        }
        merged[stateKey].sites.push(...group.sites)
      }
    }

    return Object.values(merged)
      .filter(g => g.sites.length >= 2)
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
  }, [])

  return {
    routes, loading, error, refetch: fetchRoutes,
    createRoute, updateRoute, deleteRoute,
    assignSiteToRoute, removeSiteFromRoute,
    suggestRoutes,
  }
}

function getWeekStart(date) {
  const d   = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

function getWeekEnd(date) {
  const d = new Date(getWeekStart(date))
  d.setDate(d.getDate() + 6)
  return d.toISOString().split('T')[0]
}
