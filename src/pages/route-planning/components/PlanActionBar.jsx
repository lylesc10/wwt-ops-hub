import { useState } from 'react'
import { Wand2, AlertTriangle, CheckCircle, Loader2, CalendarClock, Sparkles } from 'lucide-react'
import { generateSchedule, optimizePlan, getConflicts, approvePlan } from '@/lib/routePlans'
import { toast } from '@/lib/toast'
import ConflictsDialog from './ConflictsDialog'
import styles from './PlanActionBar.module.css'

export default function PlanActionBar({ planId, planStatus, onRefresh, onSuggestTeams, suggestingTeams }) {
  const [generating, setGenerating] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [checking, setChecking] = useState(false)
  const [approving, setApproving] = useState(false)
  const [conflicts, setConflicts] = useState([])
  const [conflictsOpen, setConflictsOpen] = useState(false)

  const canApprove = planStatus === 'draft' || planStatus === 'optimized'

  async function handleGenerate() {
    setGenerating(true)
    try {
      await generateSchedule(planId)
      onRefresh()
      toast.success('Schedule generated — review stops in timeline')
    } catch {
      toast.error('Failed to generate schedule. Ensure teams are added.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleOptimize() {
    setOptimizing(true)
    try {
      await optimizePlan(planId)
      onRefresh()
      toast.success('Routes optimized successfully')
    } catch {
      toast.error('Failed to optimize routes')
    } finally {
      setOptimizing(false)
    }
  }

  async function handleCheckConflicts() {
    setChecking(true)
    try {
      const items = await getConflicts(planId)
      if (!items.length) {
        toast.success('No conflicts found')
      } else {
        setConflicts(items)
        setConflictsOpen(true)
      }
    } catch {
      toast.error('Failed to check conflicts')
    } finally {
      setChecking(false)
    }
  }

  async function handleApprove() {
    setApproving(true)
    try {
      const result = await approvePlan(planId)
      onRefresh()
      const count = result?.sites_updated ?? 0
      toast.success(`Plan approved — ${count} site${count !== 1 ? 's' : ''} updated on the Site Board`)
    } catch {
      toast.error('Failed to approve plan. Check for critical conflicts.')
    } finally {
      setApproving(false)
    }
  }

  const spinner = <Loader2 size={14} className={styles.spin} />

  return (
    <>
      <div className={styles.bar}>
        {onSuggestTeams && (
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onSuggestTeams}
            disabled={suggestingTeams || planStatus === 'approved'}
          >
            {suggestingTeams ? spinner : <Sparkles size={14} />}
            Suggest Teams
          </button>
        )}
        <button type="button" className={styles.actionBtn} onClick={handleGenerate} disabled={generating}>
          {generating ? spinner : <CalendarClock size={14} />}
          Generate Schedule
        </button>
        <button type="button" className={styles.actionBtn} onClick={handleOptimize} disabled={optimizing}>
          {optimizing ? spinner : <Wand2 size={14} />}
          Optimize Routes
        </button>
        <button type="button" className={styles.actionBtn} onClick={handleCheckConflicts} disabled={checking}>
          {checking ? spinner : <AlertTriangle size={14} />}
          Check Conflicts
        </button>
        <div className={styles.spacer} />
        <button
          type="button"
          className={styles.approveBtn}
          onClick={handleApprove}
          disabled={!canApprove || approving}
        >
          {approving ? spinner : <CheckCircle size={14} />}
          Approve Plan
        </button>
      </div>

      <ConflictsDialog
        planId={planId}
        conflicts={conflicts}
        open={conflictsOpen}
        onClose={() => setConflictsOpen(false)}
        onResolved={() => {
          setConflictsOpen(false)
          onRefresh()
          handleCheckConflicts()
        }}
      />
    </>
  )
}
