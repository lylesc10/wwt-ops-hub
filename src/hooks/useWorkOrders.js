import { useState, useEffect, useCallback } from 'react'
import { dab } from '@/lib/dab'

export function useWorkOrders({ siteId = null, status = null } = {}) {
  const [workOrders, setWorkOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchWOs = useCallback(async () => {
    setLoading(true)
    let query = dab.from('work_orders').select('*').order('created_at', { ascending: false })
    if (siteId) query = query.eq('site_id', siteId)
    if (status)  query = query.eq('status', status)

    const { data: wos, error: woErr } = await query
    if (woErr) { setError(woErr.message); setLoading(false); return }

    // Fetch related sites + projects + assignments (DAB doesn't support PostgREST embedding)
    const siteIds = [...new Set((wos ?? []).map(w => w.site_id).filter(Boolean))]
    const woIds   = (wos ?? []).map(w => w.id)

    const [sitesRes, assignmentsRes] = await Promise.all([
      siteIds.length
        ? dab.from('sites').select('id,code,branch_name,project_id').in('id', siteIds)
        : { data: [] },
      woIds.length
        ? dab.from('assignments').select('*').in('work_order_id', woIds)
        : { data: [] },
    ])

    const projectIds = [...new Set((sitesRes.data ?? []).map(s => s.project_id).filter(Boolean))]
    const { data: projects } = projectIds.length
      ? await dab.from('projects').select('id,name,client').in('id', projectIds)
      : { data: [] }

    const projectMap = Object.fromEntries((projects ?? []).map(p => [p.id, p]))
    const siteMap    = Object.fromEntries(
      (sitesRes.data ?? []).map(s => [s.id, { ...s, project: projectMap[s.project_id] ?? null }])
    )
    const assignmentsByWO = {}
    for (const a of assignmentsRes.data ?? []) {
      if (!assignmentsByWO[a.work_order_id]) assignmentsByWO[a.work_order_id] = []
      assignmentsByWO[a.work_order_id].push(a)
    }

    const hydrated = (wos ?? []).map(w => ({
      ...w,
      site:        siteMap[w.site_id] ?? null,
      assignments: assignmentsByWO[w.id] ?? [],
    }))

    setWorkOrders(hydrated)
    setLoading(false)
  }, [siteId, status])

  useEffect(() => {
    fetchWOs()
    const interval = setInterval(fetchWOs, 60_000)
    const onVisibility = () => { if (!document.hidden) fetchWOs() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchWOs])

  return { workOrders, loading, error, refetch: fetchWOs }
}
