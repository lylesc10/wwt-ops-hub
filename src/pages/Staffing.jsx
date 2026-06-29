import { useState, useEffect, useMemo } from 'react'
import { useSites } from '@/hooks/useSites'
import { useProjects } from '@/hooks/useProjects'
import { useUsers } from '@/hooks/useUsers'
import { useAuth } from '@/hooks/useAuth'
import { dab } from '@/lib/dab'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import {
  AlertTriangle, Users, Calendar, RefreshCw,
  ChevronDown, Check, Clock, Filter, X
} from 'lucide-react'
import { format, differenceInDays, parseISO, startOfWeek, endOfWeek } from 'date-fns'
import styles from './Staffing.module.css'

// Urgency score — lower = more urgent
function urgencyScore(site) {
  const today     = new Date()
  const startDate = site.scheduled_start ? parseISO(site.scheduled_start) : null
  const daysUntil = startDate ? differenceInDays(startDate, today) : 999
  const dueDate   = site.due_date_assign ? parseISO(site.due_date_assign) : null
  const dueDays   = dueDate ? differenceInDays(dueDate, today) : 999

  let score = daysUntil

  // Overdue due date is critical
  if (dueDays < 0)  score -= 100
  if (dueDays < 3)  score -= 50
  if (daysUntil < 0) score -= 200  // already past start

  // No RFT is more urgent than no tech
  if (!site.fst_owner && !site.assigned_rft_id) score -= 30
  if (!site.onsite_tech)                        score -= 20

  return score
}

