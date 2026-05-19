import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export function useAlerts({ activeOnly = true } = {}) {
  const [alerts,  setAlerts]  = useState([])
  const [count,   setCount]   = useState(0)
  const [loading, setLoading] = useState(true)
  const channelRef = useRef(null)

  const fetchAlerts = useCallback(async () => {
    let query = supabase
      .from('alert_log')
      .select('*, site:sites(code, branch_name)')
      .limit(500)
      .order('created_at', { ascending: false })

    if (activeOnly) query = query.eq('status', 'active')

    const { data, error } = await query
    if (error) { console.error('[useAlerts]', error.message); setLoading(false); return }
    setAlerts(data ?? [])
    setCount((data ?? []).filter(a => a.status === 'active').length)
    setLoading(false)
  }, [activeOnly])

  useEffect(() => {
    fetchAlerts()

    // Use a unique channel name to avoid conflicts across hook instances
    const channelName = `alert-changes-${Math.random().toString(36).slice(2, 8)}`

    // Clean up any previous channel first
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'alert_log',
      }, fetchAlerts)
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [fetchAlerts])

  const acknowledge = useCallback(async (alertId, userId) => {
    await supabase.from('alert_log').update({
      status:          'acknowledged',
      acknowledged_by: userId,
      acknowledged_at: new Date().toISOString(),
    }).eq('id', alertId)
    fetchAlerts()
  }, [fetchAlerts])

  const resolve = useCallback(async (alertId) => {
    await supabase.from('alert_log').update({
      status:      'resolved',
      resolved_at: new Date().toISOString(),
    }).eq('id', alertId)
    fetchAlerts()
  }, [fetchAlerts])

  return { alerts, count, loading, acknowledge, resolve, refetch: fetchAlerts }
}
