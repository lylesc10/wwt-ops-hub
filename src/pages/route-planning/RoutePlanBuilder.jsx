import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle, Pencil, Check, X, MapPin, Clock, Trash2, FlaskConical, Loader2, ArrowLeft,
} from 'lucide-react'
import { Toaster } from '@/components/Toaster'
import { toast } from '@/lib/toast'
import {
  getRoutePlan, updateRoutePlan, deleteRoutePlan,
  createTeam, updateTeam, deleteTeam,
  createStop, updateStop, deleteStop, reorderStops,
  suggestTeams,
} from '@/lib/routePlans'
import SitesPool from './components/SitesPool'
import TeamPanel from './components/TeamPanel'
import RouteMap from './components/RouteMap'
import PlanGantt from './components/PlanGantt'
import PlanActionBar from './components/PlanActionBar'
import TeamSuggestionsPanel from './components/TeamSuggestionsPanel'
import ScenarioBuilder from './components/ScenarioBuilder'
import styles from './RoutePlanBuilder.module.css'

const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function formatDate(iso, opts = { month: 'short', day: 'numeric' }) {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', opts)
}

export default function RoutePlanBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('map')
  const [suggestions, setSuggestions] = useState(null)
  const [suggestingTeams, setSuggestingTeams] = useState(false)
  const [acceptingTeams, setAcceptingTeams] = useState(false)

  const [editingHeader, setEditingHeader] = useState(false)
  const [headerForm, setHeaderForm] = useState({
    name: '', start_date: '', end_date: '', max_sites_per_night: '', work_days: [0, 1, 2, 3, 4],
  })

  const syncHeaderForm = (p) => setHeaderForm({
    name: p.name,
    start_date: p.start_date,
    end_date: p.end_date,
    max_sites_per_night: p.max_sites_per_night?.toString() ?? '',
    work_days: p.work_days ?? [0, 1, 2, 3, 4],
  })

  const loadPlan = useCallback(async () => {
    if (!id) return
    try {
      const fresh = await getRoutePlan(id, { includeSites: true })
      setPlan(fresh)
      syncHeaderForm(fresh)
    } catch {
      setError('Failed to load route plan')
    }
  }, [id])

  useEffect(() => {
    setLoading(true)
    loadPlan().finally(() => setLoading(false))
  }, [loadPlan])

  const allSites = plan?.sites ?? []
  const assignedSiteIds = useMemo(
    () => new Set((plan?.teams ?? []).flatMap((t) => t.stops.map((s) => s.site_id))),
    [plan],
  )
  const unassignedSites = allSites.filter((site) => !assignedSiteIds.has(site.id))

  const siteNames = useMemo(
    () => new Map(allSites.map((site) => [site.id, site.name || site.city || site.id.slice(0, 8)])),
    [allSites],
  )

  const scheduleStats = useMemo(() => {
    if (!plan) return null
    const allStops = plan.teams.flatMap((t) => t.stops)
    const scheduled = allStops.filter((s) => s.scheduled_start && s.scheduled_end)
    if (!scheduled.length) return null
    const starts = scheduled.map((s) => s.scheduled_start).sort()
    const ends = scheduled.map((s) => s.scheduled_end).sort()
    return {
      earliest: starts[0],
      latest: ends.at(-1),
      totalStops: scheduled.length,
      workDays: new Set(scheduled.map((s) => s.scheduled_start)).size,
      totalHours: scheduled.reduce((sum, s) => sum + (s.estimated_hours ?? 0), 0),
    }
  }, [plan])

  const unscheduledCount = allSites.length - (scheduleStats?.totalStops ?? 0)

  // ── plan header ─────────────────────────────────────────────

  async function handleDeletePlan() {
    if (!plan) return
    if (!window.confirm(`Delete route plan "${plan.name}"? This cannot be undone.`)) return
    try {
      await deleteRoutePlan(id)
      toast.success('Route plan deleted')
      navigate('/route-planning')
    } catch {
      toast.error('Failed to delete route plan')
    }
  }

  async function handleSaveHeader() {
    try {
      await updateRoutePlan(id, {
        name: headerForm.name,
        start_date: headerForm.start_date,
        end_date: headerForm.end_date || null,
        max_sites_per_night: headerForm.max_sites_per_night
          ? parseInt(headerForm.max_sites_per_night, 10) : null,
        work_days: headerForm.work_days,
      })
      await loadPlan()
      setEditingHeader(false)
      toast.success('Plan updated')
    } catch {
      toast.error('Failed to update plan')
    }
  }

  // ── teams ───────────────────────────────────────────────────

  async function handleCreateTeam(data) {
    try {
      const team = await createTeam(id, data)
      await loadPlan()
      toast.success(`Team "${data.name}" created`)
      return team.id
    } catch {
      toast.error('Failed to create team')
      return undefined
    }
  }

  async function handleUpdateTeam(teamId, data) {
    try {
      await updateTeam(teamId, data)
      await loadPlan()
      toast.success('Team updated')
    } catch {
      toast.error('Failed to update team')
    }
  }

  async function handleDeleteTeam(teamId) {
    try {
      await deleteTeam(teamId)
      await loadPlan()
      toast.success('Team deleted')
    } catch {
      toast.error('Failed to delete team')
    }
  }

  // ── stops ───────────────────────────────────────────────────

  async function handleAssignSite(siteId, teamId) {
    const team = plan?.teams.find((t) => t.id === teamId)
    try {
      await createStop(id, {
        team_id: teamId,
        site_id: siteId,
        stop_order: team ? team.stops.length + 1 : 1,
      })
      await loadPlan()
      toast.success('Site assigned')
    } catch {
      toast.error('Failed to assign site')
    }
  }

  async function handleUpdateStop(stopId, data) {
    try {
      await updateStop(stopId, data)
      await loadPlan()
      toast.success('Stop updated')
    } catch {
      toast.error('Failed to update stop')
    }
  }

  async function handleDeleteStop(stopId) {
    try {
      await deleteStop(stopId)
      await loadPlan()
      toast.success('Stop removed')
    } catch {
      toast.error('Failed to remove stop')
    }
  }

  async function moveStop(teamId, stopId, direction) {
    const team = plan?.teams.find((t) => t.id === teamId)
    if (!team) return
    const sorted = [...team.stops].sort((a, b) => a.stop_order - b.stop_order)
    const idx = sorted.findIndex((s) => s.id === stopId)
    const swapWith = idx + direction
    if (idx < 0 || swapWith < 0 || swapWith >= sorted.length) return
    ;[sorted[idx], sorted[swapWith]] = [sorted[swapWith], sorted[idx]]
    try {
      await reorderStops(teamId, sorted.map((s) => s.id))
      await loadPlan()
    } catch {
      toast.error('Failed to reorder stops')
    }
  }

  // ── team suggestions ────────────────────────────────────────

  const handleSuggestTeams = useCallback(async () => {
    setSuggestingTeams(true)
    try {
      setSuggestions(await suggestTeams(id))
    } catch {
      toast.error('Failed to generate team suggestions')
    } finally {
      setSuggestingTeams(false)
    }
  }, [id])

  const handleAcceptAllTeams = useCallback(async () => {
    if (!suggestions) return
    setAcceptingTeams(true)
    try {
      for (const team of suggestions.teams) {
        await createTeam(id, {
          name: team.name,
          color: team.color,
          member_ids: team.members.map((m) => m.tech_id),
        })
      }
      const n = suggestions.teams.length
      setSuggestions(null)
      await loadPlan()
      toast.success(`${n} team${n !== 1 ? 's' : ''} created — use Generate Schedule to assign sites`)
    } catch {
      toast.error('Failed to create teams from suggestions')
    } finally {
      setAcceptingTeams(false)
    }
  }, [id, suggestions, loadPlan])

  // ── render ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <Loader2 size={16} className={styles.spin} /> Loading route plan…
      </div>
    )
  }

  if (error || !plan) {
    return (
      <div className={styles.errorWrap}>
        <AlertCircle size={15} />
        {error || 'Route plan not found.'}
        <button type="button" className={styles.linkBtn} onClick={() => navigate('/route-planning')}>
          Back to plans
        </button>
      </div>
    )
  }

  const ganttEndDate = (() => {
    const latestStop = scheduleStats?.latest
    const planEnd = plan.end_date || null
    if (planEnd && latestStop) return planEnd > latestStop ? planEnd : latestStop
    if (latestStop) return latestStop
    if (planEnd) return planEnd
    const fb = new Date(`${String(plan.start_date).slice(0, 10)}T00:00:00`)
    fb.setDate(fb.getDate() + 30)
    return fb.toISOString().slice(0, 10)
  })()

  return (
    <div className={styles.page}>
      {/* Header bar */}
      <div className={styles.headerBar}>
        <button type="button" className={styles.backBtn} onClick={() => navigate('/route-planning')} title="Back to plans">
          <ArrowLeft size={15} />
        </button>
        {editingHeader ? (
          <>
            <input
              className={styles.nameInput}
              value={headerForm.name}
              onChange={(e) => setHeaderForm((p) => ({ ...p, name: e.target.value }))}
            />
            <label className={styles.inlineLabel}>From</label>
            <input
              type="date" className={styles.dateInput} value={headerForm.start_date}
              onChange={(e) => setHeaderForm((p) => ({ ...p, start_date: e.target.value }))}
            />
            <label className={styles.inlineLabel}>to</label>
            <input
              type="date" className={styles.dateInput} value={headerForm.end_date}
              onChange={(e) => setHeaderForm((p) => ({ ...p, end_date: e.target.value }))}
            />
            <label className={styles.inlineLabel} title="Max number of sites to cut over per night across the plan">
              Max sites/night
            </label>
            <input
              type="number" min={1} max={20} className={styles.numInput} placeholder="∞"
              value={headerForm.max_sites_per_night}
              onChange={(e) => setHeaderForm((p) => ({ ...p, max_sites_per_night: e.target.value }))}
            />
            <label className={styles.inlineLabel}>Days</label>
            {DAY_SHORT.map((label, idx) => {
              const pyDay = idx === 0 ? 6 : idx - 1
              const selected = headerForm.work_days.includes(pyDay)
              return (
                <button
                  key={label}
                  type="button"
                  className={`${styles.dayBtn} ${selected ? styles.daySelected : ''}`}
                  onClick={() => setHeaderForm((p) => ({
                    ...p,
                    work_days: selected
                      ? p.work_days.filter((d) => d !== pyDay)
                      : [...p.work_days, pyDay].sort((a, b) => a - b),
                  }))}
                >
                  {label}
                </button>
              )
            })}
            <button type="button" className={styles.iconBtn} onClick={handleSaveHeader}><Check size={14} /></button>
            <button
              type="button" className={styles.iconBtn}
              onClick={() => { setEditingHeader(false); syncHeaderForm(plan) }}
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <h1 className={styles.planName}>{plan.name}</h1>
            <span className={styles.statusBadge} data-status={plan.status}>{plan.status}</span>
            <span className={styles.headerMeta}>
              <Clock size={12} />
              {plan.end_date
                ? `${formatDate(plan.start_date)} - ${formatDate(plan.end_date, { month: 'short', day: 'numeric', year: 'numeric' })}`
                : `Starts ${formatDate(plan.start_date, { month: 'short', day: 'numeric', year: 'numeric' })} — end TBD`}
            </span>
            <span className={styles.modeBadge}>{plan.team_mode}</span>
            {plan.work_days && plan.work_days.length < 7 && (
              <span className={styles.modeBadge}>
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].filter((_, i) => plan.work_days.includes(i)).join('·')}
              </span>
            )}
            {plan.max_sites_per_night && (
              <span className={styles.modeBadge}>{plan.max_sites_per_night} sites/night</span>
            )}
            <button type="button" className={styles.iconBtn} onClick={() => setEditingHeader(true)}>
              <Pencil size={12} />
            </button>
            <div className={styles.headerRight}>
              <span className={styles.headerMeta}>
                <MapPin size={12} />
                {allSites.length} sites, {unassignedSites.length} unassigned
              </span>
              <button type="button" className={`${styles.iconBtn} ${styles.iconDanger}`} onClick={handleDeletePlan}>
                <Trash2 size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Schedule summary */}
      {!scheduleStats && allSites.length > 0 && plan.teams.length > 0 && (
        <div className={`${styles.summaryBar} ${styles.summaryPending}`}>
          {allSites.length} sites ready — generate schedule to assign dates
        </div>
      )}
      {scheduleStats && (
        <div className={styles.summaryBar}>
          <span className={styles.summaryTitle}>Current Schedule:</span>
          <span>
            {formatDate(scheduleStats.earliest)}
            {' — '}
            <strong>{formatDate(scheduleStats.latest, { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
          </span>
          <span className={styles.summaryMuted}>{scheduleStats.totalStops} stops</span>
          <span className={styles.summaryMuted}>{scheduleStats.workDays} work days</span>
          <span className={styles.summaryMuted}>{Math.round(scheduleStats.totalHours)}h total</span>
          {plan.end_date && scheduleStats.latest > plan.end_date && (
            <span className={styles.summaryOver}>
              Exceeds planned end by{' '}
              {Math.ceil((new Date(scheduleStats.latest) - new Date(plan.end_date)) / 86400000)} days
            </span>
          )}
          {unscheduledCount > 0 && (
            <span className={styles.summaryWarn}>
              {unscheduledCount} site{unscheduledCount !== 1 ? 's' : ''} not in schedule
            </span>
          )}
        </div>
      )}

      {/* Body */}
      <div className={styles.bodyRow}>
        <div className={styles.sidebar}>
          {suggestions && (
            <TeamSuggestionsPanel
              data={suggestions}
              onAcceptAll={handleAcceptAllTeams}
              onDismiss={() => setSuggestions(null)}
              accepting={acceptingTeams}
              siteNames={siteNames}
            />
          )}
          <SitesPool sites={unassignedSites} teams={plan.teams} onAssign={handleAssignSite} />
          <TeamPanel
            teams={plan.teams}
            onCreateTeam={handleCreateTeam}
            onUpdateTeam={handleUpdateTeam}
            onDeleteTeam={handleDeleteTeam}
            onUpdateStop={handleUpdateStop}
            onDeleteStop={handleDeleteStop}
            onMoveStopUp={(teamId, stopId) => moveStop(teamId, stopId, -1)}
            onMoveStopDown={(teamId, stopId) => moveStop(teamId, stopId, 1)}
          />
        </div>

        <div className={styles.main}>
          <div className={styles.tabs}>
            {['map', 'timeline', 'scenarios'].map((tab) => (
              <button
                key={tab}
                type="button"
                className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'scenarios' && <FlaskConical size={12} />}
                {tab === 'map' ? 'Map' : tab === 'timeline' ? 'Timeline' : 'What If?'}
              </button>
            ))}
          </div>

          {activeTab === 'map' ? (
            <RouteMap teams={plan.teams} />
          ) : activeTab === 'timeline' ? (
            <div className={styles.timelineWrap}>
              <PlanGantt teams={plan.teams} startDate={plan.start_date} endDate={ganttEndDate} />
            </div>
          ) : (
            <ScenarioBuilder
              planId={plan.id}
              onApplyScenario={async (scenario) => {
                try {
                  await updateRoutePlan(id, { max_sites_per_night: scenario.max_sites_per_night })
                  await loadPlan()
                  toast.success('Scenario applied — generate schedule to commit')
                } catch {
                  toast.error('Failed to apply scenario')
                }
              }}
            />
          )}
        </div>
      </div>

      <PlanActionBar
        planId={plan.id}
        planStatus={plan.status}
        onRefresh={loadPlan}
        onSuggestTeams={handleSuggestTeams}
        suggestingTeams={suggestingTeams}
      />
      <Toaster />
    </div>
  )
}
