import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Expected WO types for a full LVV site (can be configured per project)
export const EXPECTED_WO_TYPES = ['LVL', 'LVT', 'DEL', 'BRK', 'INL', 'INT']

export const WO_TYPE_META = {
  LVL: { label: 'LV Lead',      color: '#6366f1', days: 3, techs: 1 },
  LVT: { label: 'LV Tech',      color: '#3b82f6', days: 3, techs: 3 },
  DEL: { label: 'Delivery',     color: '#f59e0b', days: 1, techs: 1 },
  BRK: { label: 'Backboard',    color: '#a855f7', days: 1, techs: 1 },
  INL: { label: 'Install Lead', color: '#10b981', days: 1, techs: 1 },
  INT: { label: 'Install Tech', color: '#06b6d4', days: 1, techs: 1 },
}

export const FN_STATUS_META = {
  draft:      { label: 'Draft',     color: '#6b7280' },
  published:  { label: 'Published', color: '#3b82f6' },
  routed:     { label: 'Routed',    color: '#a855f7' },
  assigned:   { label: 'Assigned',  color: '#10b981' },
  work_done:  { label: 'Done',      color: '#f59e0b' },
  approved:   { label: 'Approved',  color: '#10b981' },
  paid:       { label: 'Paid',      color: '#6b7280' },
  cancelled:  { label: 'Cancelled', color: '#f43f5e' },
  UNKNOWN:    { label: 'Unknown',   color: '#6b7280' },
}

export function useSiteWorkOrders(siteId) {
  const [workOrders, setWorkOrders] = useState([])
  const [loading,    setLoading]    = useState(true)

  const fetch = useCallback(async () => {
    if (!siteId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('site_work_orders')
      .select('*')
      .eq('site_id', siteId)
      .order('wo_type').order('wo_number')
    setWorkOrders(data ?? [])
    setLoading(false)
  }, [siteId])

  useEffect(() => { fetch() }, [fetch])

  // Realtime
  useEffect(() => {
    if (!siteId) return
    const channel = supabase
      .channel(`swo-${siteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_work_orders', filter: `site_id=eq.${siteId}` }, fetch)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [siteId, fetch])

  // Group by type
  const byType = workOrders.reduce((acc, wo) => {
    if (!acc[wo.wo_type]) acc[wo.wo_type] = []
    acc[wo.wo_type].push(wo)
    return acc
  }, {})

  // Coverage check — which expected types have at least one WO
  const coverage = EXPECTED_WO_TYPES.reduce((acc, type) => {
    const wos = byType[type] ?? []
    acc[type] = {
      expected: WO_TYPE_META[type]?.techs ?? 1,
      have:     wos.length,
      complete: wos.every(w => ['approved','paid','work_done'].includes(w.fn_status)),
      assigned: wos.some(w => ['assigned','work_done','approved','paid'].includes(w.fn_status)),
      wos,
    }
    return acc
  }, {})

  const missingTypes  = EXPECTED_WO_TYPES.filter(t => !byType[t]?.length)
  const totalWOs      = workOrders.length
  const completedWOs  = workOrders.filter(w => ['approved','paid','work_done'].includes(w.fn_status)).length
  const assignedWOs   = workOrders.filter(w => ['assigned','work_done','approved','paid'].includes(w.fn_status)).length
  const cancelledWOs  = workOrders.filter(w => w.fn_status === 'cancelled').length

  return {
    workOrders, loading, byType, coverage,
    missingTypes, totalWOs, completedWOs, assignedWOs, cancelledWOs,
    refetch: fetch,
  }
}

// Project-level summary — how many sites are fully covered vs missing WO types
export function useProjectWOCoverage(projectId) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!projectId) return
    setLoading(true)

    // Get count of WOs by type across all sites in project
    const { data: wos } = await supabase
      .from('site_work_orders')
      .select('site_id, wo_type, fn_status')
      .eq('project_id', projectId)

    if (!wos) { setLoading(false); return }

    // Group by site
    const bySite = wos.reduce((acc, wo) => {
      if (!acc[wo.site_id]) acc[wo.site_id] = {}
      if (!acc[wo.site_id][wo.wo_type]) acc[wo.site_id][wo.wo_type] = []
      acc[wo.site_id][wo.wo_type].push(wo.fn_status)
      return acc
    }, {})

    const siteCount = Object.keys(bySite).length

    // Type coverage across all sites
    const typeCoverage = EXPECTED_WO_TYPES.map(type => ({
      type,
      label:    WO_TYPE_META[type]?.label ?? type,
      color:    WO_TYPE_META[type]?.color ?? '#6b7280',
      sites_with: Object.values(bySite).filter(s => s[type]?.length).length,
      total_wos:  wos.filter(w => w.wo_type === type).length,
      assigned:   wos.filter(w => w.wo_type === type && ['assigned','work_done','approved','paid'].includes(w.fn_status)).length,
      completed:  wos.filter(w => w.wo_type === type && ['approved','paid','work_done'].includes(w.fn_status)).length,
    }))

    setData({
      total_wos:    wos.length,
      sites_with_wos: siteCount,
      type_coverage: typeCoverage,
      by_status: Object.entries(
        wos.reduce((acc, w) => { acc[w.fn_status ?? 'unknown'] = (acc[w.fn_status ?? 'unknown'] ?? 0) + 1; return acc }, {})
      ).sort(([,a],[,b]) => b - a),
    })
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, refetch: fetch }
}
