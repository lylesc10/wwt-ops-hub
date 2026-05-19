import { useState, useMemo } from 'react'
import { useSites } from './useSites'
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval,
  format, isWithinInterval, parseISO, addDays, addMonths,
  isSameDay, isToday, isBefore, isAfter
} from 'date-fns'

export function useGantt() {
  const { sites, loading, refetch } = useSites()
  const [scale, setScale] = useState('days')   // 'days' | 'weeks' | 'months'
  const [rangeStart, setRangeStart] = useState(() => addDays(new Date(), -7))
  const [rangeEnd, setRangeEnd] = useState(() => addDays(new Date(), 60))
  const [collapsedTechs, setCollapsedTechs] = useState(new Set())

  // Build column headers based on scale
  const columns = useMemo(() => {
    const interval = { start: rangeStart, end: rangeEnd }
    if (scale === 'days') {
      return eachDayOfInterval(interval).map(d => ({
        key:    format(d, 'yyyy-MM-dd'),
        label:  format(d, 'EEE d'),
        sublabel: format(d, 'MMM'),
        isToday: isToday(d),
        date: d,
      }))
    }
    if (scale === 'weeks') {
      return eachWeekOfInterval(interval, { weekStartsOn: 1 }).map(d => ({
        key:     format(d, 'yyyy-ww'),
        label:   `Wk ${format(d, 'w')}`,
        sublabel: format(d, 'MMM d'),
        isToday: isWithinInterval(new Date(), { start: d, end: endOfWeek(d, { weekStartsOn: 1 }) }),
        date: d,
        end: endOfWeek(d, { weekStartsOn: 1 }),
      }))
    }
    // months
    return eachMonthOfInterval(interval).map(d => ({
      key:     format(d, 'yyyy-MM'),
      label:   format(d, 'MMM'),
      sublabel: format(d, 'yyyy'),
      isToday: isWithinInterval(new Date(), { start: startOfMonth(d), end: endOfMonth(d) }),
      date: startOfMonth(d),
      end: endOfMonth(d),
    }))
  }, [scale, rangeStart, rangeEnd])

  // Group sites by FST Owner (RFT)
  const techRows = useMemo(() => {
    const map = new Map()

    for (const site of sites) {
      const fst = site.fst_owner || 'Unassigned'
      if (!map.has(fst)) map.set(fst, [])
      map.get(fst).push(site)
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === 'Unassigned') return 1
        if (b === 'Unassigned') return -1
        return a.localeCompare(b)
      })
      .map(([tech, techSites]) => ({ tech, sites: techSites }))
  }, [sites])

  // For a given site + column, check if the site is active during that period
  function siteInColumn(site, col) {
    if (!site.scheduled_start) return false
    try {
      const start = parseISO(site.scheduled_start)
      const end   = site.scheduled_end ? parseISO(site.scheduled_end) : start
      const colStart = col.date
      const colEnd   = col.end ?? col.date

      return (
        isBefore(start, addDays(colEnd, 1)) &&
        isAfter(addDays(end, 1), colStart)
      )
    } catch { return false }
  }

  // For a site in a column, determine position (start / middle / end / single)
  function sitePosition(site, col) {
    if (!site.scheduled_start) return 'single'
    try {
      const start = parseISO(site.scheduled_start)
      const end   = site.scheduled_end ? parseISO(site.scheduled_end) : start
      const colStart = col.date
      const colEnd   = col.end ?? col.date

      const startsHere = !isBefore(start, colStart) && !isAfter(start, colEnd)
      const endsHere   = !isBefore(end, colStart)   && !isAfter(end, colEnd)

      if (startsHere && endsHere) return 'single'
      if (startsHere) return 'start'
      if (endsHere)   return 'end'
      return 'middle'
    } catch { return 'middle' }
  }

  const toggleTech = (tech) => {
    setCollapsedTechs(s => {
      const next = new Set(s)
      next.has(tech) ? next.delete(tech) : next.add(tech)
      return next
    })
  }

  const shiftRange = (direction) => {
    const days = scale === 'days' ? 14 : scale === 'weeks' ? 28 : 60
    const delta = direction * days
    setRangeStart(d => addDays(d, delta))
    setRangeEnd(d => addDays(d, delta))
  }

  const jumpToToday = () => {
    setRangeStart(addDays(new Date(), -7))
    setRangeEnd(addDays(new Date(), 60))
  }

  return {
    sites, loading, refetch,
    scale, setScale,
    columns,
    techRows,
    collapsedTechs, toggleTech,
    siteInColumn, sitePosition,
    shiftRange, jumpToToday,
    rangeStart, rangeEnd,
  }
}
