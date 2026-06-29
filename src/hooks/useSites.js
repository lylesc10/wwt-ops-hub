import { useState, useEffect, useCallback } from 'react'
import { dab } from '@/lib/dab'

export function useSites({ projectId = null } = {}) {
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSites = useCallback(async () => {
    setLoading(true)

    const { data: activeProjects } = await dab
      .from('projects')
      .select('id,name,client,color')
      .eq('is_active', true)

    const activeIds = (activeProjects ?? []).map(p => p.id)
    if (!activeIds.length) { setSites([]); setLoading(false); return }

    const projectMap = Object.fromEntries((activeProjects ?? []).map(p => [p.id, p]))

    // Fetch work_orders for all active projects in one query (no PostgREST-style embedding in DAB)
    const { data: allWOs } = await dab
      .from('work_orders')
      .select('id,wo_type,status,fn_wo_id,site_id')
      .in('project_id', activeIds)

    const wosBySite = {}
    for (const wo of allWOs ?? []) {
      if (!wosBySite[wo.site_id]) wosBySite[wo.site_id] = []
      wosBySite[wo.site_id].push(wo)
    }

    const PAGE = 1000
    let allSites = [], from = 0

    while (true) {
      let query = dab
        .from('sites')
        .select('*')
        .in('project_id', activeIds)
        .order('code', { ascending: true })
        .range(from, from + PAGE - 1)

      if (projectId) query = query.eq('project_id', projectId)

      const { data, error } = await query
      if (error) { setError(error.message); break }
      if (!data?.length) break

      const hydrated = data.map(site => ({
        ...site,
        project:     projectMap[site.project_id] ?? null,
        work_orders: wosBySite[site.id] ?? [],
      }))

      allSites = [...allSites, ...hydrated]
      if (data.length < PAGE) break
      from += PAGE
    }
    setSites(allSites)
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    fetchSites()
    const interval = setInterval(fetchSites, 60_000)
    const onVisibility = () => { if (!document.hidden) fetchSites() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchSites])

  return { sites, loading, error, refetch: fetchSites }
}
