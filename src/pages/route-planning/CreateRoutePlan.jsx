import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { useProjects } from '@/hooks/useProjects'
import { createRoutePlan } from '@/lib/routePlans'
import styles from './CreateRoutePlan.module.css'

const TEAM_MODES = [
  { value: 'individual', label: 'Individual' },
  { value: 'fixed_team', label: 'Fixed Teams' },
  { value: 'flexible_group', label: 'Flexible Groups' },
]

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CreateRoutePlan() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedProject = searchParams.get('project')
  const { projects, loading: loadingProjects } = useProjects()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '',
    team_mode: 'fixed_team',
    start_date: '',
    end_date: '',
    include_travel_days: true,
    max_sites_per_night: '',
    work_days: [0, 1, 2, 3, 4], // 0=Mon .. 6=Sun
    project_ids: preselectedProject ? [preselectedProject] : [],
    notes: '',
  })

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  function toggleProject(id) {
    setForm((prev) => {
      const ids = prev.project_ids.includes(id)
        ? prev.project_ids.filter((pid) => pid !== id)
        : [...prev.project_ids, id]
      const selected = projects.filter((p) => ids.includes(p.id))
      const autoName = selected.map((p) => `${p.client}-${p.name}`).join(', ')
      return {
        ...prev,
        project_ids: ids,
        name: autoName ? `${autoName}-Plan` : prev.name,
      }
    })
  }

  function toggleWorkDay(pyDay) {
    setForm((prev) => ({
      ...prev,
      work_days: prev.work_days.includes(pyDay)
        ? prev.work_days.filter((d) => d !== pyDay)
        : [...prev.work_days, pyDay].sort((a, b) => a - b),
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const plan = await createRoutePlan({
        name: form.name,
        team_mode: form.team_mode,
        start_date: form.start_date,
        end_date: form.end_date || undefined,
        include_travel_days: form.include_travel_days,
        max_sites_per_night: form.max_sites_per_night ? parseInt(form.max_sites_per_night, 10) : undefined,
        work_days: form.work_days,
        project_ids: form.project_ids.length ? form.project_ids : undefined,
        notes: form.notes || undefined,
      })
      navigate(`/route-planning/${plan.id}`)
    } catch {
      setError('Failed to create route plan')
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader title="New Route Plan" subtitle="Select projects and set the scheduling window" />

      <div className={styles.body}>
        {error && (
          <div className={styles.errorBanner}><AlertCircle size={14} />{error}</div>
        )}

        <form className={styles.card} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Projects</label>
            {loadingProjects ? (
              <p className={styles.hint}>Loading projects…</p>
            ) : projects.length === 0 ? (
              <p className={styles.hint}>No active projects available.</p>
            ) : (
              <div className={styles.projectPicker}>
                {projects.map((proj) => (
                  <label key={proj.id} className={styles.projectOption}>
                    <input
                      type="checkbox"
                      checked={form.project_ids.includes(proj.id)}
                      onChange={() => toggleProject(proj.id)}
                    />
                    <span>{proj.name}</span>
                    <span className={styles.projectClient}>({proj.client})</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Plan Name</label>
            <input
              className={styles.input}
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              required
              placeholder="e.g. Week 12 - Southeast Region"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Team Mode</label>
            <div className={styles.radioGroup}>
              {TEAM_MODES.map((mode) => (
                <label key={mode.value} className={styles.radioOption}>
                  <input
                    type="radio"
                    name="team_mode"
                    value={mode.value}
                    checked={form.team_mode === mode.value}
                    onChange={(e) => updateField('team_mode', e.target.value)}
                  />
                  <span>{mode.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Start Date</label>
              <input
                className={styles.input}
                type="date"
                value={form.start_date}
                onChange={(e) => updateField('start_date', e.target.value)}
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>End Date</label>
              <input
                className={styles.input}
                type="date"
                value={form.end_date}
                onChange={(e) => updateField('end_date', e.target.value)}
              />
              <p className={styles.hint}>Optional — use What If? scenarios to determine the end date.</p>
            </div>
          </div>

          <label className={styles.checkOption}>
            <input
              type="checkbox"
              checked={form.include_travel_days}
              onChange={(e) => updateField('include_travel_days', e.target.checked)}
            />
            <span>Include travel days in schedule</span>
          </label>

          <div className={styles.field}>
            <label className={styles.label}>Work Days</label>
            <div className={styles.dayRow}>
              {DAY_LABELS.map((label, idx) => {
                const pyDay = idx === 0 ? 6 : idx - 1
                const selected = form.work_days.includes(pyDay)
                return (
                  <button
                    key={label}
                    type="button"
                    className={`${styles.dayBtn} ${selected ? styles.daySelected : ''}`}
                    onClick={() => toggleWorkDay(pyDay)}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <p className={styles.hint}>Select which days of the week are valid for scheduling site work.</p>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Max Sites Per Night</label>
            <input
              className={styles.input}
              type="number"
              min={1}
              max={20}
              value={form.max_sites_per_night}
              onChange={(e) => updateField('max_sites_per_night', e.target.value)}
              placeholder="No limit"
            />
            <p className={styles.hint}>Maximum site cutovers per night across the whole plan. Leave blank for no limit.</p>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Notes</label>
            <textarea
              className={styles.textarea}
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={3}
              placeholder="Optional notes for this route plan"
            />
          </div>

          <div className={styles.formActions}>
            <button type="submit" className={styles.primaryBtn} disabled={saving}>
              {saving ? 'Creating…' : 'Create Route Plan'}
            </button>
            <button type="button" className={styles.ghostBtn} onClick={() => navigate('/route-planning')}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
