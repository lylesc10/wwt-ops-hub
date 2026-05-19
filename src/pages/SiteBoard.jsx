import { useState, useMemo, useCallback } from 'react'
import { useSites } from '@/hooks/useSites'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { SiteEditModal } from '@/components/SiteEditModal'
import {
  Search, RefreshCw, ChevronDown, ChevronUp,
  ChevronsUpDown, Filter
} from 'lucide-react'
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, addDays, addMonths, isWithinInterval, startOfDay, endOfDay } from 'date-fns'
import { useFNSync } from '@/hooks/useFNSync'
import styles from './SiteBoard.module.css'

const STATUS_OPTS = ['all','scheduled','staffed','in_progress','completed','cancelled','flagged_payment','flagged_date_change']

const COLUMNS = [
  { key: 'code',            label: 'Code',        sortable: true,  mono: true  },
  { key: 'branch_name',     label: 'Branch',      sortable: true              },
  { key: 'state',           label: 'State',       sortable: true,  mono: true  },
  { key: 'city',            label: 'City',        sortable: true              },
  { key: 'fst_owner',       label: 'FST Owner',   sortable: true              },
  { key: 'onsite_tech',     label: 'Onsite Tech', sortable: true              },
  { key: 'scheduled_start', label: 'Start',       sortable: true,  mono: true  },
  { key: 'scheduled_end',   label: 'End',         sortable: true,  mono: true  },
  { key: 'status',          label: 'Status',      sortable: true              },
  { key: 'fn_wo_id',        label: 'FN WO',       sortable: false, mono: true  },
]

