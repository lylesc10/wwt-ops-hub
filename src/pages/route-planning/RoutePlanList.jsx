import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Route, Trash2, Loader2, CalendarRange } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Toaster } from '@/components/Toaster'
import { listRoutePlans, deleteRoutePlan } from '@/lib/routePlans'
import { toast } from '@/lib/toast'
import styles from './RoutePlanList.module.css'

const TEAM_MODE_LABELS = {
  individual: 'Individual',
  fixed_team: 'Fixed Teams',
  flexible_group: 'Flexible Groups',
}

export default function RoutePlanList() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listRoutePlans()
      .then(setPlans)
      .catch(() => toast.error('Failed to load route plans'))
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete route plan "${name}"? This cannot be undone.`)) return
    try {
      await deleteRoutePlan(id)
      setPlans((prev) => prev.filter((p) => p.id !== id))
      toast.success('Route plan deleted')
    } catch {
      toast.error('Failed to delete route plan')
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Route Planning"
        subtitle="Plan multi-day team routes across project sites"
        actions={
          <div className={styles.headerActions}>
            <Link to="/route-planning/overview" className={styles.ghostBtn}>
              <CalendarRange size={14} />
              Schedule Overview
            </Link>
            <button type="button" className={styles.primaryBtn} onClick={() => navigate('/route-planning/new')}>
              <Plus size={14} />
              New Route Plan
            </button>
          </div>
        }
      />

      <div className={styles.body}>
        {loading ? (
          <div className={styles.loading}><Loader2 size={16} className={styles.spin} /> Loading route plans…</div>
        ) : plans.length === 0 ? (
          <div className={styles.empty}>
            <Route size={44} className={styles.emptyIcon} />
            <p className={styles.emptyTitle}>No route plans yet</p>
            <p className={styles.emptySub}>Create one to start planning field service routes.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Mode</th>
                  <th>Dates</th>
                  <th className={styles.num}>Projects</th>
                  <th className={styles.num}>Teams</th>
                  <th className={styles.num}>Stops</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <Link to={`/route-planning/${plan.id}`} className={styles.planLink}>
                        {plan.name}
                      </Link>
                    </td>
                    <td>
                      <span className={styles.statusBadge} data-status={plan.status}>{plan.status}</span>
                    </td>
                    <td className={styles.muted}>{TEAM_MODE_LABELS[plan.team_mode] ?? plan.team_mode}</td>
                    <td className={styles.muted}>
                      {plan.start_date}{plan.end_date ? ` — ${plan.end_date}` : ''}
                    </td>
                    <td className={styles.num}>{plan.project_count}</td>
                    <td className={styles.num}>{plan.team_count}</td>
                    <td className={styles.num}>{plan.stop_count}</td>
                    <td className={styles.num}>
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(plan.id, plan.name)}
                        title="Delete plan"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Toaster />
    </div>
  )
}
