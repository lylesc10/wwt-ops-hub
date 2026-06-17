import { useState, useEffect, useCallback } from 'react'
import { dab } from '@/lib/dab'

export function useAlerts({ activeOnly = true } = {}) {
  const [alerts,  setAlerts]  = useState([])
  const [count,   setCount]   = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchAlerts = useCallback(async () => {
    let query = dab
      .from('alert_log')
      .select('*')
      .limit(500)
      .order('created_at', { ascending: false })

    if (activeOnly) query = query.eq('status', 'active')

    const { data, error } = await query
    if (error) { console.error('[useAlerts]', error.message); setLoading(false); return }

    // Fetch site codes for all alerts (DAB doesn't support PostgREST embedding)
    const siteIds = [...new Set((data ?? []).map(a => a.site_id).filter(Boolean))]
    const { data: sites } = siteIds.length
      ? await dab.from('sites').select('id,code,branch_name').in('id', siteIds)
      : { data: [] }
    const siteMap = Object.fromEntries((sites ?? []).map(s => [s.id, s]))

    const hydrated = (data ?? []).map(a => ({ ...a, site: siteMap[a.site_id] ?? null }))
    setAlerts(hydrated)
    setCount(hydrated.filter(a => a.status === 'active').length)
    setLoading(false)
  }, [activeOnly])

  useEffect(() => {
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 30_000)
    const onVisibility = () => { if (!document.hidden) fetchAlerts() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchAlerts])

  const acknowledge = useCallback(async (alertId, userId) => {
    await dab.from('alert_log').update({
      status:          'acknowledged',
      acknowledged_by: userId,
      acknowledged_at: new Date().toISOString(),
    }).eq('id', alertId)
    fetchAlerts()
  }, [fetchAlerts])

  const resolve = useCallback(async (alertId) => {
    await dab.from('alert_log').update({
      status:      'resolved',
      resolved_at: new Date().toISOString(),
    }).eq('id', alertId)
    fetchAlerts()
  }, [fetchAlerts])

  return { alerts, count, loading, acknowledge, resolve, refetch: fetchAlerts }
}
