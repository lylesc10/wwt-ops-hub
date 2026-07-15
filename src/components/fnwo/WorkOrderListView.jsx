import { useState, useMemo } from 'react'
import { Search, RefreshCw } from 'lucide-react'
import { startOfWeek, endOfWeek, addWeeks, addDays, addMonths, startOfDay, format } from 'date-fns'
import { useFieldNationWorkOrders } from '@/hooks/useFieldNationWorkOrders'
import { useProjects } from '@/hooks/useProjects'
import { FN_STATUS_META } from '@/hooks/useSiteWorkOrders'
import { WorkOrderEditModal } from './WorkOrderEditModal'
import styles from './WorkOrderListView.module.css'

const DATE_WINDOWS = [
  { value: 'all', label: 'All Dates' },
  { value: 'this_week', label: 'This Week' },
  { value: 'next_week', label: 'Next Week' },
  { value: '2_weeks', label: 'Next 2 Weeks' },
  { value: 'month', label: 'This Month' },
  { value: '60_days', label: 'Next 60 Days' },
]

function dateWindowToRange(window) {
  const now = new Date()
  const today = startOfDay(now)
  const wkStart = startOfWeek(now, { weekStartsOn: 1 })
  const wkEnd = endOfWeek(now, { weekStartsOn: 1 })
  switch (window) {
    case 'this_week': return { start: wkStart, end: wkEnd }
    case 'next_week': return { start: addWeeks(wkStart, 1), end: addWeeks(wkEnd, 1) }
    case '2_weeks': return { start: today, end: addWeeks(today, 2) }
    case 'month': return { start: today, end: addMonths(today, 1) }
    case '60_days': return { start: today, end: addDays(today, 60) }
    default: return null
  }
}

// Normalizes wo.status.name ("Draft", "Work Done", ...) to FN_STATUS_META's
// snake_case keys ("draft", "work_done", ...).
function statusKeyOf(wo) {
  const name = wo.status?.name ?? wo.status
  return name ? name.toLowerCase().replace(/\s+/g, '_') : 'UNKNOWN'
}

function scheduledDateOf(wo) {
  return wo.schedule?.service_window?.start?.local?.date || null
}

function payLabelOf(wo) {
  if (wo.pay?.type === 'hourly' && wo.pay?.base?.rate != null) return `$${wo.pay.base.rate}/hr`
  if (wo.pay?.base?.amount != null) return `$${wo.pay.base.amount} fixed`
  return '—'
}

function providerNameOf(wo) {
  const p = wo.routing?.assigned?.provider
  return p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : null
}

export function WorkOrderListView() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [project, setProject] = useState('all')
  const [dateWindow, setDateWindow] = useState('all')
  const [editWO, setEditWO] = useState(null)

  const { projects } = useProjects()

  const filters = useMemo(() => {
    const range = dateWindow === 'all' ? null : dateWindowToRange(dateWindow)
    return {
      status,
      project,
      dateStart: range ? format(range.start, 'yyyy-MM-dd') : undefined,
      dateEnd: range ? format(range.end, 'yyyy-MM-dd') : undefined,
    }
  }, [status, project, dateWindow])

  const { workOrders, total, loading, error, mock, refetch } = useFieldNationWorkOrders(filters)

  const filtered = useMemo(() => {
    let list = workOrders

    // Some FN statuses share a server-side list (published+routed) or have
    // no dedicated list at all (paid, cancelled — see STATUS_TO_FN_LIST in
    // the hook) and fall back to fetching 'all'. Filtering again here by the
    // actual returned status guarantees correctness regardless of which
    // case applies, at the cost of being a harmless no-op the rest of the time.
    if (status !== 'all') list = list.filter((wo) => statusKeyOf(wo) === status)

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((wo) =>
        String(wo.id).includes(q) ||
        (wo.title ?? '').toLowerCase().includes(q))
    }

    return list
  }, [workOrders, search, status])

  return (
    <div className={styles.page}>
      <div className={styles.controls}>
        <button className={`${styles.iconBtn} ${loading ? styles.iconBtnSpinning : ''}`} onClick={refetch} title="Refresh" disabled={loading}>
          <RefreshCw size={14} className={loading ? styles.spinIcon : ''} />
        </button>

        <div className={styles.searchBox}>
          <Search size={13} />
          <input placeholder="Search title or WO ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <select className={styles.filterSelect} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          {Object.entries(FN_STATUS_META).filter(([k]) => k !== 'UNKNOWN').map(([k, meta]) => (
            <option key={k} value={k}>{meta.label}</option>
          ))}
        </select>

        <select className={styles.filterSelect} value={dateWindow} onChange={(e) => setDateWindow(e.target.value)}>
          {DATE_WINDOWS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
        </select>

        <select className={styles.filterSelect} value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="all">All Projects</option>
          {projects.filter((p) => p.fn_project_id).map((p) => (
            <option key={p.id} value={p.fn_project_id}>{p.name}</option>
          ))}
        </select>

        {!mock && <span className={styles.count}>{filtered.length} of {total}</span>}
      </div>

      <div className={styles.tableWrap}>
        {mock && (
          <div className={styles.mockNote}>Mock mode — configure FieldNation credentials in Settings → API to see live work orders.</div>
        )}
        {error ? (
          <div className={styles.empty}>
            <p>{error}</p>
            <button className={styles.retryBtn} onClick={refetch}>Retry</button>
          </div>
        ) : loading ? (
          <div className={styles.empty}><span className="mono">Loading…</span></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}><p>No work orders match your filters.</p></div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>WO ID</th>
                <th>Title</th>
                <th>Status</th>
                <th>Scheduled</th>
                <th>Pay</th>
                <th>Location</th>
                <th>Provider</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((wo) => {
                const meta = FN_STATUS_META[statusKeyOf(wo)] ?? FN_STATUS_META.UNKNOWN
                const provider = providerNameOf(wo)
                return (
                  <tr key={wo.id} className={styles.row}>
                    <td>
                      <button className={styles.woIdBtn} onClick={() => setEditWO(wo)}>{wo.id}</button>
                    </td>
                    <td className={styles.titleCell}>{wo.title ?? '—'}</td>
                    <td><span className={styles.statusPill} style={{ color: meta.color, background: `${meta.color}29` }}>{meta.label}</span></td>
                    <td className="mono" style={{ fontSize: 11 }}>{scheduledDateOf(wo) ?? '—'}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{payLabelOf(wo)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {[wo.location?.city, wo.location?.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>{provider ?? <span className={styles.unassigned}>Unassigned</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {editWO && (
        <WorkOrderEditModal
          woSummary={editWO}
          onClose={() => setEditWO(null)}
          onSaved={refetch}
        />
      )}
    </div>
  )
}
