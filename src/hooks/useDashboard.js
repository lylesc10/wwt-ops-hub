import { useState, useEffect, useCallback } from 'react'
import { dab } from '@/lib/dab'
import { startOfWeek, endOfWeek, addWeeks, format, parseISO, isWithinInterval } from 'date-fns'

export function useDashboard() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {

    const PAGE = 1000
    let sites = [], from = 0
    while (true) {
      const { data: rows, error } = await dab
        .from('sites')
        .select('id,code,status,scheduled_start,scheduled_end,state,fst_owner,onsite_tech,fn_wo_id,project_id')
        .range(from, from + PAGE - 1)
        .order('code')
      if (error) { console.error('[Dashboard] sites fetch error:', error.message); break }
      if (!rows?.length) break
      sites = [...sites, ...rows]
      if (rows.length < PAGE) break
      from += PAGE
    }

    const [alertsRes, projectsRes] = await Promise.all([
      dab.from('alert_log').select('id,alert_type,status,created_at').order('created_at', { ascending: false }).limit(200),
      dab.from('projects').select('id,name,client,color').eq('is_active', true),
    ])

    const alerts   = alertsRes.data   ?? []
    const projects = projectsRes.data ?? []

    const statusCounts = sites.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1
      return acc
    }, {})

    const completed  = statusCounts.completed  ?? 0
    const scheduled  = statusCounts.scheduled  ?? 0
    const staffed    = statusCounts.staffed     ?? 0
    const inProgress = statusCounts.in_progress ?? 0
    const cancelled  = statusCounts.cancelled   ?? 0
    const total      = sites.length
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0
    const unstaffed = sites.filter(s => !['completed','cancelled'].includes(s.status) && !s.onsite_tech).length
    const withFNWO  = sites.filter(s => s.fn_wo_id).length
    const noDate    = sites.filter(s => !s.scheduled_start && !['completed','cancelled'].includes(s.status)).length

    const now = new Date()
    const weeklyData = Array.from({ length: 8 }, (_, i) => {
      const wkStart = startOfWeek(addWeeks(now, i - 1), { weekStartsOn: 1 })
      const wkEnd   = endOfWeek(wkStart, { weekStartsOn: 1 })
      const inWeek  = sites.filter(s => {
        if (!s.scheduled_start) return false
        try { return isWithinInterval(parseISO(s.scheduled_start), { start: wkStart, end: wkEnd }) }
        catch { return false }
      })
      return {
        week:      format(wkStart, 'M/d'),
        label:     `Wk ${format(wkStart, 'w')}`,
        total:     inWeek.length,
        completed: inWeek.filter(s => s.status === 'completed').length,
        isNow:     i === 1,
      }
    })

    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 })
    const thisWeekEnd   = endOfWeek(now, { weekStartsOn: 1 })
    const nextWeekStart = startOfWeek(addWeeks(now, 1), { weekStartsOn: 1 })
    const nextWeekEnd   = endOfWeek(nextWeekStart, { weekStartsOn: 1 })

    const thisWeek = sites.filter(s => {
      if (!s.scheduled_start) return false
      try { return isWithinInterval(parseISO(s.scheduled_start), { start: thisWeekStart, end: thisWeekEnd }) }
      catch { return false }
    })
    const nextWeek = sites.filter(s => {
      if (!s.scheduled_start) return false
      try { return isWithinInterval(parseISO(s.scheduled_start), { start: nextWeekStart, end: nextWeekEnd }) }
      catch { return false }
    })

    const stateCounts = sites.reduce((acc, s) => {
      if (s.state) acc[s.state] = (acc[s.state] ?? 0) + 1
      return acc
    }, {})
    const topStates = Object.entries(stateCounts)
      .sort(([,a],[,b]) => b - a).slice(0, 12)
      .map(([state, count]) => ({
        state, count,
        completed: sites.filter(s => s.state === state && s.status === 'completed').length,
        pct: Math.round((count / total) * 100),
      }))

    const fstCounts = sites.reduce((acc, s) => {
      const fst = s.fst_owner || 'Unassigned'
      if (!acc[fst]) acc[fst] = { total: 0, completed: 0, unstaffed: 0 }
      acc[fst].total++
      if (s.status === 'completed') acc[fst].completed++
      if (!s.onsite_tech && !['completed','cancelled'].includes(s.status)) acc[fst].unstaffed++
      return acc
    }, {})
    const fstBreakdown = Object.entries(fstCounts)
      .sort(([,a],[,b]) => b.total - a.total).slice(0, 8)
      .map(([fst, d]) => ({ fst, ...d, pct: Math.round((d.completed / d.total) * 100) }))

    const activeAlerts  = alerts.filter(a => a.status === 'active').length
    const dateChanges   = alerts.filter(a => a.alert_type === 'date_change' && a.status === 'active').length
    const cancellations = alerts.filter(a => a.alert_type === 'provider_cancelled' && a.status === 'active').length

    setData({
      total, completed, scheduled, staffed, inProgress, cancelled,
      completionPct, unstaffed, withFNWO, noDate,
      weeklyData, thisWeek, nextWeek,
      topStates, fstBreakdown, statusCounts,
      activeAlerts, dateChanges, cancellations,
      projects,
      lastUpdated: new Date(),
    })
    } catch(err) {
      console.error('[Dashboard] fetch error:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [loadData])

  return { data, loading, refetch: loadData }
}
