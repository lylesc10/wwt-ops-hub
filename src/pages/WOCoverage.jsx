import { useState, useMemo } from 'react'
import { useSites } from '@/hooks/useSites'
import { useProjects } from '@/hooks/useProjects'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import { EXPECTED_WO_TYPES, WO_TYPE_META, FN_STATUS_META } from '@/hooks/useSiteWorkOrders'
import { RefreshCw, Filter, X, ExternalLink } from 'lucide-react'
import { useEffect, useCallback } from 'react'
import styles from './WOCoverage.module.css'

export default function WOCoverage() {
  const { sites, loading: sitesLoading, refetch } = useSites()
  const { projects } = useProjects()

  const [allWOs,         setAllWOs]         = useState([])
  const [loadingWOs,     setLoadingWOs]      = useState(true)
  const [projectFilter,  setProjectFilter]   = useState('')
  const [routeFilter,    setRouteFilter]     = useState('')
  const [missingFilter,  setMissingFilter]   = useState('') // WO type to filter missing
  const [search,         setSearch]          = useState('')
  const [selectedSite,   setSelectedSite]    = useState(null)

  const fetchWOs = useCallback(async () => {
    setLoadingWOs(true)
    const { data } = await supabase
      .from('site_work_orders')
      .select('*')
      .order('wo_type').order('wo_number')
    setAllWOs(data ?? [])
    setLoadingWOs(false)
  }, [])

  useEffect(() => { fetchWOs() }, [fetchWOs])

  // Build site → WO map
  const wosBySite = useMemo(() => {
    return allWOs.reduce((acc, wo) => {
      if (!acc[wo.site_id]) acc[wo.site_id] = {}
      if (!acc[wo.site_id][wo.wo_type]) acc[wo.site_id][wo.wo_type] = []
      acc[wo.site_id][wo.wo_type].push(wo)
      return acc
    }, {})
  }, [allWOs])

  // Get unique routes
  const routes = useMemo(() => {
    const seen = new Set()
    const result = []
    for (const s of sites) {
      if (s.route_id && !seen.has(s.route_id)) {
        seen.add(s.route_id)
        result.push({ id: s.route_id, name: s.route?.name ?? s.route_id })
      }
    }
    return result.sort((a,b) => (a.name??'').localeCompare(b.name??''))
  }, [sites])

  const filteredSites = useMemo(() => {
    return sites
      .filter(s => !['completed','cancelled'].includes(s.status))
      .filter(s => !projectFilter || s.project_id === projectFilter)
      .filter(s => !routeFilter   || s.route_id   === routeFilter)
      .filter(s => {
        if (!missingFilter) return true
        return !(wosBySite[s.id]?.[missingFilter]?.length > 0)
      })
      .filter(s => {
        if (!search) return true
        const q = search.toLowerCase()
        return (s.code??'').toLowerCase().includes(q) ||
               (s.branch_name??'').toLowerCase().includes(q) ||
               (s.state??'').toLowerCase().includes(q)
      })
      .sort((a,b) => (a.scheduled_start??'').localeCompare(b.scheduled_start??''))
  }, [sites, projectFilter, routeFilter, missingFilter, search, wosBySite])

  // Coverage summary across all filtered sites
  const coverageSummary = useMemo(() => {
    return EXPECTED_WO_TYPES.map(type => {
      const hasSites   = filteredSites.filter(s => wosBySite[s.id]?.[type]?.length > 0).length
      const missSites  = filteredSites.length - hasSites
      const assigned   = filteredSites.filter(s =>
        (wosBySite[s.id]?.[type] ?? []).some(w => ['assigned','work_done','approved','paid'].includes(w.fn_status))
      ).length
      const completed  = filteredSites.filter(s =>
        (wosBySite[s.id]?.[type] ?? []).some(w => ['approved','paid','work_done'].includes(w.fn_status))
      ).length
      return { type, hasSites, missSites, assigned, completed, total: filteredSites.length }
    })
  }, [filteredSites, wosBySite])

  const loading = sitesLoading || loadingWOs

  return (
    <div className={styles.page}>
      <PageHeader
        title="WO Coverage"
        subtitle={`${filteredSites.length} sites · ${allWOs.length} work orders tracked`}
        actions={<button className={styles.ghostBtn} onClick={() => { refetch(); fetchWOs() }}><RefreshCw size={13}/></button>}
      />

      {/* Coverage summary chips */}
      <div className={styles.summaryBar}>
        {coverageSummary.map(({ type, hasSites, missSites, assigned, completed, total }) => {
          const meta = WO_TYPE_META[type] ?? { label: type, color: '#6b7280' }
          const pct  = total > 0 ? Math.round((hasSites / total) * 100) : 0
          return (
            <div
              key={type}
              className={`${styles.summaryChip} ${missingFilter === type ? styles.summaryChipActive : ''}`}
              onClick={() => setMissingFilter(missingFilter === type ? '' : type)}
              title={`Click to filter sites missing ${type}`}
            >
              <div className={styles.summaryChipTop}>
                <span className={styles.summaryDot} style={{background:meta.color}}/>
                <span className={styles.summaryType}>{type}</span>
                <span className={styles.summaryPct} style={{color: pct < 50 ? 'var(--red)' : pct < 80 ? 'var(--amber)' : 'var(--green)'}}>
                  {pct}%
                </span>
              </div>
              <div className={styles.summaryBar2}>
                <div className={styles.summaryTrack}>
                  <div className={styles.summaryFill} style={{width:`${pct}%`,background:meta.color}}/>
                </div>
              </div>
              <div className={styles.summaryNums}>
                <span style={{color:'var(--green)'}}>{hasSites} mapped</span>
                {missSites > 0 && <span style={{color:'var(--red)'}}>{missSites} missing</span>}
              </div>
              <div className={styles.summaryNums}>
                <span style={{color:'var(--amber)'}}>{assigned} assigned</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className={styles.filterBar}>
        <input className={styles.searchInput} placeholder="Search sites…" value={search} onChange={e => setSearch(e.target.value)}/>
        <select className={styles.filterSelect} value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.client} · {p.name}</option>)}
        </select>
        <select className={styles.filterSelect} value={routeFilter} onChange={e => setRouteFilter(e.target.value)}>
          <option value="">All Routes</option>
          {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {missingFilter && (
          <div className={styles.activeFilter}>
            Missing {missingFilter} <button onClick={() => setMissingFilter('')}><X size={11}/></button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className={styles.gridBody}>
        {loading ? (
          <div className={styles.loading}><RefreshCw size={14} className={styles.spin}/> Loading…</div>
        ) : (
          <div className={styles.grid}>
            {/* Sticky header */}
            <div className={styles.gridHeader}>
              <div className={styles.gridCellSite}>Site</div>
              <div className={styles.gridCellDate}>Start</div>
              {EXPECTED_WO_TYPES.map(type => (
                <div key={type} className={styles.gridCellType}>
                  <span className={styles.gridTypeDot} style={{background:WO_TYPE_META[type]?.color ?? '#6b7280'}}/>
                  {type}
                </div>
              ))}
            </div>

            {filteredSites.map(site => {
              const siteWOs = wosBySite[site.id] ?? {}
              return (
                <div key={site.id} className={`${styles.gridRow} ${selectedSite===site.id?styles.gridRowSelected:''}`}
                  onClick={() => setSelectedSite(selectedSite===site.id ? null : site.id)}>
                  <div className={styles.gridCellSite}>
                    <span className={styles.siteCode}>{site.code}</span>
                    <span className={styles.siteName}>{site.branch_name}</span>
                  </div>
                  <div className={styles.gridCellDate}>
                    <span className={styles.dateVal}>
                      {site.scheduled_start
                        ? new Date(site.scheduled_start+'T12:00:00').toLocaleDateString('en-US',{month:'numeric',day:'numeric'})
                        : '—'}
                    </span>
                  </div>
                  {EXPECTED_WO_TYPES.map(type => {
                    const wos    = siteWOs[type] ?? []
                    const topWO  = wos[0]
                    const sm     = topWO ? (FN_STATUS_META[topWO.fn_status] ?? FN_STATUS_META.UNKNOWN) : null
                    return (
                      <div key={type} className={styles.gridCellType}>
                        {wos.length === 0 ? (
                          <span className={styles.woMissing}>—</span>
                        ) : (
                          <span className={styles.woStatusDot} style={{background:`${sm.color}25`,color:sm.color,border:`1px solid ${sm.color}40`}}
                            title={`${wos.length} WO${wos.length>1?'s':''} · ${sm.label}${topWO.fn_wo_id ? ` · #${topWO.fn_wo_id}` : ''}`}>
                            {wos.length > 1 ? wos.length : sm.label.slice(0,3)}
                            {topWO?.fn_wo_id && (
                              <a href={topWO.fn_url} target="_blank" rel="noreferrer"
                                onClick={e => e.stopPropagation()} className={styles.woExtLink}>
                                <ExternalLink size={8}/>
                              </a>
                            )}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
