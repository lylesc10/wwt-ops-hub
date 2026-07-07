import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Toaster } from '@/components/Toaster'
import { getScheduleOverview } from '@/lib/routePlans'
import { toast } from '@/lib/toast'
import GanttChart from './components/GanttChart'
import styles from './ScheduleOverview.module.css'

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
]

export default function ScheduleOverview() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('project')

  const now = new Date()
  const [startDate, setStartDate] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
  const [endDate, setEndDate] = useState(`${now.getFullYear()}-12-31`)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getScheduleOverview(startDate, endDate)
      .then((data) => { if (!cancelled) setItems(data) })
      .catch(() => { if (!cancelled) toast.error('Failed to load schedule overview') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [startDate, endDate])

  const projectColorMap = useMemo(() => {
    const map = new Map()
    for (const item of items) {
      if (!map.has(item.project_id)) map.set(item.project_id, COLORS[map.size % COLORS.length])
    }
    return map
  }, [items])

  const projectRows = useMemo(() => {
    const grouped = new Map()
    for (const item of items) {
      if (!grouped.has(item.project_id)) grouped.set(item.project_id, [])
      grouped.get(item.project_id).push(item)
    }
    return [...grouped.entries()].map(([projId, stops]) => ({
      id: projId,
      label: stops[0].project_name,
      sublabel: `${stops.length} stop${stops.length !== 1 ? 's' : ''}`,
      color: projectColorMap.get(projId),
      bars: stops
        .filter((s) => s.scheduled_start && s.scheduled_end)
        .map((s) => ({
          id: s.stop_id,
          start: s.scheduled_start,
          end: s.scheduled_end,
          label: `${s.site_name} (${s.team_name})`,
          hours: s.estimated_hours ?? undefined,
          color: s.team_color,
        })),
    }))
  }, [items, projectColorMap])

  const personRows = useMemo(() => {
    const grouped = new Map()
    for (const item of items) {
      for (const member of item.members) {
        const entry = grouped.get(member.technician_id) ?? { name: member.tech_name, stops: [] }
        entry.stops.push(item)
        grouped.set(member.technician_id, entry)
      }
    }
    return [...grouped.entries()].map(([techId, { name, stops }], idx) => ({
      id: techId,
      label: name,
      sublabel: `${stops.length} stop${stops.length !== 1 ? 's' : ''}`,
      color: COLORS[idx % COLORS.length],
      bars: stops
        .filter((s) => s.scheduled_start && s.scheduled_end)
        .map((s) => ({
          id: `${s.stop_id}-${techId}`,
          start: s.scheduled_start,
          end: s.scheduled_end,
          label: `${s.site_name} (${s.project_name})`,
          hours: s.estimated_hours ?? undefined,
          color: projectColorMap.get(s.project_id) ?? s.team_color,
        })),
    }))
  }, [items, projectColorMap])

  const rows = viewMode === 'project' ? projectRows : personRows
  const planCount = new Set(items.map((i) => i.plan_id)).size

  return (
    <div className={styles.page}>
      <PageHeader
        title="Schedule Overview"
        subtitle="All route plan stops across projects and teams"
        actions={
          <Link to="/route-planning" className={styles.ghostBtn}>
            <ArrowLeft size={14} />
            Route Plans
          </Link>
        }
      />

      <div className={styles.filterBar}>
        <div className={styles.toggle}>
          <button
            type="button"
            className={`${styles.toggleBtn} ${viewMode === 'project' ? styles.toggleActive : ''}`}
            onClick={() => setViewMode('project')}
          >
            By Project
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn} ${viewMode === 'person' ? styles.toggleActive : ''}`}
            onClick={() => setViewMode('person')}
          >
            By Person
          </button>
        </div>

        <div className={styles.dateRange}>
          <label htmlFor="sched-start">From</label>
          <input
            id="sched-start" type="date" className={styles.dateInput}
            value={startDate} onChange={(e) => setStartDate(e.target.value)}
          />
          <label htmlFor="sched-end">To</label>
          <input
            id="sched-end" type="date" className={styles.dateInput}
            value={endDate} onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div className={styles.stats}>
          {items.length} stop{items.length !== 1 ? 's' : ''} across {planCount} plan{planCount !== 1 ? 's' : ''}
        </div>
      </div>

      <div className={styles.body}>
        {viewMode === 'person' && projectColorMap.size > 0 && (
          <div className={styles.legend}>
            {[...projectColorMap.entries()].map(([projId, color]) => {
              const name = items.find((i) => i.project_id === projId)?.project_name ?? projId.slice(0, 8)
              return (
                <div key={projId} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ backgroundColor: color }} />
                  <span>{name}</span>
                </div>
              )
            })}
          </div>
        )}

        {loading ? (
          <div className={styles.loading}><Loader2 size={16} className={styles.spin} /> Loading schedule…</div>
        ) : (
          <GanttChart
            rows={rows}
            startDate={startDate}
            endDate={endDate}
            rowLabelHeader={viewMode === 'project' ? 'Project' : 'Person'}
            emptyMessage="No scheduled stops found in this date range."
          />
        )}
      </div>
      <Toaster />
    </div>
  )
}
