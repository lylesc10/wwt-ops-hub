import { useState, useEffect, useCallback } from 'react'
import { X, Save, Send, Undo2 } from 'lucide-react'
import { getWorkOrder, updateWorkOrder, publishWorkOrder, revertPublish } from '@/lib/fieldnation'
import { useAuth } from '@/hooks/useAuth'
import styles from './WorkOrderEditModal.module.css'

const TABS = ['details', 'schedule', 'pay']
const TAB_LABELS = { details: 'Details', schedule: 'Schedule', pay: 'Pay' }

// Statuses at which the WO is considered "live" (published or further along
// the FN lifecycle) — Revert Publish is offered, and Save and Push is
// disabled since there's nothing left to push.
const PUBLISHED_STATUSES = new Set(['published', 'routed', 'assigned', 'work_done', 'approved', 'paid'])

function emptyForm() {
  return {
    title: '', description: '',
    address1: '', address2: '', city: '', state: '', zip: '', country: 'US',
    date: '', startTime: '', endTime: '', approxHours: '',
    payType: 'fixed', payAmount: '', payRate: '', payMaxUnits: '',
  }
}

// Maps a fetched FN work order (GET /workorders/{id}?include[]=schedule,pay,location)
// into the flat field shape wo-payloads.js's diffToPatch()/builders expect.
function formFromDetail(detail) {
  const startLocal = detail.scheduling?.start_time?.local
  const schedDate = startLocal?.date
    ?? detail.scheduling?.start_time?.local_time?.split('T')[0]
    ?? ''
  const isHourly = detail.pay?.hourly != null
  return {
    title: detail.title ?? '',
    description: detail.description ?? '',
    address1: detail.location?.address1 ?? '',
    address2: detail.location?.address2 ?? '',
    city: detail.location?.city ?? '',
    state: detail.location?.state ?? '',
    zip: detail.location?.zip ?? '',
    country: detail.location?.country ?? 'US',
    date: schedDate,
    startTime: startLocal?.time ?? '',
    endTime: detail.scheduling?.end_time?.local?.time ?? '',
    approxHours: '',
    payType: isHourly ? 'hourly' : 'fixed',
    payAmount: detail.pay?.fixed?.amount ?? '',
    payRate: detail.pay?.hourly?.rate ?? '',
    payMaxUnits: detail.pay?.hourly?.max_units ?? '',
  }
}

