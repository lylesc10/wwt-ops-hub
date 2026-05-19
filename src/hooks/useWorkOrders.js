import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export function useWorkOrders({ siteId = null, status = null } = {}) {
  const [workOrders, setWorkOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchWOs = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('work_orders')
      .select(`
        *,
        site:sites(id, code, branch_name, project:projects(name, client)),
        assignments(*)
      `)
      .order('created_at', { ascending: false })

    if (siteId) query = query.eq('site_id', siteId)
    if (status)  query = query.eq('status', status)

    const { data, error } = await query
    if (error) setError(error.message)
    else setWorkOrders(data ?? [])
    setLoading(false)
  }, [siteId, status])

  useEffect(() => {
    fetchWOs()
    const channel = supabase
      .channel(`wo-changes-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, fetchWOs)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchWOs])

  return { workOrders, loading, error, refetch: fetchWOs }
}