function urgencyLabel(site) {
  const today     = new Date()
  const startDate = site.scheduled_start ? parseISO(site.scheduled_start) : null
  const daysUntil = startDate ? differenceInDays(startDate, today) : null
  const dueDate   = site.due_date_assign ? parseISO(site.due_date_assign) : null
  const dueDays   = dueDate ? differenceInDays(dueDate, today) : null

  if (daysUntil !== null && daysUntil < 0) return { label: 'Overdue', color: 'var(--red)', bg: 'var(--red-bg)' }
  if (dueDays !== null && dueDays < 0)     return { label: 'Tech Due Overdue', color: 'var(--red)', bg: 'var(--red-bg)' }
  if (dueDays !== null && dueDays <= 3)    return { label: `Tech Due ${dueDays === 0 ? 'Today' : `in ${dueDays}d`}`, color: '#f97316', bg: 'rgba(249,115,22,.1)' }
  if (daysUntil !== null && daysUntil <= 7) return { label: `Starts in ${daysUntil}d`, color: 'var(--amber)', bg: 'var(--amber-bg)' }
  if (daysUntil !== null && daysUntil <= 14) return { label: `${daysUntil}d away`, color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' }
  return { label: daysUntil !== null ? `${daysUntil}d away` : 'No date', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' }
}

export default function Staffing() {
  const { sites, loading, refetch } = useSites()
  const { projects }                = useProjects()
  const { users }                   = useUsers()
  const { user: currentUser, profile } = useAuth()

  const [projectFilter, setProjectFilter] = useState('')
  const [needsFilter,   setNeedsFilter]   = useState('all')  // 'all' | 'rft' | 'tech' | 'both'
  const [weekFilter,    setWeekFilter]    = useState('')
  const [search,        setSearch]        = useState('')
  const [assigning,     setAssigning]     = useState({})     // siteId → true
  const [expanded,      setExpanded]      = useState(null)

  // Filter to sites that need action
  const queueSites = useMemo(() => {
    return sites
      .filter(s => !['completed','cancelled'].includes(s.status))
      .filter(s => {
        if (needsFilter === 'rft')  return !s.fst_owner && !s.assigned_rft_id
        if (needsFilter === 'tech') return !s.onsite_tech
        if (needsFilter === 'both') return (!s.fst_owner && !s.assigned_rft_id) && !s.onsite_tech
        // 'all' — any gap
        return !s.onsite_tech || (!s.fst_owner && !s.assigned_rft_id) || s.status === 'scheduled'
      })
      .filter(s => !projectFilter || s.project_id === projectFilter)
      .filter(s => {
        if (!weekFilter) return true
        if (!s.scheduled_start) return false
        const wkStart = startOfWeek(parseISO(weekFilter), { weekStartsOn: 1 })
        const wkEnd   = endOfWeek(wkStart, { weekStartsOn: 1 })
        const d       = parseISO(s.scheduled_start)
        return d >= wkStart && d <= wkEnd
      })
      .filter(s => {
        if (!search) return true
        const q = search.toLowerCase()
        return (s.code ?? '').toLowerCase().includes(q) ||
               (s.branch_name ?? '').toLowerCase().includes(q) ||
               (s.state ?? '').toLowerCase().includes(q) ||
               (s.fst_owner ?? '').toLowerCase().includes(q) ||
               (s.onsite_tech ?? '').toLowerCase().includes(q)
      })
      .sort((a, b) => urgencyScore(a) - urgencyScore(b))
  }, [sites, needsFilter, projectFilter, weekFilter, search])

  // Stats
  const stats = useMemo(() => ({
    needsRFT:  sites.filter(s => !['completed','cancelled'].includes(s.status) && !s.fst_owner && !s.assigned_rft_id).length,
    needsTech: sites.filter(s => !['completed','cancelled'].includes(s.status) && !s.onsite_tech).length,
    overdue:   sites.filter(s => {
      if (!s.due_date_assign || ['completed','cancelled'].includes(s.status)) return false
      return differenceInDays(parseISO(s.due_date_assign), new Date()) < 0
    }).length,
    thisWeek: sites.filter(s => {
      if (!s.scheduled_start || ['completed','cancelled'].includes(s.status)) return false
      const today = new Date()
      const wkEnd = endOfWeek(startOfWeek(today, { weekStartsOn: 1 }), { weekStartsOn: 1 })
      return parseISO(s.scheduled_start) <= wkEnd && parseISO(s.scheduled_start) >= today
    }).length,
  }), [sites])

  const assignRFT = async (siteId, userId, userName) => {
    setAssigning(a => ({ ...a, [siteId]: true }))
    await dab.from('sites').update({
      assigned_rft_id: userId,
      fst_owner:       userName,
      rft_assigned_at: new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    }).eq('id', siteId)
    await refetch()
    setAssigning(a => ({ ...a, [siteId]: false }))
  }

  const assignTech = async (siteId, techName) => {
    setAssigning(a => ({ ...a, [`tech-${siteId}`]: true }))
    await dab.from('sites').update({
      onsite_tech: techName,
      updated_at:  new Date().toISOString(),
    }).eq('id', siteId)
    await refetch()
    setAssigning(a => ({ ...a, [`tech-${siteId}`]: false }))
  }

  const rftUsers = users.filter(u => ['admin','pm'].includes(u.role))

  return (
    <div className={styles.page}>
      <PageHeader
        title="Staffing Queue"
        subtitle={`${queueSites.length} sites need attention`}
        actions={<button className={styles.ghostBtn} onClick={refetch}><RefreshCw size={13}/></button>}
      />

      {/* Stats row */}
      <div className={styles.statsRow}>
        <StatChip label="Needs RFT"     value={stats.needsRFT}  color="var(--red)"   onClick={() => setNeedsFilter('rft')} />
        <StatChip label="Needs Tech"    value={stats.needsTech} color="var(--amber)"  onClick={() => setNeedsFilter('tech')} />
        <StatChip label="Tech Due Now"  value={stats.overdue}   color="#f97316"       onClick={() => setNeedsFilter('all')} />
        <StatChip label="Starting This Week" value={stats.thisWeek} color="var(--blue)" onClick={() => setNeedsFilter('all')} />
      </div>

      {/* Filters */}
      <div className={styles.filterBar}>
        <input
          className={styles.searchInput}
          placeholder="Search sites, tech, state…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={styles.filterSelect} value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.client} · {p.name}</option>)}
        </select>
        <div className={styles.needsToggle}>
          {[['all','All'],['rft','Needs RFT'],['tech','Needs Tech'],['both','Needs Both']].map(([v,l]) => (
            <button key={v} className={`${styles.needsBtn} ${needsFilter===v?styles.needsBtnActive:''}`} onClick={() => setNeedsFilter(v)}>{l}</button>
          ))}
        </div>
        <input
          type="week"
          className={styles.filterSelect}
          value={weekFilter ? weekFilter.slice(0,10) : ''}
          onChange={e => setWeekFilter(e.target.value)}
          title="Filter by week"
        />
        {(projectFilter || weekFilter || search || needsFilter !== 'all') && (
          <button className={styles.clearFilters} onClick={() => { setProjectFilter(''); setWeekFilter(''); setSearch(''); setNeedsFilter('all') }}>
            <X size={12}/> Clear
          </button>
        )}
      </div>

      {/* Queue */}
      <div className={styles.queueBody}>
        {loading ? (
          <div className={styles.loading}><RefreshCw size={14} className={styles.spin}/> Loading…</div>
        ) : queueSites.length === 0 ? (
          <div className={styles.empty}>
            <Check size={32} style={{color:'var(--green)',marginBottom:10}}/>
            <p>No sites need attention with the current filters</p>
          </div>
        ) : (
          <div className={styles.queue}>
            {/* Table header */}
            <div className={styles.queueHeader}>
              <div className={styles.colUrgency}>Urgency</div>
              <div className={styles.colSite}>Site</div>
              <div className={styles.colDates}>Dates</div>
              <div className={styles.colRFT}>RFT</div>
              <div className={styles.colTech}>Onsite Tech</div>
              <div className={styles.colStatus}>Status</div>
            </div>

            {queueSites.map(site => {
              const urg     = urgencyLabel(site)
              const isExp   = expanded === site.id
              const rftAssigned = site.fst_owner || site.assigned_rft_id

              return (
                <div key={site.id} className={`${styles.queueRow} ${isExp ? styles.queueRowExp : ''}`}>
                  <div className={styles.queueMain} onClick={() => setExpanded(isExp ? null : site.id)}>
                    {/* Urgency */}
                    <div className={styles.colUrgency}>
                      <span className={styles.urgencyBadge} style={{background:urg.bg,color:urg.color}}>
                        {urg.label}
                      </span>
                    </div>

                    {/* Site */}
                    <div className={styles.colSite}>
                      <span className={styles.siteCode}>{site.code}</span>
                      <span className={styles.siteName}>{site.branch_name}</span>
                      <span className={styles.siteMeta}>{site.city}, {site.state}</span>
                    </div>

                    {/* Dates */}
                    <div className={styles.colDates}>
                      <span className={styles.dateStart}>
                        {site.scheduled_start
                          ? format(parseISO(site.scheduled_start), 'M/d/yy')
                          : <span className={styles.dateTBD}>TBD</span>}
                      </span>
                      {site.due_date_assign && (
                        <span className={`${styles.dateDue} ${differenceInDays(parseISO(site.due_date_assign), new Date()) < 0 ? styles.dateDueOverdue : ''}`}>
                          Due {format(parseISO(site.due_date_assign), 'M/d')}
                        </span>
                      )}
                    </div>

                    {/* RFT */}
                    <div className={styles.colRFT}>
                      {rftAssigned
                        ? <span className={styles.assigned}><Check size={10}/> {site.fst_owner}</span>
                        : <span className={styles.unassigned}><AlertTriangle size={10}/> Unassigned</span>
                      }
                    </div>

                    {/* Tech */}
                    <div className={styles.colTech}>
                      {site.onsite_tech
                        ? <span className={styles.assigned}>{site.onsite_tech.split(',')[0]}{site.onsite_tech.includes(',') ? ` +${site.onsite_tech.split(',').length-1}` : ''}</span>
                        : <span className={styles.unassigned}><AlertTriangle size={10}/> Unassigned</span>
                      }
                    </div>

                    {/* Status */}
                    <div className={styles.colStatus}>
                      <StatusBadge status={site.status}/>
                      <ChevronDown size={12} className={`${styles.chevron} ${isExp?styles.chevronOpen:''}`}/>
                    </div>
                  </div>

                  {/* Expanded action panel */}
                  {isExp && (
                    <div className={styles.actionPanel}>
                      {/* Assign RFT */}
                      <div className={styles.actionSection}>
                        <div className={styles.actionLabel}><Users size={12}/> Assign RFT</div>
                        <div className={styles.actionRow}>
                          <select
                            className={styles.actionSelect}
                            defaultValue={site.assigned_rft_id ?? ''}
                            onChange={e => {
                              const u = rftUsers.find(u => u.id === e.target.value)
                              if (u) assignRFT(site.id, u.id, u.full_name ?? u.email)
                            }}
                          >
                            <option value="">Select RFT…</option>
                            {rftUsers.map(u => (
                              <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>
                            ))}
                          </select>
                          {assigning[site.id] && <RefreshCw size={12} className={styles.spin}/>}
                        </div>
                      </div>

                      {/* Assign Tech (free text for now — will link to comms) */}
                      <div className={styles.actionSection}>
                        <div className={styles.actionLabel}><Calendar size={12}/> Onsite Tech</div>
                        <div className={styles.actionRow}>
                          <input
                            className={styles.actionInput}
                            defaultValue={site.onsite_tech ?? ''}
                            placeholder="Tech name(s), comma separated"
                            onBlur={e => {
                              const val = e.target.value.trim()
                              if (val !== (site.onsite_tech ?? '')) assignTech(site.id, val || null)
                            }}
                            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                          />
                          {assigning[`tech-${site.id}`] && <RefreshCw size={12} className={styles.spin}/>}
                        </div>
                      </div>

                      {/* Site details */}
                      <div className={styles.siteDetails}>
                        <span>{site.address}, {site.city}, {site.state} {site.zip}</span>
                        {site.time_zone && <span>· {site.time_zone}</span>}
                        {site.target_quarter && <span>· {site.target_quarter}</span>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function StatChip({ label, value, color, onClick }) {
  return (
    <div className={`${styles.statChip} ${value > 0 ? styles.statChipActive : ''}`} onClick={onClick} style={value > 0 ? {borderColor:`${color}30`} : {}}>
      <span className={styles.statVal} style={{color: value > 0 ? color : 'var(--text-muted)'}}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}
