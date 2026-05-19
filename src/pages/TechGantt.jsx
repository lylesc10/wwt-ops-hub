import { useState, useRef, useEffect } from 'react'
import { useGantt } from '@/hooks/useGantt'
import { PageHeader } from '@/components/PageHeader'
import { GanttCell } from '@/components/GanttCell'
import { SiteEditModal } from '@/components/SiteEditModal'
import { StatusBadge } from '@/components/StatusBadge'
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Calendar, RefreshCw, Users
} from 'lucide-react'
import { format } from 'date-fns'
import styles from './TechGantt.module.css'

const SCALE_OPTIONS = [
  { value: 'days',   label: 'Days' },
  { value: 'weeks',  label: 'Weeks' },
  { value: 'months', label: 'Months' },
]

export default function TechGantt() {
  const {
    sites, loading, refetch,
    scale, setScale,
    columns, techRows,
    collapsedTechs, toggleTech,
    siteInColumn, sitePosition,
    shiftRange, jumpToToday,
  } = useGantt()

  const [editSite, setEditSite] = useState(null)
  const gridRef = useRef(null)

  // Scroll to today column on mount
  useEffect(() => {
    if (!gridRef.current) return
    const todayEl = gridRef.current.querySelector('[data-today="true"]')
    if (todayEl) {
      todayEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [columns])

  const totalSites = sites.length
  const staffedCount = sites.filter(s => s.status === 'staffed' || s.status === 'in_progress').length
  const unassigned = sites.filter(s => !s.fst_owner).length

  return (
    <div className={styles.page}>
      <PageHeader
        title="Tech Gantt"
        subtitle={`${techRows.length} RFTs · ${totalSites} sites · ${unassigned} unassigned`}
        actions={
          <div className={styles.controls}>
            {/* Scale toggle */}
            <div className={styles.scaleToggle}>
              {SCALE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`${styles.scaleBtn} ${scale === opt.value ? styles.scaleBtnActive : ''}`}
                  onClick={() => setScale(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Range navigation */}
            <div className={styles.navGroup}>
              <button className={styles.navBtn} onClick={() => shiftRange(-1)} title="Previous">
                <ChevronLeft size={14} />
              </button>
              <button className={styles.todayBtn} onClick={jumpToToday}>
                <Calendar size={13} /> Today
              </button>
              <button className={styles.navBtn} onClick={() => shiftRange(1)} title="Next">
                <ChevronRight size={14} />
              </button>
            </div>

            <button className={styles.navBtn} onClick={refetch} title="Refresh">
              <RefreshCw size={14} />
            </button>
          </div>
        }
      />

      {loading ? (
        <div className={styles.empty}>
          <span className="mono">Loading gantt data…</span>
        </div>
      ) : techRows.length === 0 ? (
        <div className={styles.empty}>
          <Users size={24} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
          <p>No sites loaded yet.</p>
          <p className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Sync a project in Settings to populate the Gantt.
          </p>
        </div>
      ) : (
        <div className={styles.ganttWrap}>
          {/* Fixed left column + scrollable grid */}
          <div className={styles.ganttInner}>

            {/* Sticky left header */}
            <div className={styles.leftPanel}>
              <div className={styles.leftHeader}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  RFT / FST Owner
                </span>
              </div>
              {techRows.map(({ tech, sites: techSites }) => {
                const isCollapsed = collapsedTechs.has(tech)
                return (
                  <div key={tech} className={styles.techGroup}>
                    <button
                      className={styles.techLabel}
                      onClick={() => toggleTech(tech)}
                    >
                      <div className={styles.techAvatar}>
                        {tech === 'Unassigned' ? '?' : tech[0].toUpperCase()}
                      </div>
                      <div className={styles.techInfo}>
                        <span className={styles.techName}>{tech}</span>
                        <span className={styles.techCount}>{techSites.length} site{techSites.length !== 1 ? 's' : ''}</span>
                      </div>
                      {isCollapsed
                        ? <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        : <ChevronUp   size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      }
                    </button>

                    {!isCollapsed && techSites.map(site => (
                      <div
                        key={site.id}
                        className={styles.techSiteRow}
                        onClick={() => setEditSite(site)}
                      >
                        <span className={`mono ${styles.siteCode}`}>{site.code}</span>
                        <span className={styles.siteName}>{site.branch_name}</span>
                        <StatusBadge status={site.status} />
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>

            {/* Scrollable grid */}
            <div className={styles.gridScroll} ref={gridRef}>
              {/* Column headers */}
              <div className={styles.colHeaders}>
                {columns.map(col => (
                  <div
                    key={col.key}
                    className={`${styles.colHeader} ${col.isToday ? styles.colToday : ''}`}
                    data-today={col.isToday}
                    style={{ minWidth: scale === 'days' ? 56 : scale === 'weeks' ? 80 : 100 }}
                  >
                    <span className={styles.colLabel}>{col.label}</span>
                    <span className={styles.colSublabel}>{col.sublabel}</span>
                  </div>
                ))}
              </div>

              {/* Grid rows */}
              {techRows.map(({ tech, sites: techSites }) => {
                const isCollapsed = collapsedTechs.has(tech)
                return (
                  <div key={tech} className={styles.techGridGroup}>
                    {/* Tech header row (blank — aligns with left panel) */}
                    <div className={styles.techHeaderRow}>
                      {columns.map(col => (
                        <div
                          key={col.key}
                          className={`${styles.gridHeaderCell} ${col.isToday ? styles.gridCellToday : ''}`}
                          style={{ minWidth: scale === 'days' ? 56 : scale === 'weeks' ? 80 : 100 }}
                        />
                      ))}
                    </div>

                    {/* Site rows */}
                    {!isCollapsed && techSites.map(site => (
                      <div key={site.id} className={styles.gridRow}>
                        {columns.map(col => {
                          const active = siteInColumn(site, col)
                          const pos    = active ? sitePosition(site, col) : null
                          return (
                            <div
                              key={col.key}
                              className={`${styles.gridCell} ${col.isToday ? styles.gridCellToday : ''}`}
                              style={{ minWidth: scale === 'days' ? 56 : scale === 'weeks' ? 80 : 100 }}
                            >
                              {active && (
                                <GanttCell
                                  site={site}
                                  position={pos}
                                  project={site.project}
                                  onClick={setEditSite}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div className={styles.legend}>
            {[
              { status: 'scheduled',    color: 'var(--blue)' },
              { status: 'staffed',      color: 'var(--green)' },
              { status: 'in_progress',  color: 'var(--amber)' },
              { status: 'completed',    color: '#6b7280' },
              { status: 'cancelled',    color: 'var(--red)' },
              { status: 'flagged_payment',     color: '#f97316' },
              { status: 'flagged_date_change', color: 'var(--purple)' },
            ].map(({ status, color }) => (
              <div key={status} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: color }} />
                <span className={styles.legendLabel}>{status.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
