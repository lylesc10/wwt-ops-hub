import { Fragment, useCallback, useState } from 'react'
import { Plus, X, FlaskConical, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { runWhatIf } from '@/lib/routePlans'
import { toast } from '@/lib/toast'
import styles from './ScenarioBuilder.module.css'

const SCENARIO_LABELS = ['A', 'B', 'C', 'D']

function createDefaultForm(index) {
  return {
    label: `Scenario ${SCENARIO_LABELS[index] ?? index + 1}`,
    max_sites_per_night: '',
    max_work_hours_per_day: '10',
    estimated_hours_override: '',
    techs_per_site: '',
    extra_teams: '',
  }
}

function formToScenario(form) {
  return {
    label: form.label,
    max_sites_per_night: form.max_sites_per_night ? parseInt(form.max_sites_per_night, 10) : null,
    max_work_hours_per_day: parseFloat(form.max_work_hours_per_day) || 10,
    estimated_hours_override: form.estimated_hours_override ? parseFloat(form.estimated_hours_override) : null,
    techs_per_site: form.techs_per_site ? parseInt(form.techs_per_site, 10) : null,
    extra_teams: form.extra_teams ? parseInt(form.extra_teams, 10) : null,
  }
}

function findBestIndex(values, lower) {
  if (!values.length) return undefined
  const target = lower ? Math.min(...values) : Math.max(...values)
  if (values.every((v) => v === values[0])) return undefined
  return values.indexOf(target)
}

function MetricRow({ label, values, bestIndex, warnIndices = [] }) {
  return (
    <tr>
      <td className={styles.metricLabel}>{label}</td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`${styles.metricCell} ${bestIndex === i ? styles.best : ''} ${warnIndices.includes(i) ? styles.warn : ''}`}
        >
          {v}
        </td>
      ))}
    </tr>
  )
}

const FIELDS = [
  { key: 'max_sites_per_night', label: 'Max Sites / Night', props: { type: 'number', min: 1, max: 50, placeholder: 'No limit' } },
  { key: 'max_work_hours_per_day', label: 'Max Hours / Day', props: { type: 'number', min: 1, max: 24, step: 0.5 } },
  { key: 'estimated_hours_override', label: 'Est. Hours / Site', props: { type: 'number', min: 0.5, max: 24, step: 0.5, placeholder: 'Use defaults' } },
  { key: 'techs_per_site', label: 'Techs / Site', props: { type: 'number', min: 1, max: 10, placeholder: 'Use current teams' } },
  { key: 'extra_teams', label: 'Extra Teams', props: { type: 'number', min: 1, max: 50, placeholder: '0 additional' } },
]