export default function SiteBoard() {
  const { sites, loading, refetch } = useSites()
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterState,  setFilterState]  = useState('all')
  const [dateWindow,   setDateWindow]   = useState('all')
  const [sortKey,      setSortKey]      = useState('code')
  const [sortDir,      setSortDir]      = useState('asc')
  const [editSite,     setEditSite]     = useState(null)
  const { syncing, syncResult, syncStatus, error: fnError } = useFNSync()
  const [groupBy,      setGroupBy]      = useState('project') // 'project' | 'state' | 'none'

  const handleSort = useCallback((key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }, [sortKey])

  // Date window ranges
  const DATE_WINDOWS = [
    { value: 'all',      label: 'All Dates' },
    { value: 'this_week', label: 'This Week' },
    { value: 'next_week', label: 'Next Week' },
    { value: '2_weeks',  label: 'Next 2 Weeks' },
    { value: 'month',    label: 'This Month' },
    { value: '60_days',  label: 'Next 60 Days' },
    { value: 'no_date',  label: 'No Date Set' },
  ]

  function getDateRange(window) {
    const now   = new Date()
    const today = startOfDay(now)
    const wkStart = startOfWeek(now, { weekStartsOn: 1 })
    const wkEnd   = endOfWeek(now,   { weekStartsOn: 1 })
    switch (window) {
      case 'this_week':  return { start: wkStart, end: wkEnd }
      case 'next_week':  return { start: addWeeks(wkStart,1), end: addWeeks(wkEnd,1) }
      case '2_weeks':    return { start: today, end: addWeeks(today, 2) }
      case 'month':      return { start: today, end: addMonths(today, 1) }
      case '60_days':    return { start: today, end: addDays(today, 60) }
      default:           return null
    }
  }

  // Unique states for filter
  const states = useMemo(() => {
    const s = new Set(sites.map(x => x.state).filter(Boolean))
    return ['all', ...Array.from(s).sort()]
  }, [sites])

  // Filter + sort
  const filtered = useMemo(() => {
    let list = sites

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        s.code?.toLowerCase().includes(q) ||
        s.branch_name?.toLowerCase().includes(q) ||
        s.city?.toLowerCase().includes(q) ||
        s.state?.toLowerCase().includes(q) ||
        (s.onsite_tech ?? '').toLowerCase().includes(q) ||
        (s.fst_owner   ?? '').toLowerCase().includes(q)
      )
    }

    if (filterStatus !== 'all') list = list.filter(s => s.status === filterStatus)
    if (filterState  !== 'all') list = list.filter(s => s.state  === filterState)

    // Date window filter
    if (dateWindow === 'no_date') {
      list = list.filter(s => !s.scheduled_start)
    } else if (dateWindow !== 'all') {
      const range = getDateRange(dateWindow)
      if (range) {
        list = list.filter(s => {
          if (!s.scheduled_start) return false
          try { return isWithinInterval(parseISO(s.scheduled_start), range) }
          catch { return false }
        })
      }
    }

    // Sort
    list = [...list].sort((a, b) => {
      let av = a[sortKey] ?? ''
      let bv = b[sortKey] ?? ''
      // Numeric-aware for codes
      if (sortKey === 'code') {
        av = av.toString()
        bv = bv.toString()
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [sites, search, filterStatus, filterState, sortKey, sortDir, dateWindow])

  // Group
  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: null, sites: filtered }]

    const map = new Map()
    for (const site of filtered) {
      let key, label
      if (groupBy === 'project') {
        key   = site.project?.id ?? 'none'
        label = site.project ? `${site.project.client} · ${site.project.name}` : 'No Project'
      } else {
        key   = site.state ?? 'Unknown'
        label = site.state ?? 'Unknown State'
      }
      if (!map.has(key)) map.set(key, { key, label, color: site.project?.color, sites: [] })
      map.get(key).sites.push(site)
    }
    return Array.from(map.values())
  }, [filtered, groupBy])

  const fmt = (d) => d ? format(new Date(d), 'MM/dd/yy') : '—'

  const SortIcon = ({ col }) => {
    if (!col.sortable) return null
    if (sortKey !== col.key) return <ChevronsUpDown size={11} style={{ opacity: 0.3 }} />
    return sortDir === 'asc'
      ? <ChevronUp size={11} style={{ color: 'var(--amber)' }} />
      : <ChevronDown size={11} style={{ color: 'var(--amber)' }} />
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Site Board"
        subtitle={`${filtered.length} of ${sites.length} sites`}
        actions={
          <div className={styles.controls}>
            <button
              className={`${styles.iconBtn} ${syncing ? styles.iconBtnSpinning : ''}`}
              onClick={() => syncStatus()}
              title={syncResult ? syncResult.message : 'Sync WO statuses from FieldNation'}
              disabled={syncing}
            >
              {syncing ? <RefreshCw size={14} className={styles.spinIcon} /> : '⚙'}
            </button>
            <button className={styles.iconBtn} onClick={refetch} title="Refresh">
              <RefreshCw size={14} />
            </button>

            <div className={styles.searchBox}>
              <Search size={13} />
              <input
                placeholder="Search sites…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <select className={styles.filterSelect} value={filterState} onChange={e => setFilterState(e.target.value)}>
              {states.map(s => <option key={s} value={s}>{s === 'all' ? 'All States' : s}</option>)}
            </select>

            {/* Date window picker */}
            <select className={`${styles.filterSelect} ${dateWindow !== 'all' ? styles.filterActive : ''}`}
              value={dateWindow} onChange={e => setDateWindow(e.target.value)}>
              {DATE_WINDOWS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>

            <select className={styles.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              {STATUS_OPTS.map(s => <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.replace(/_/g,' ')}</option>)}
            </select>

            <select className={styles.filterSelect} value={groupBy} onChange={e => setGroupBy(e.target.value)}>
              <option value="project">Group by Project</option>
              <option value="state">Group by State</option>
              <option value="none">No Grouping</option>
            </select>
          </div>
        }
      />

      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.empty}><span className="mono">Loading…</span></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <p>No sites match your filters.</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => col.sortable && handleSort(col.key)}
                    className={col.sortable ? styles.sortable : ''}
                  >
                    <span className={styles.thInner}>
                      {col.label}
                      <SortIcon col={col} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ key, label, color, sites: groupSites }) => (
                <>
                  {label && (
                    <tr key={`g-${key}`} className={styles.groupRow}>
                      <td colSpan={COLUMNS.length}>
                        {color && <span className={styles.projectDot} style={{ background: color }} />}
                        {label}
                        <span className={styles.groupCount}>{groupSites.length}</span>
                      </td>
                    </tr>
                  )}
                  {groupSites.map(site => (
                    <tr
                      key={site.id}
                      className={styles.siteRow}
                      onClick={() => setEditSite(site)}
                    >
                      <td><span className={`mono ${styles.code}`}>{site.code}</span></td>
                      <td className={styles.branchCell}>{site.branch_name}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{site.state ?? '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{site.city ?? '—'}</td>
                      <td>
                        {site.fst_owner
                          ? <span style={{ fontSize: 11, color: 'var(--blue)' }}>{site.fst_owner}</span>
                          : <span className={styles.unassigned}>—</span>}
                      </td>
                      <td className={styles.techCell}>
                        {site.onsite_tech ?? <span className={styles.unassigned}>Unassigned</span>}
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>{fmt(site.scheduled_start)}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{fmt(site.scheduled_end)}</td>
                      <td><StatusBadge status={site.status} /></td>
                      <td>
                        {site.fn_wo_id
                          ? <span className={`mono ${styles.fnId}`}>{site.fn_wo_id}</span>
                          : <span className={styles.noFn}>—</span>}
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editSite && (
        <SiteEditModal
          site={editSite}
          onClose={() => setEditSite(null)}
          onSaved={refetch}
        />
      )}
    </div>
  )
}
