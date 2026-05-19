import { useState, useMemo, useRef, useEffect } from 'react'
import { useRoutes } from '@/hooks/useRoutes'
import { useSites } from '@/hooks/useSites'
import { useProjects } from '@/hooks/useProjects'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader } from '@/components/PageHeader'
import { SiteEditModal } from '@/components/SiteEditModal'
import {
  Plus, X, Save, RefreshCw, ChevronLeft, ChevronRight,
  Calendar, MapPin, Zap, Pencil, Trash2, Check,
  ChevronDown, ChevronUp, BarChart2
} from 'lucide-react'
import {
  format, addDays, addWeeks, startOfWeek, endOfWeek,
  eachWeekOfInterval, isWithinInterval, parseISO,
  isBefore, isAfter
} from 'date-fns'
import styles from './RouteGantt.module.css'

const ROUTE_COLORS = [
  '#3b82f6','#22c55e','#f59e0b','#a855f7','#06b6d4',
  '#ef4444','#f97316','#ec4899','#14b8a6','#8b5cf6',
  '#84cc16','#f43f5e','#0ea5e9','#d97706','#7c3aed',
]

// Work type from site code suffix or WO type
function getWorkType(site) {
  const code = site.code ?? ''
  if (code.includes('-LVV') || code.includes('LVV')) return 'LVV'
  if (code.includes('-INS') || code.includes('INS')) return 'INS'
  if (code.includes('-DEL') || code.includes('DEL')) return 'DEL'
  // Fall back to status
  if (site.status === 'completed') return 'DONE'
  return 'LVV' // default for this project
}

const TYPE_STYLE = {
  LVV:  { bg: 'var(--blue)',   label: 'LVV' },
  INS:  { bg: 'var(--green)',  label: 'INS' },
  DEL:  { bg: '#f97316',      label: 'DEL' },
  DONE: { bg: '#6b7280',      label: 'DONE' },
}