export function WorkOrderEditModal({ woSummary, onClose, onSaved }) {
  const { isPM } = useAuth()
  const [tab, setTab] = useState('details')
  const [detail, setDetail] = useState(null)
  const [initial, setInitial] = useState(emptyForm())
  const [form, setForm] = useState(emptyForm())
  const [loadingDetail, setLoadingDetail] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoadingDetail(true)
    getWorkOrder(woSummary.id)
      .then((data) => {
        if (cancelled) return
        setDetail(data)
        const seeded = formFromDetail(data)
        setInitial(seeded)
        setForm(seeded)
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoadingDetail(false))
    return () => { cancelled = true }
  }, [woSummary.id])

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const statusKey = detail?.status?.name ?? detail?.status ?? woSummary.status?.name ?? woSummary.status ?? 'draft'
  const isPublished = PUBLISHED_STATUSES.has(statusKey)

  const runUpdate = useCallback(async () => {
    const result = await updateWorkOrder(woSummary.id, initial, form)
    if (!result.ok) {
      const failed = result.results?.find((r) => !r.ok)
      const skippedNote = result.skipped?.length ? ` (skipped: ${result.skipped.join(', ')})` : ''
      throw new Error(`${failed?.resource ?? 'update'} failed: ${failed?.error ?? 'unknown error'}${skippedNote}`)
    }
    return result
  }, [woSummary.id, initial, form])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await runUpdate()
      setInitial(form)
      onSaved?.()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAndPush = async () => {
    setSaving(true)
    setError(null)
    try {
      await runUpdate()
      if (!isPublished) await publishWorkOrder(woSummary.id)
      setInitial(form)
      onSaved?.()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRevertPublish = async () => {
    if (!window.confirm(`Revert the publish for WO ${woSummary.id}? This moves it back to draft in FieldNation.`)) return
    setSaving(true)
    setError(null)
    try {
      await revertPublish(woSummary.id)
      onSaved?.()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <span className={`mono ${styles.code}`}>WO {woSummary.id}</span>
            <h2 className={styles.modalTitle}>{form.title || woSummary.title || 'Work Order'}</h2>
          </div>
          <div className={styles.headerActions}>
            {isPM && isPublished && (
              <button className={styles.revertBtn} onClick={handleRevertPublish} disabled={saving} title="Revert publish">
                <Undo2 size={13} /> Revert Publish
              </button>
            )}
            <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className={styles.tabBar}>
          {TABS.map((t) => (
            <button key={t} className={`${styles.tabBtn} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div className={styles.modalBody}>
          {loadingDetail ? (
            <p className={styles.loadingNote}>Loading work order…</p>
          ) : (
            <>
              {tab === 'details' && (
                <>
                  <Field label="Title"><input value={form.title} onChange={set('title')} disabled={!isPM} /></Field>
                  <Field label="Description"><textarea value={form.description} onChange={set('description')} rows={3} disabled={!isPM} /></Field>
                  <Field label="Address"><input value={form.address1} onChange={set('address1')} disabled={!isPM} /></Field>
                  <Field label="Address 2"><input value={form.address2} onChange={set('address2')} disabled={!isPM} /></Field>
                  <div className={styles.grid3}>
                    <Field label="City"><input value={form.city} onChange={set('city')} disabled={!isPM} /></Field>
                    <Field label="State"><input value={form.state} onChange={set('state')} maxLength={2} disabled={!isPM} /></Field>
                    <Field label="ZIP"><input value={form.zip} onChange={set('zip')} maxLength={10} disabled={!isPM} /></Field>
                  </div>
                </>
              )}

              {tab === 'schedule' && (
                <>
                  <Field label="Scheduled Date"><input type="date" value={form.date} onChange={set('date')} disabled={!isPM} /></Field>
                  <div className={styles.grid2}>
                    <Field label="Start Time"><input value={form.startTime} onChange={set('startTime')} placeholder="8:00am" disabled={!isPM} /></Field>
                    <Field label="End Time"><input value={form.endTime} onChange={set('endTime')} placeholder="5:00pm (optional)" disabled={!isPM} /></Field>
                  </div>
                  <Field label="Approx. Hours (used if no end time)">
                    <input type="number" min="0" step="0.5" value={form.approxHours} onChange={set('approxHours')} placeholder="8" disabled={!isPM} />
                  </Field>
                </>
              )}

              {tab === 'pay' && (
                <>
                  <Field label="Pay Type">
                    <select value={form.payType} onChange={set('payType')} disabled={!isPM}>
                      <option value="fixed">Fixed</option>
                      <option value="hourly">Hourly</option>
                    </select>
                  </Field>
                  {form.payType === 'hourly' ? (
                    <div className={styles.grid2}>
                      <Field label="Rate ($/hr)"><input type="number" min="0" step="0.01" value={form.payRate} onChange={set('payRate')} disabled={!isPM} /></Field>
                      <Field label="Max Units (hrs)"><input type="number" min="0" step="0.5" value={form.payMaxUnits} onChange={set('payMaxUnits')} disabled={!isPM} /></Field>
                    </div>
                  ) : (
                    <Field label="Amount ($)"><input type="number" min="0" step="0.01" value={form.payAmount} onChange={set('payAmount')} disabled={!isPM} /></Field>
                  )}
                </>
              )}

              {error && <p className={styles.error}>{error}</p>}
            </>
          )}
        </div>

        {isPM && (
          <div className={styles.modalFooter}>
            <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving || loadingDetail}>
              <Save size={13} />{saving ? 'Saving…' : 'Save'}
            </button>
            <button
              className={styles.pushBtn}
              onClick={handleSaveAndPush}
              disabled={saving || loadingDetail || isPublished}
              title={isPublished ? 'Already published — use Revert Publish to unpublish first' : undefined}
            >
              <Send size={13} />{saving ? 'Saving…' : 'Save and Push'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      {children}
    </div>
  )
}