export default function ScenarioBuilder({ planId, onApplyScenario }) {
  const [forms, setForms] = useState([createDefaultForm(0), createDefaultForm(1)])
  const [results, setResults] = useState(null)
  const [running, setRunning] = useState(false)
  const [expandedTeams, setExpandedTeams] = useState(false)

  const updateForm = useCallback((index, field, value) => {
    setForms((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)))
  }, [])

  const handleRun = useCallback(async () => {
    setRunning(true)
    try {
      const response = await runWhatIf(planId, forms.map(formToScenario))
      setResults(response.scenarios)
    } catch {
      toast.error('Failed to run what-if scenarios')
    } finally {
      setRunning(false)
    }
  }, [planId, forms])

  return (
    <div className={styles.wrap}>
      <div className={styles.formsRow}>
        {forms.map((form, idx) => (
          <div key={idx} className={styles.scenarioCard}>
            {forms.length > 1 && (
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => { setForms((prev) => prev.filter((_, i) => i !== idx)); setResults(null) }}
              >
                <X size={13} />
              </button>
            )}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Label</label>
              <input
                className={styles.input}
                value={form.label}
                onChange={(e) => updateForm(idx, 'label', e.target.value)}
              />
            </div>
            {FIELDS.map(({ key, label, props }) => (
              <div key={key} className={styles.field}>
                <label className={styles.fieldLabel}>{label}</label>
                <input
                  className={styles.input}
                  {...props}
                  value={form[key]}
                  onChange={(e) => updateForm(idx, key, e.target.value)}
                />
              </div>
            ))}
          </div>
        ))}

        {forms.length < 4 && (
          <button
            type="button"
            className={styles.addCard}
            onClick={() => setForms((prev) => (prev.length >= 4 ? prev : [...prev, createDefaultForm(prev.length)]))}
          >
            <Plus size={18} />
            <span>Add Scenario</span>
          </button>
        )}
      </div>

      <button type="button" className={styles.runBtn} onClick={handleRun} disabled={running}>
        {running ? <Loader2 size={14} className={styles.spin} /> : <FlaskConical size={14} />}
        {running ? 'Running…' : 'Run Comparison'}
      </button>

      {results && results.length > 0 && (
        <div className={styles.results}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Metric</th>
                  {results.map((r, i) => <th key={i} className={styles.thCenter}>{r.label}</th>)}
                </tr>
              </thead>
              <tbody>
                <MetricRow label="Total Stops" values={results.map((r) => r.total_stops)}
                  bestIndex={findBestIndex(results.map((r) => r.total_stops), false)} />
                <MetricRow label="Work Days" values={results.map((r) => r.work_days)}
                  bestIndex={findBestIndex(results.map((r) => r.work_days), true)} />
                <MetricRow label="Calendar Span" values={results.map((r) => `${r.calendar_span} days`)}
                  bestIndex={findBestIndex(results.map((r) => r.calendar_span), true)} />
                <MetricRow label="Date Range" values={results.map((r) =>
                  (r.date_range_start && r.date_range_end ? `${r.date_range_start} — ${r.date_range_end}` : 'N/A'))} />
                <MetricRow label="Avg Hours / Day" values={results.map((r) => `${r.avg_hours_per_day}h`)} />
                <MetricRow label="Max Daily Hours" values={results.map((r) => `${r.max_daily_hours}h`)}
                  bestIndex={findBestIndex(results.map((r) => r.max_daily_hours), true)} />
                <MetricRow label="Unscheduled" values={results.map((r) => r.unscheduled_sites)}
                  warnIndices={results.map((r, i) => (r.unscheduled_sites > 0 ? i : -1)).filter((i) => i >= 0)} />
                <tr>
                  <td className={styles.metricLabel} />
                  {results.map((_r, i) => (
                    <td key={i} className={styles.metricCell}>
                      <button
                        type="button"
                        className={styles.applyBtn}
                        onClick={() => {
                          const form = forms[i]
                          onApplyScenario({
                            max_sites_per_night: form.max_sites_per_night
                              ? parseInt(form.max_sites_per_night, 10)
                              : null,
                          })
                        }}
                      >
                        Apply
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {results.some((r) => r.teams.length > 0) && (
            <div>
              <button type="button" className={styles.teamToggle} onClick={() => setExpandedTeams((v) => !v)}>
                {expandedTeams ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Per-Team Breakdown
              </button>

              {expandedTeams && (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.th}>Team</th>
                        {results.map((r, i) => <th key={i} className={styles.thCenter} colSpan={3}>{r.label}</th>)}
                      </tr>
                      <tr>
                        <th className={styles.th} />
                        {results.map((_, i) => (
                          <Fragment key={i}>
                            <th className={styles.thSub}>Stops</th>
                            <th className={styles.thSub}>Hours</th>
                            <th className={styles.thSub}>Days</th>
                          </Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...new Set(results.flatMap((r) => r.teams.map((t) => t.team_name)))].map((teamName) => (
                        <tr key={teamName}>
                          <td className={styles.metricLabel}>{teamName}</td>
                          {results.map((r, i) => {
                            const team = r.teams.find((t) => t.team_name === teamName)
                            return (
                              <Fragment key={i}>
                                <td className={styles.metricCell}>{team?.stop_count ?? '—'}</td>
                                <td className={styles.metricCell}>{team ? `${team.total_hours}h` : '—'}</td>
                                <td className={styles.metricCell}>{team?.work_days ?? '—'}</td>
                              </Fragment>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
