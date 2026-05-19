import { useState, useMemo } from 'react'
import { useAlerts } from '@/hooks/useAlerts'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader } from '@/components/PageHeader'
import {
  Bell, Check, X, Filter, RefreshCw,
  AlertTriangle, Calendar, Users, DollarSign,
  Plus, Minus, ChevronDown
} from 'lucide-react'
import { format } from 'date-fns'
import styles from './Alerts.module.css'

const ALERT_TYPES = [
  { key: 'date_change',           label: 'Date Change',         icon: Calendar,      color: 'var(--purple)' },
  { key: 'provider_cancelled',    label: 'Provider Cancelled',  icon: X,             color: 'var(--red)' },
  { key: 'unstaffed_approaching', label: 'Unstaffed',           icon: Users,         color: 'var(--amber)' },
  { key: 'payment_flag',          label: 'Payment Flag',        icon: DollarSign,    color: '#f97316' },
  { key: 'site_added',            label: 'Site Added',          icon: Plus,          color: 'var(--green)' },
  { key: 'site_removed',          label: 'Site Removed',        icon: Minus,         color: 'var(--text-muted)' },
]

const STATUS_OPTS = ['active', 'acknowledged', 'resolved']

export default function Alerts() {
  const { user, isPM } = useAuth()
  const { alerts, count, loading, acknowledge, resolve, refetch } = useAlerts({ activeOnly: false })

  const [filterStatus,  setFilterStatus]  = useState('active')
  const [filterType,    setFilterType]    = useState('all')
  const [selected,      setSelected]      = useState(new Set())
  const [bulkWorking,   setBulkWorking]   = useState(false)

  const filtered = useMemo(() => {
    return alerts.filter(a => {
      if (filterStatus !== 'all' && a.status !== filterStatus) return false
      if (filterType   !== 'all' && a.alert_type !== filterType) return false
      return true
    })
  }, [alerts, filterStatus, filterType])

  const toggleSelect = (id) => {
    setSelected(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(a => a.id)))
  }

  const bulkAcknowledge = async () => {
    setBulkWorking(true)
    for (const id of selected) await acknowledge(id, user?.id)
    setSelected(new Set())
    setBulkWorking(false)
  }

  const bulkResolve = async () => {
    setBulkWorking(true)
    for (const id of selected) await resolve(id)
    setSelected(new Set())
    setBulkWorking(false)
  }

  // Stats
  const activeCount   = alerts.filter(a => a.status === 'active').length
  const ackCount      = alerts.filter(a => a.status === 'acknowledged').length
  const resolvedCount = alerts.filter(a => a.status === 'resolved').length

  return (
    <div className={styles.page}>
      <PageHeader
        title="Alerts"
        subtitle="System notifications and status changes"
        actions={
          <div className={styles.headerActions}>
            <button className={styles.iconBtn} onClick={refetch} title="Refresh">
              <RefreshCw size={14} />
            </button>
          </div>
        }
      />

      {/* Stats bar */}
      <div className={styles.statsBar}>
        <StatChip label="Active"       value={activeCount}   color="var(--red)"          onClick={() => setFilterStatus('active')}       active={filterStatus === 'active'} />
        <StatChip label="Acknowledged" value={ackCount}      color="var(--amber)"         onClick={() => setFilterStatus('acknowledged')}  active={filterStatus === 'acknowledged'} />
        <StatChip label="Resolved"     value={resolvedCount} color="var(--text-muted)"   onClick={() => setFilterStatus('resolved')}     active={filterStatus === 'resolved'} />
        <StatChip label="All"          value={alerts.length} color="var(--text-secondary)" onClick={() => setFilterStatus('all')}         active={filterStatus === 'all'} />
      </div>

      {/* Filters + bulk actions */}
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <select
            className={styles.filterSelect}
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            {ALERT_TYPES.map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>

          <span className={styles.resultCount}>
            {filtered.length} alert{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {selected.size > 0 && isPM && (
          <div className={styles.bulkActions}>
            <span className={styles.selectedCount}>{selected.size} selected</span>
            <button
              className={styles.bulkBtn}
              onClick={bulkAcknowledge}
              disabled={bulkWorking}
            >
              <Check size={12} /> Acknowledge
            </button>
            <button
              className={`${styles.bulkBtn} ${styles.bulkResolve}`}
              onClick={bulkResolve}
              disabled={bulkWorking}
            >
              <X size={12} /> Resolve All
            </button>
          </div>
        )}
      </div>

      {/* Alert list */}
      <div className={styles.alertList}>
        {loading ? (
          <div className={styles.empty}>Loading alerts…</div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <Bell size={28} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
            <p>No {filterStatus !== 'all' ? filterStatus : ''} alerts</p>
            {filterStatus === 'active' && (
              <p className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                All clear — sync a project to generate alerts on changes
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Select all row */}
            {isPM && filtered.length > 0 && (
              <div className={styles.selectAllRow}>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={selectAll}
                  />
                  Select all
                </label>
              </div>
            )}

            {filtered.map(alert => (
              <AlertRow
                key={alert.id}
                alert={alert}
                selected={selected.has(alert.id)}
                onSelect={() => toggleSelect(alert.id)}
                onAcknowledge={() => acknowledge(alert.id, user?.id)}
                onResolve={() => resolve(alert.id)}
                isPM={isPM}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ── Alert Row ─────────────────────────────────────────────────
function AlertRow({ alert, selected, onSelect, onAcknowledge, onResolve, isPM }) {
  const [expanded, setExpanded] = useState(false)
  const typeMeta = ALERT_TYPES.find(t => t.key === alert.alert_type)
  const Icon = typeMeta?.icon ?? Bell
  const color = typeMeta?.color ?? 'var(--text-muted)'

  const isActive = alert.status === 'active'
  const isAck    = alert.status === 'acknowledged'
  const isResolved = alert.status === 'resolved'

  return (
    <div className={`${styles.alertRow} ${selected ? styles.alertRowSelected : ''} ${isResolved ? styles.alertRowResolved : ''}`}>
      <div className={styles.alertRowMain}>
        {isPM && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            className={styles.checkbox}
          />
        )}

        {/* Type icon */}
        <div className={styles.alertIcon} style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
          <Icon size={13} style={{ color }} />
        </div>

        {/* Content */}
        <div className={styles.alertContent} onClick={() => setExpanded(e => !e)}>
          <div className={styles.alertTitleRow}>
            <span className={styles.alertTitle}>{alert.title}</span>
            <span className={styles.alertType} style={{ color }}>{typeMeta?.label ?? alert.alert_type}</span>
          </div>
          {alert.site && (
            <div className={styles.alertMeta}>
              <span className="mono" style={{ color: 'var(--amber)', fontSize: 11 }}>{alert.site.code}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{alert.site.branch_name}</span>
            </div>
          )}
          <div className={styles.alertTime}>
            {format(new Date(alert.created_at), 'MMM d, yyyy · h:mm a')}
            {alert.acknowledged_at && (
              <span className={styles.ackTime}> · Acknowledged {format(new Date(alert.acknowledged_at), 'MMM d h:mm a')}</span>
            )}
          </div>
          {expanded && alert.detail && (
            <p className={styles.alertDetail}>{alert.detail}</p>
          )}
        </div>

        {/* Status badge */}
        <div className={styles.alertStatus}>
          {isActive    && <span className={styles.activeBadge}>Active</span>}
          {isAck       && <span className={styles.ackBadge}>Acknowledged</span>}
          {isResolved  && <span className={styles.resolvedBadge}>Resolved</span>}
        </div>

        {/* Actions */}
        {isPM && !isResolved && (
          <div className={styles.alertActions}>
            {isActive && (
              <button className={styles.ackBtn} onClick={onAcknowledge} title="Acknowledge">
                <Check size={13} />
              </button>
            )}
            <button className={styles.resolveBtn} onClick={onResolve} title="Resolve">
              <X size={13} />
            </button>
          </div>
        )}

        {alert.detail && (
          <button
            className={styles.expandBtn}
            onClick={() => setExpanded(e => !e)}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronDown size={13} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
        )}
      </div>
    </div>
  )
}

function StatChip({ label, value, color, onClick, active }) {
  return (
    <button
      className={`${styles.statChip} ${active ? styles.statChipActive : ''}`}
      onClick={onClick}
      style={active ? { borderColor: color, color } : {}}
    >
      <span className={styles.statValue} style={{ color: active ? color : undefined }}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </button>
  )
}
