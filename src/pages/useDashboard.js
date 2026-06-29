import { useState, useEffect, useCallback } from 'react'
import { dab } from '@/lib/dab'
import { startOfWeek, endOfWeek, addWeeks, format, parseISO, isWithinInterval } from 'date-fns'

export function useDashboard({ projectId = null, viewScope = 'all', userId = null, userName = null } = {}) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!projectId && viewScope === 'mine' && !userId && !userName) { setLoading(false); return }
    setLoading(true)

    // Run all queries in parallel
    const [
      sitesRes,
      alertsRes,
      projectsRes,
      recentChangesRes,
    ] = await Promise.all([
      // Fetch all sites across all pages (with project + scope filter)
      (async () => {
        // First get active project IDs
        const { data: activeProjs } = await dab
          .from('projects').select('id').eq('is_active', true)
        const activeIds = (activeProjs ?? []).map(p => p.id)
        if (!activeIds.length) return { data: [] }

        const PAGE = 1000
        let all = [], from = 0
        while (true) {
          let q = dab.from('sites')
            .select('id, code, status, scheduled_start, scheduled_end, state, fst_owner, onsite_tech, fn_wo_id, project_id, assigned_rft_id')
            .in('project_id', projectId ? [projectId] : activeIds)
            .range(from, from + PAGE - 1)
          // 'mine' scope: filter is applied post-fetch since fst_owner is a text field
          // We still fetch all, then filter below
          const { data, error } = await q
          if (error || !data?.length) break
          all = [...all, ...data]
          if (data.length < PAGE) break
          from += PAGE
        }
        return { data: all }
      })(),
      dab.from('alert_log').select('id, alert_type, status, created_at').order('created_at', { ascending: false }).limit(200),
      dab.from('projects').select('id, name, client, color').eq('is_active', true),
      dab.from('sync_log').select('id, field_name, old_value, new_value, created_at').order('created_at', { ascending: false }).limit(50),
    ])

    let sites = sitesRes.data ?? []
    // Apply 'mine' scope post-fetch — matches assigned_rft_id OR fst_owner name
    if (viewScope === 'mine' && (userId || userName)) {
      sites = sites.filter(s =>
        (userId && s.assigned_rft_id === userId) ||
        (userName && (s.fst_owner ?? '').toLowerCase() === userName.toLowerCase())
      )
    }
    const alerts     = alertsRes.data   ?? []
    const projects   = projectsRes.data ?? []
    const changes    = recentChangesRes.data ?? []

    // ── Status breakdown ───────────────────────────────────
    const statusCounts = sites.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1
      return acc
    }, {})

    const completed  = statusCounts.completed  ?? 0
    const scheduled  = statusCounts.scheduled  ?? 0
    const staffed    = statusCounts.staffed     ?? 0
    const inProgress = statusCounts.in_progress ?? 0
    const cancelled  = statusCounts.cancelled   ?? 0
    const flagged    = (statusCounts.flagged_date_change ?? 0) + (statusCounts.flagged_payment ?? 0)
    const total      = sites.length

    // ── Completion % ──────────────────────────────────────
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0

    // ── Staffing stats ────────────────────────────────────
    const unstaffed = sites.filter(s =>
      !['completed','cancelled'].includes(s.status) && !s.onsite_tech
    ).length

    const withFNWO = sites.filter(s => s.fn_wo_id).length

    // ── Weekly throughput (next 8 weeks) ──────────────────
    const now = new Date()
    const weeklyData = Array.from({ length: 8 }, (_, i) => {
      const wkStart = startOfWeek(addWeeks(now, i - 1), { weekStartsOn: 1 })
      const wkEnd   = endOfWeek(wkStart, { weekStartsOn: 1 })
      const inWeek  = sites.filter(s => {
        if (!s.scheduled_start) return false
        try {
          return isWithinInterval(parseISO(s.scheduled_start), { start: wkStart, end: wkEnd })
        } catch { return false }
      })
      return {
        week:      format(wkStart, 'M/d'),
        label:     `Wk ${format(wkStart, 'w')}`,
        total:     inWeek.length,
        completed: inWeek.filter(s => s.status === 'completed').length,
        staffed:   inWeek.filter(s => s.onsite_tech).length,
        isNow:     i === 1,
      }
    })

    // ── State breakdown (top 10) ──────────────────────────
    const stateCounts = sites.reduce((acc, s) => {
      if (s.state) acc[s.state] = (acc[s.state] ?? 0) + 1
      return acc
    }, {})
    const topStates = Object.entries(stateCounts)
      .sort(([,a],[,b]) => b - a)
      .slice(0, 12)
      .map(([state, count]) => ({
        state,
        count,
        completed: sites.filter(s => s.state === state && s.status === 'completed').length,
        pct: Math.round((count / total) * 100),
      }))

    // ── Upcoming this week ────────────────────────────────
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 })
    const thisWeekEnd   = endOfWeek(now, { weekStartsOn: 1 })
    const thisWeek = sites.filter(s => {
      if (!s.scheduled_start) return false
      try { return isWithinInterval(parseISO(s.scheduled_start), { start: thisWeekStart, end: thisWeekEnd }) }
      catch { return false }
    })

    // ── Next week ─────────────────────────────────────────
    const nextWeekStart = startOfWeek(addWeeks(now, 1), { weekStartsOn: 1 })
    const nextWeekEnd   = endOfWeek(nextWeekStart, { weekStartsOn: 1 })
    const nextWeek = sites.filter(s => {
      if (!s.scheduled_start) return false
      try { return isWithinInterval(parseISO(s.scheduled_start), { start: nextWeekStart, end: nextWeekEnd }) }
      catch { return false }
    })

    // ── Alert summary ─────────────────────────────────────
    const activeAlerts    = alerts.filter(a => a.status === 'active').length
    const dateChanges     = alerts.filter(a => a.alert_type === 'date_change' && a.status === 'active').length
    const cancellations   = alerts.filter(a => a.alert_type === 'provider_cancelled' && a.status === 'active').length

    // ── TBD dates (unscheduled) ───────────────────────────
    const noDate = sites.filter(s => !s.scheduled_start && !['completed','cancelled'].includes(s.status)).length

    // ── FST breakdown ─────────────────────────────────────
    const fstCounts = sites.reduce((acc, s) => {
      const fst = s.fst_owner || 'Unassigned'
      if (!acc[fst]) acc[fst] = { total: 0, completed: 0, unstaffed: 0 }
      acc[fst].total++
      if (s.status === 'completed') acc[fst].completed++
      if (!s.onsite_tech && !['completed','cancelled'].includes(s.status)) acc[fst].unstaffed++
      return acc
    }, {})
    const fstBreakdown = Object.entries(fstCounts)
      .sort(([,a],[,b]) => b.total - a.total)
      .slice(0, 8)
      .map(([fst, d]) => ({ fst, ...d, pct: Math.round((d.completed / d.total) * 100) }))

    setData({
      // Totals
      total, completed, scheduled, staffed, inProgress, cancelled, flagged,
      completionPct, unstaffed, withFNWO, noDate,

      // Weekly
      weeklyData, thisWeek, nextWeek,

      // Breakdowns
      topStates, fstBreakdown,
      statusCounts,

      // Alerts
      activeAlerts, dateChanges, cancellations,
      recentAlerts: alerts.slice(0, 5),

      // Meta
      projects,
      recentChanges: changes.slice(0, 10),
      lastUpdated: new Date(),
    })

    setLoading(false)
  }, [])

  useEffect(() => {
    fetch()
    // Refresh every 5 minutes
    const interval = setInterval(fetch, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetch, projectId, viewScope, userId])

  return { data, loading, refetch: fetch }
}
