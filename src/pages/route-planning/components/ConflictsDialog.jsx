import { useState } from 'react'
import { AlertTriangle, Ban, CalendarClock, UserRoundPlus, X, Loader2 } from 'lucide-react'
import { resolveConflict, resolveAllConflicts } from '@/lib/routePlans'
import { toast } from '@/lib/toast'
import { useTechnicians } from '@/hooks/useTechnicians'
import styles from './ConflictsDialog.module.css'

export default function ConflictsDialog({ planId, conflicts, open, onClose, onResolved }) {
  const { technicians } = useTechnicians()
  const [resolving, setResolving] = useState(null)
  const [resolvingAll, setResolvingAll] = useState(false)
  const [dismissed, setDismissed] = useState(new Set())
  const [substituting, setSubstituting] = useState(null) // conflict index showing tech picker

  if (!open) return null

  const visibleConflicts = conflicts.filter((_, i) => !dismissed.has(i))

  async function handleReschedule(conflict) {
    if (!conflict.stop_id) return
    setResolving(`reschedule-${conflict.stop_id}`)
    try {
      const result = await resolveConflict(planId, {
        resolution: 'reschedule',
        stop_id: conflict.stop_id,
        tech_id: conflict.tech_id,
      })
      toast.success(`Stop rescheduled to ${result.new_start}`)
      onResolved()
    } catch {
      toast.error('Failed to reschedule stop')
    } finally {
      setResolving(null)
    }
  }

  async function handleSubstitute(conflict, replacementId) {
    if (!conflict.stop_id || !conflict.tech_id || !replacementId) return
    setResolving(`substitute-${conflict.stop_id}`)
    try {
      const result = await resolveConflict(planId, {
        resolution: 'substitute',
        stop_id: conflict.stop_id,
        tech_id: conflict.tech_id,
        replacement_tech_id: replacementId,
      })
      toast.success(`Substituted with ${result.new_tech_name}`)
      setSubstituting(null)
      onResolved()
    } catch {
      toast.error('Failed to substitute tech')
    } finally {
      setResolving(null)
    }
  }

  async function handleRescheduleAll() {
    setResolvingAll(true)
    try {
      const result = await resolveAllConflicts(planId)
      toast.success(result.message)
      onResolved()
    } catch {
      toast.error('Failed to reschedule conflicts')
    } finally {
      setResolvingAll(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} role="dialog">
        <div className={styles.header}>
          <h2 className={styles.title}>
            {visibleConflicts.length} conflict{visibleConflicts.length !== 1 ? 's' : ''} found
          </h2>
          <div className={styles.headerActions}>
            {visibleConflicts.length > 1 && (
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleRescheduleAll}
                disabled={resolvingAll || resolving !== null}
              >
                {resolvingAll ? <Loader2 size={12} className={styles.spin} /> : <CalendarClock size={12} />}
                Reschedule All
              </button>
            )}
            <button type="button" className={styles.closeBtn} onClick={onClose}>
              <X size={15} />
            </button>
          </div>
        </div>

        <div className={styles.body}>
          {visibleConflicts.length === 0 ? (
            <p className={styles.empty}>All conflicts resolved or dismissed.</p>
          ) : (
            conflicts.map((conflict, idx) => {
              if (dismissed.has(idx)) return null
              return (
                <div
                  key={`${conflict.type}-${conflict.stop_id ?? idx}-${conflict.tech_id ?? ''}`}
                  className={`${styles.conflict} ${conflict.severity === 'critical' ? styles.critical : styles.warning}`}
                >
                  <div className={styles.conflictTop}>
                    {conflict.type === 'double_booking' ? <Ban size={15} /> : <AlertTriangle size={15} />}
                    <div className={styles.conflictBody}>
                      <p className={styles.message}>{conflict.message}</p>
                      <div className={styles.meta}>
                        {conflict.tech_name && <span className={styles.metaBadge}>{conflict.tech_name}</span>}
                        {conflict.site_name && <span className={styles.metaBadge}>{conflict.site_name}</span>}
                        {conflict.stop_start && conflict.stop_end && (
                          <span className={styles.metaDates}>{conflict.stop_start} — {conflict.stop_end}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => handleReschedule(conflict)}
                      disabled={resolving !== null}
                    >
                      {resolving === `reschedule-${conflict.stop_id}`
                        ? <Loader2 size={11} className={styles.spin} />
                        : <CalendarClock size={11} />}
                      Reschedule
                    </button>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => setSubstituting(substituting === idx ? null : idx)}
                      disabled={resolving !== null}
                    >
                      {resolving === `substitute-${conflict.stop_id}`
                        ? <Loader2 size={11} className={styles.spin} />
                        : <UserRoundPlus size={11} />}
                      Substitute
                    </button>
                    <button
                      type="button"
                      className={styles.dismissBtn}
                      onClick={() => setDismissed((prev) => new Set([...prev, idx]))}
                    >
                      Dismiss
                    </button>
                  </div>

                  {substituting === idx && (
                    <select
                      className={styles.techSelect}
                      value=""
                      onChange={(e) => { if (e.target.value) handleSubstitute(conflict, e.target.value) }}
                    >
                      <option value="">Replace {conflict.tech_name} with…</option>
                      {technicians
                        .filter((t) => t.id !== conflict.tech_id)
                        .map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                    </select>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