export default function RouteGantt() {
  const { isPM } = useAuth()
  const { routes, loading: routesLoading, refetch,
          createRoute, updateRoute, deleteRoute,
          assignSiteToRoute, removeSiteFromRoute, suggestRoutes } = useRoutes()
  const { sites, loading: sitesLoading, refetch: refetchSites } = useSites()
  const { projects } = useProjects()

  const [activeProjectId, setActiveProjectId] = useState('all')
  const [rangeStart, setRangeStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [weekWindow,   setWeekWindow]   = useState(8)
  const [searchRoute,  setSearchRoute]  = useState('')
  const [regionFilter, setRegionFilter] = useState('all')
  const [compactMode,  setCompactMode]  = useState(false)
  const [editSite,   setEditSite]   = useState(null)
  const [showNewRoute, setShowNewRoute] = useState(false)
  const [editRouteId,  setEditRouteId]  = useState(null)
  const [suggestions,  setSuggestions]  = useState([])
  const [showSuggest,  setShowSuggest]  = useState(false)
  const [collapsedRoutes, setCollapsedRoutes] = useState(new Set())
  const [assignMode,  setAssignMode]   = useState(null)
  const [groupView,   setGroupView]    = useState('route')
  const [showCapacity, setShowCapacity] = useState(true)
  const gridRef = useRef(null)

  // Week columns
  const rangeEnd = addWeeks(rangeStart, weekWindow)

  const weeks = useMemo(() => {
    return eachWeekOfInterval({ start: rangeStart, end: rangeEnd }, { weekStartsOn: 1 }).map(w => ({
      key:     format(w, 'yyyy-MM-dd'),
      label:   `Wk ${format(w, 'w')}`,
      sublabel: format(w, 'M/d'),
      start:   w,
      end:     endOfWeek(w, { weekStartsOn: 1 }),
      isNow:   isWithinInterval(new Date(), { start: w, end: endOfWeek(w, { weekStartsOn: 1 }) }),
    }))
  }, [rangeStart, rangeEnd])

  // Filter sites by active project
  const filteredSites = useMemo(() => {
    if (activeProjectId === 'all') return sites
    return sites.filter(s => s.project_id === activeProjectId || s.project?.id === activeProjectId)
  }, [sites, activeProjectId])

  // Filter routes by project + search + region
  const filteredRoutes = useMemo(() => {
    let list = activeProjectId === 'all' ? routes : routes.filter(r => r.project_id === activeProjectId)
    if (searchRoute.trim()) {
      const q = searchRoute.toLowerCase()
      list = list.filter(r =>
        (r.name ?? '').toLowerCase().includes(q) ||
        (r.region ?? '').toLowerCase().includes(q) ||
        (r.states ?? []).some(s => s.toLowerCase().includes(q))
      )
    }
    if (regionFilter !== 'all') list = list.filter(r => r.region === regionFilter)
    return list
  }, [routes, activeProjectId, searchRoute, regionFilter])

  // Check if site falls in a week
  function siteInWeek(site, week) {
    if (!site.scheduled_start) return false
    try {
      const start = parseISO(site.scheduled_start)
      const end   = site.scheduled_end ? parseISO(site.scheduled_end) : start
      return isBefore(start, addDays(week.end, 1)) && isAfter(addDays(end, 1), week.start)
    } catch { return false }
  }

  // Weekly capacity totals
  const weeklyTotals = useMemo(() => {
    return weeks.map(wk => {
      const inWeek = filteredSites.filter(s => siteInWeek(s, wk))
      const lvv  = inWeek.filter(s => getWorkType(s) === 'LVV').length
      const ins  = inWeek.filter(s => getWorkType(s) === 'INS').length
      const done = inWeek.filter(s => s.status === 'completed').length
      return { total: inWeek.length, lvv, ins, done }
    })
  }, [filteredSites, weeks])

  // Group rows by city or state
  const rows = useMemo(() => {
    const sitesWithDates = filteredSites.filter(s => s.scheduled_start)

    if (groupView === 'route') {
      // Route-based grouping
      const routeRows = filteredRoutes.map(r => ({
        key:   r.id,
        label: r.name,
        color: r.color,
        sites: (r.sites ?? []).filter(s => s.scheduled_start),
        isRoute: true,
        route: r,
      }))
      const assigned = new Set(filteredRoutes.flatMap(r => (r.sites ?? []).map(s => s.id)))
      const unassigned = sitesWithDates.filter(s => !assigned.has(s.id))
      if (unassigned.length) {
        routeRows.push({ key: 'unassigned', label: 'Unassigned', color: '#4b5563', sites: unassigned, isRoute: false })
      }
      return routeRows
    }

    // City or state grouping
    const groupKey = groupView === 'city' ? 'city' : 'state'
    const map = new Map()
    for (const site of sitesWithDates) {
      const key = site[groupKey] ?? 'Unknown'
      if (!map.has(key)) map.set(key, { key, label: key, sites: [], state: site.state })
      map.get(key).sites.push(site)
    }

    return Array.from(map.values())
      .sort((a, b) => {
        // Sort by state first, then city
        const stateA = a.state ?? a.key
        const stateB = b.state ?? b.key
        return stateA.localeCompare(stateB) || a.label.localeCompare(b.label)
      })
      .map(row => ({
        ...row,
        color: ROUTE_COLORS[Array.from(map.keys()).indexOf(row.key) % ROUTE_COLORS.length],
        isRoute: false,
      }))
  }, [filteredSites, filteredRoutes, groupView, searchRoute, regionFilter])

  const shiftRange = (dir) => {
    setRangeStart(d => addWeeks(d, dir * Math.max(4, Math.floor(weekWindow / 2))))
  }

  const jumpToday = () => {
    setRangeStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
  }

  const toggleCollapse = (id) => {
    setCollapsedRoutes(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const collapseAll = () => setCollapsedRoutes(new Set(rows.map(r => r.key)))
  const expandAll   = () => setCollapsedRoutes(new Set())

  const handleSuggest = async () => {
    const projId = activeProjectId !== 'all' ? activeProjectId : projects[0]?.id
    if (!projId) return
    const sug = await suggestRoutes(projId)
    setSuggestions(sug)
    setShowSuggest(true)
  }

  const acceptSuggestion = async (sug, i) => {
    const route = await createRoute({
      project_id:  activeProjectId !== 'all' ? activeProjectId : projects[0]?.id,
      name:        `${sug.state} — Wk ${format(new Date(sug.weekStart), 'M/d')}`,
      region:      sug.state,
      states:      [sug.state],
      week_start:  sug.weekStart,
      week_end:    sug.weekEnd,
      color:       ROUTE_COLORS[i % ROUTE_COLORS.length],
    })
    for (const site of sug.sites) await assignSiteToRoute(site.id, route.id)
    setSuggestions(s => s.filter(x => x !== sug))
    await refetchSites()
  }

  const handleCellClick = (site) => {
    if (assignMode) {
      if (site.route_id === assignMode) removeSiteFromRoute(site.id).then(refetchSites)
      else assignSiteToRoute(site.id, assignMode).then(refetchSites)
    } else {
      setEditSite(site)
    }
  }

  // Scroll to today
  useEffect(() => {
    if (!gridRef.current) return
    const el = gridRef.current.querySelector('[data-now="true"]')
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
  }, [weeks])

  const COL_W = compactMode ? 60 : 90

  return (
    <div className={styles.page}>
      <PageHeader
        title="Route Gantt"
        subtitle={`${filteredRoutes.length} routes${searchRoute||regionFilter!=="all" ? " (filtered)" : ""} · ${filteredSites.filter(s=>s.scheduled_start).length} sites · ${weekWindow} weeks`}
        actions={
          <div className={styles.controls}>
            {assignMode && (
              <div className={styles.assignBanner}>
                <MapPin size={12} /> Assign mode —
                <button onClick={() => setAssignMode(null)}>Done</button>
              </div>
            )}

            {/* Search routes */}
            <input
              className={styles.routeSearch}
              placeholder="Search routes…"
              value={searchRoute}
              onChange={e => setSearchRoute(e.target.value)}
            />

            {/* Region filter */}
            <select className={styles.viewSelect} value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
              <option value="all">All Regions</option>
              <option value="Eastern">Eastern</option>
              <option value="Central">Central</option>
              <option value="Mountain">Mountain</option>
              <option value="Pacific">Pacific</option>
            </select>

            {/* Week window */}
            <select className={styles.viewSelect} value={weekWindow} onChange={e => setWeekWindow(Number(e.target.value))}>
              <option value={4}>4 weeks</option>
              <option value={6}>6 weeks</option>
              <option value={8}>8 weeks</option>
              <option value={12}>12 weeks</option>
              <option value={16}>16 weeks</option>
            </select>

            {/* Group by */}
            <select className={styles.viewSelect} value={groupView} onChange={e => setGroupView(e.target.value)}>
              <option value="route">By Route</option>
              <option value="state">By State</option>
              <option value="city">By City</option>
            </select>

            {/* Collapse all / expand all */}
            <button className={styles.ghostBtn} onClick={collapseAll} title="Collapse all">⊟</button>
            <button className={styles.ghostBtn} onClick={expandAll}   title="Expand all">⊞</button>

            {/* Compact mode */}
            <button className={`${styles.iconBtn} ${compactMode ? styles.iconBtnActive : ''}`} onClick={() => setCompactMode(v=>!v)} title="Compact mode">
              <BarChart2 size={14} />
            </button>

            <button className={styles.ghostBtn} onClick={handleSuggest}><Zap size={13} /> Suggest</button>
            {isPM && <button className={styles.primaryBtn} onClick={() => setShowNewRoute(true)}><Plus size={13} /> New Route</button>}

            <div className={styles.navGroup}>
              <button className={styles.navBtn} onClick={() => shiftRange(-1)}><ChevronLeft size={14} /></button>
              <button className={styles.navBtn} onClick={jumpToday} title="Jump to today"><Calendar size={13} /></button>
              <button className={styles.navBtn} onClick={() => shiftRange(1)}><ChevronRight size={14} /></button>
            </div>
          </div>
        }
      />

      {/* Project tabs */}
      <div className={styles.projectTabs}>
        <button className={`${styles.projectTab} ${activeProjectId === 'all' ? styles.projectTabActive : ''}`} onClick={() => setActiveProjectId('all')}>
          All Projects
        </button>
        {projects.map(p => (
          <button
            key={p.id}
            className={`${styles.projectTab} ${activeProjectId === p.id ? styles.projectTabActive : ''}`}
            style={activeProjectId === p.id ? { borderBottomColor: p.color, color: p.color } : {}}
            onClick={() => setActiveProjectId(p.id)}
          >
            <span className={styles.projectTabDot} style={{ background: p.color }} />
            {p.client} · {p.name}
          </button>
        ))}
      </div>

      {/* Suggestion panel */}
      {showSuggest && suggestions.length > 0 && (
        <div className={styles.suggestPanel}>
          <div className={styles.suggestHeader}>
            <Zap size={12} /> {suggestions.length} suggestions based on state + week
            <button className={styles.ghostBtn} style={{ marginLeft: 'auto' }} onClick={() => setShowSuggest(false)}>Dismiss</button>
          </div>
          <div className={styles.suggestList}>
            {suggestions.slice(0, 10).map((sug, i) => (
              <div key={`${sug.state}-${sug.weekStart}`} className={styles.suggestCard}>
                <div className={styles.suggestDot} style={{ background: ROUTE_COLORS[i % ROUTE_COLORS.length] }} />
                <div className={styles.suggestInfo}>
                  <span className={styles.suggestTitle}>{sug.state} — Wk {format(new Date(sug.weekStart), 'M/d')}</span>
                  <span className={styles.suggestMeta}>{sug.sites.length} sites · {[...new Set(sug.sites.map(s=>s.city).filter(Boolean))].slice(0,3).join(', ')}</span>
                </div>
                <button className={styles.acceptBtn} onClick={() => acceptSuggestion(sug, i)}>
                  <Check size={11} /> Create
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.ganttWrap}>
        <div className={styles.ganttInner}>

          {/* Left panel */}
          <div className={styles.leftPanel}>
            <div className={styles.leftHeader}>
              <span>{groupView === 'city' ? 'City' : groupView === 'state' ? 'State' : 'Route'}</span>
              <span className={styles.leftHeaderSub}>Sites</span>
            </div>

            {rows.map(row => {
              const collapsed = collapsedRoutes.has(row.key)
              return (
                <div key={row.key} className={styles.rowGroup}>
                  <div className={styles.rowLabel} style={{ borderLeftColor: row.color ?? 'var(--border-strong)' }}>
                    <button className={styles.collapseBtn} onClick={() => toggleCollapse(row.key)}>
                      {collapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
                    </button>
                    <div className={styles.rowLabelInfo}>
                      <span className={styles.rowLabelName}>{row.label}</span>
                      <span className={styles.rowLabelMeta}>
                        {row.sites.length} site{row.sites.length !== 1 ? 's' : ''}
                        {row.route?.assigned_tech ? ` · ${row.route.assigned_tech}` : ''}
                        {row.state && groupView === 'city' ? ` · ${row.state}` : ''}
                      </span>
                    </div>
                    {row.isRoute && isPM && (
                      <div className={styles.rowActions}>
                        <button className={`${styles.microBtn} ${assignMode === row.key ? styles.microBtnActive : ''}`}
                          onClick={() => setAssignMode(assignMode === row.key ? null : row.key)} title="Assign sites">
                          <MapPin size={10} />
                        </button>
                        <button className={styles.microBtn} onClick={() => setEditRouteId(row.key)}><Pencil size={10} /></button>
                        <button className={`${styles.microBtn} ${styles.microBtnDanger}`}
                          onClick={() => { if(confirm(`Delete "${row.label}"?`)) deleteRoute(row.key) }}>
                          <Trash2 size={10} />
                        </button>
                      </div>
                    )}
                  </div>

                  {!collapsed && row.sites.map(site => {
                    const type = getWorkType(site)
                    const ts = TYPE_STYLE[type] ?? TYPE_STYLE.LVV
                    return (
                      <div
                        key={site.id}
                        className={`${styles.siteRow} ${assignMode ? styles.siteRowAssign : ''}`}
                        onClick={() => handleCellClick(site)}
                      >
                        <span className="mono" style={{ fontSize: 10, color: ts.bg, width: 54, flexShrink: 0, letterSpacing: '0.03em' }}>{site.code}</span>
                        <span className={styles.siteName}>{site.branch_name}</span>
                        <span className={styles.siteTypeBadge} style={{ background: `${ts.bg}20`, color: ts.bg, borderColor: `${ts.bg}40` }}>{ts.label}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Capacity label */}
            {showCapacity && (
              <div className={styles.capacityLabel}>
                <div className={styles.capacityRow}><span>LVV</span></div>
                <div className={styles.capacityRow}><span>INS</span></div>
                <div className={styles.capacityRow} style={{ fontWeight: 700 }}><span>Total</span></div>
              </div>
            )}
          </div>

          {/* Grid */}
          <div className={styles.gridScroll} ref={gridRef}>
            {/* Week headers */}
            <div className={styles.weekHeaders}>
              {weeks.map(wk => (
                <div key={wk.key} className={`${styles.weekHeader} ${wk.isNow ? styles.weekHeaderNow : ''}`} data-now={wk.isNow} style={{ minWidth: COL_W }}>
                  <span className={styles.wkLabel}>{wk.label}</span>
                  <span className={styles.wkSub}>{wk.sublabel}</span>
                </div>
              ))}
            </div>

            {/* Rows */}
            {rows.map(row => {
              const collapsed = collapsedRoutes.has(row.key)
              return (
                <div key={row.key}>
                  {/* Row header summary */}
                  <div className={styles.rowHeaderGrid}>
                    {weeks.map(wk => {
                      const inWk = row.sites.filter(s => siteInWeek(s, wk))
                      return (
                        <div key={wk.key} className={`${styles.rowHeaderCell} ${wk.isNow ? styles.cellNow : ''}`} style={{ minWidth: COL_W }}>
                          {inWk.length > 0 && (
                            <>
                              <div className={styles.rowHeaderBar} style={{ background: row.color ?? '#4b5563' }} />
                              <span className={styles.rowHeaderCount} style={{ color: row.color ?? '#4b5563' }}>{inWk.length}</span>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Site bars */}
                  {!collapsed && row.sites.map(site => {
                    const type = getWorkType(site)
                    const ts = TYPE_STYLE[type] ?? TYPE_STYLE.LVV
                    return (
                      <div key={site.id} className={styles.gridRow}>
                        {weeks.map(wk => {
                          const active = siteInWeek(site, wk)
                          return (
                            <div key={wk.key} className={`${styles.gridCell} ${wk.isNow ? styles.cellNow : ''}`} style={{ minWidth: COL_W }}>
                              {active && (
                                <div
                                  className={styles.siteBar}
                                  style={{ background: ts.bg }}
                                  onClick={() => handleCellClick(site)}
                                  title={`${site.code} · ${site.branch_name} · ${type}`}
                                >
                                  <span className={styles.siteBarCode}>{site.code}</span>
                                  <span className={styles.siteBarType}>{ts.label}</span>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Capacity rows */}
            {showCapacity && (
              <div className={styles.capacitySection}>
                <div className={styles.capacityGridRow} style={{ background: 'rgba(59,130,246,0.06)' }}>
                  {weeks.map((wk, i) => (
                    <div key={wk.key} className={`${styles.capacityCell} ${wk.isNow ? styles.cellNow : ''}`} style={{ minWidth: COL_W }}>
                      {weeklyTotals[i].lvv > 0 && <span className={styles.capacityNum} style={{ color: 'var(--blue)' }}>{weeklyTotals[i].lvv}</span>}
                    </div>
                  ))}
                </div>
                <div className={styles.capacityGridRow} style={{ background: 'rgba(34,197,94,0.06)' }}>
                  {weeks.map((wk, i) => (
                    <div key={wk.key} className={`${styles.capacityCell} ${wk.isNow ? styles.cellNow : ''}`} style={{ minWidth: COL_W }}>
                      {weeklyTotals[i].ins > 0 && <span className={styles.capacityNum} style={{ color: 'var(--green)' }}>{weeklyTotals[i].ins}</span>}
                    </div>
                  ))}
                </div>
                <div className={styles.capacityGridRow} style={{ background: 'rgba(245,158,11,0.08)', borderTop: '2px solid var(--amber)' }}>
                  {weeks.map((wk, i) => (
                    <div key={wk.key} className={`${styles.capacityCell} ${wk.isNow ? styles.cellNow : ''}`} style={{ minWidth: COL_W }}>
                      {weeklyTotals[i].total > 0 && <span className={styles.capacityNum} style={{ color: 'var(--amber)', fontWeight: 800 }}>{weeklyTotals[i].total}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New/Edit Route modal */}
      {(showNewRoute || editRouteId) && (
        <RouteModal
          projects={projects}
          defaultProjectId={activeProjectId !== 'all' ? activeProjectId : projects[0]?.id}
          existing={editRouteId ? routes.find(r => r.id === editRouteId) : null}
          onSave={async (fields) => {
            if (editRouteId) await updateRoute(editRouteId, fields)
            else await createRoute(fields)
            setShowNewRoute(false)
            setEditRouteId(null)
          }}
          onClose={() => { setShowNewRoute(false); setEditRouteId(null) }}
        />
      )}

      {editSite && (
        <SiteEditModal
          site={editSite}
          onClose={() => setEditSite(null)}
          onSaved={() => { refetchSites(); refetch() }}
        />
      )}
    </div>
  )
}

// ── Route Modal ───────────────────────────────────────────────
function RouteModal({ projects, defaultProjectId, existing, onSave, onClose }) {
  const [form, setForm] = useState({
    project_id:    existing?.project_id    ?? defaultProjectId ?? '',
    name:          existing?.name          ?? '',
    region:        existing?.region        ?? '',
    states:        existing?.states?.join(', ') ?? '',
    color:         existing?.color         ?? ROUTE_COLORS[0],
    week_start:    existing?.week_start    ?? '',
    week_end:      existing?.week_end      ?? '',
    assigned_tech: existing?.assigned_tech ?? '',
    notes:         existing?.notes         ?? '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      await onSave({
        ...form,
        states: form.states ? form.states.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : [],
      })
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{existing ? 'Edit Route' : 'New Route'}</h3>
          <button className={styles.closeBtn} onClick={onClose}><X size={15} /></button>
        </div>
        <div className={styles.modalBody}>
          <Field label="Route Name">
            <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. PA Northeast — Wk 4/7" />
          </Field>
          <div className={styles.grid2}>
            <Field label="Project">
              <select value={form.project_id} onChange={e => setForm(f=>({...f,project_id:e.target.value}))}>
                {projects.map(p => <option key={p.id} value={p.id}>{p.client} · {p.name}</option>)}
              </select>
            </Field>
            <Field label="Assigned Tech">
              <input value={form.assigned_tech} onChange={e => setForm(f=>({...f,assigned_tech:e.target.value}))} placeholder="Tech name" />
            </Field>
          </div>
          <div className={styles.grid2}>
            <Field label="States (comma-sep)">
              <input value={form.states} onChange={e => setForm(f=>({...f,states:e.target.value}))} placeholder="PA, NJ, MD" />
            </Field>
            <Field label="Region / Area">
              <input value={form.region} onChange={e => setForm(f=>({...f,region:e.target.value}))} placeholder="e.g. Northeast" />
            </Field>
          </div>
          <div className={styles.grid2}>
            <Field label="Week Start"><input type="date" value={form.week_start} onChange={e => setForm(f=>({...f,week_start:e.target.value}))} /></Field>
            <Field label="Week End"><input type="date" value={form.week_end} onChange={e => setForm(f=>({...f,week_end:e.target.value}))} /></Field>
          </div>
          <Field label="Color">
            <div className={styles.colorRow}>
              {ROUTE_COLORS.map(c => (
                <button key={c} className={`${styles.colorSwatch} ${form.color===c?styles.colorActive:''}`} style={{background:c}} onClick={()=>setForm(f=>({...f,color:c}))} />
              ))}
            </div>
          </Field>
          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} rows={2} />
          </Field>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.ghostBtn} onClick={onClose}>Cancel</button>
          <button className={styles.primaryBtn} onClick={handleSave} disabled={saving || !form.name}>
            <Save size={13} />{saving ? 'Saving…' : 'Save Route'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  )
}
