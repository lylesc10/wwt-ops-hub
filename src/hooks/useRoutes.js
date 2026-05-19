import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export function useRoutes({ projectId = null } = {}) {
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchRoutes = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('routes')
      .select(`
        *,
        project:projects(id, name, client, color),
        sites(id, code, branch_name, status, scheduled_start, scheduled_end, state, city)
      `)
      .eq('is_active', true)
      .order('week_start', { ascending: true })

    if (projectId) query = query.eq('project_id', projectId)

    const { data, error } = await query
    if (error) setError(error.message)
    else setRoutes(data ?? [])
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetchRoutes() }, [fetchRoutes])

  const createRoute = useCallback(async (fields) => {
    const { data, error } = await supabase
      .from('routes')
      .insert(fields)
      .select()
      .single()
    if (error) throw new Error(error.message)
    await fetchRoutes()
    return data
  }, [fetchRoutes])

  const updateRoute = useCallback(async (id, fields) => {
    const { error } = await supabase
      .from('routes')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchRoutes()
  }, [fetchRoutes])

  const deleteRoute = useCallback(async (id) => {
    // Unlink all sites first
    await supabase.from('sites').update({ route_id: null }).eq('route_id', id)
    const { error } = await supabase.from('routes').update({ is_active: false }).eq('id', id)
    if (error) throw new Error(error.message)
    await fetchRoutes()
  }, [fetchRoutes])

  const assignSiteToRoute = useCallback(async (siteId, routeId) => {
    const { error } = await supabase
      .from('sites')
      .update({ route_id: routeId })
      .eq('id', siteId)
    if (error) throw new Error(error.message)
    await fetchRoutes()
  }, [fetchRoutes])

  const removeSiteFromRoute = useCallback(async (siteId) => {
    const { error } = await supabase
      .from('sites')
      .update({ route_id: null })
      .eq('id', siteId)
    if (error) throw new Error(error.message)
    await fetchRoutes()
  }, [fetchRoutes])

  // Auto-suggest routes based on state + scheduled week
  const suggestRoutes = useCallback(async (projectId) => {
    const { data: sites } = await supabase
      .from('sites')
      .select('id, code, branch_name, state, city, scheduled_start, scheduled_end, route_id').limit(2000)
      .eq('project_id', projectId)
      .is('route_id', null)
      .not('scheduled_start', 'is', null)
      .order('scheduled_start')

    if (!sites?.length) return []

    // Group by state + city + ISO week for geographic routes
    const groups = {}
    for (const site of sites) {
      const weekStart = getWeekStart(new Date(site.scheduled_start))
      // Try city-level first, fall back to state
      const cityKey = `${site.state}-${site.city ?? ''}-${weekStart}`
      const stateKey = `${site.state}-${weekStart}`
      const key = cityKey
      if (!groups[key]) {
        groups[key] = {
          state: site.state,
          city: site.city ?? null,
          weekStart,
          weekEnd: getWeekEnd(new Date(site.scheduled_start)),
          sites: [],
        }
      }
      groups[key].sites.push(site)
    }

    // Merge small city groups into state groups
    const merged = {}
    for (const [key, group] of Object.entries(groups)) {
      if (group.sites.length >= 2) {
        merged[key] = group
      } else {
        // Merge into state group
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

// Helpers
function getWeekStart(date) {
  const d = new Date(date)
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
