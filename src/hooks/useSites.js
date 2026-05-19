import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Fetches all sites, optionally filtered by project.
 * Subscribes to realtime updates.
 */
export function useSites({ projectId = null } = {}) {
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSites = useCallback(async () => {
    setLoading(true)

    // Get active project IDs first — avoids unreliable joined-table filter
    const { data: activeProjects } = await supabase
      .from('projects')
      .select('id')
      .eq('is_active', true)

    const activeIds = (activeProjects ?? []).map(p => p.id)
    if (!activeIds.length) { setSites([]); setLoading(false); return }

    const PAGE = 1000
    let allSites = [], from = 0

    while (true) {
      let query = supabase
        .from('sites')
        .select(`
          *,
          project:projects(id, name, client, color),
          work_orders(id, wo_type, status, fn_wo_id)
        `)
        .in('project_id', activeIds)
        .order('code', { ascending: true })
        .range(from, from + PAGE - 1)

      if (projectId) query = query.eq('project_id', projectId)

      const { data, error } = await query
      if (error) { setError(error.message); break }
      if (!data?.length) break
      allSites = [...allSites, ...data]
      if (data.length < PAGE) break
      from += PAGE
    }
    setSites(allSites)
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    fetchSites()

    // Realtime subscription
    const channel = supabase
      .channel(`sites-changes-${Math.random().toString(36).slice(2,8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sites' }, fetchSites)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchSites])

  return { sites, loading, error, refetch: fetchSites }
}
