import { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'
import { dab } from '@/lib/dab'
import { useAuth } from '@/hooks/useAuth'
import { SiteWorkOrdersPanel } from './SiteWorkOrdersPanel'
import styles from './SiteEditModal.module.css'

const STATUS_OPTIONS = [
  'scheduled', 'staffed', 'in_progress', 'completed',
  'cancelled', 'flagged_payment', 'flagged_date_change'
]

export function SiteEditModal({ site, onClose, onSaved }) {
  const { isPM } = useAuth()
  const [form, setForm] = useState({
    branch_name:      site.branch_name      ?? '',
    address:          site.address          ?? '',
    city:             site.city             ?? '',
    state:            site.state            ?? '',
    zip:              site.zip              ?? '',
    status:           site.status           ?? 'scheduled',
    fst_owner:        site.fst_owner        ?? '',
    onsite_tech:      site.onsite_tech      ?? '',
    onsite_email:     site.onsite_email     ?? '',
    onsite_phone:     site.onsite_phone     ?? '',
    scheduled_start:  site.scheduled_start  ?? '',
    scheduled_end:    site.scheduled_end    ?? '',
    due_date_assign:  site.due_date_assign  ?? '',
    target_quarter:   site.target_quarter   ?? '',
    lvv_in_scope:     site.lvv_in_scope     ?? '',
    time_zone:        site.time_zone        ?? '',
    notes:            site.notes            ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('details')

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSave = async () => {
    if (!isPM) return
    setSaving(true)
    setError(null)
    const { error } = await dab
      .from('sites')
      .update({ ...form, updated_at: new Date().toISOString() })
      .eq('id', site.id)
    if (error) { setError(error.message); setSaving(false) }
    else { onSaved?.(); onClose() }
  }

  const TABS = ['details', 'staffing', 'scheduling', 'meta']

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <span className={`mono ${styles.code}`}>{site.code}</span>
            <h2 className={styles.modalTitle}>{site.branch_name}</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        {/* Tab bar */}
        <div className={styles.tabBar}>
          {TABS.map(t => (
            <button key={t} className={`${styles.tabBtn} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className={styles.modalBody}>

          {/* ── Details ── */}
          {tab === 'details' && (
            <>
              <div className={styles.grid2}>
                <Field label="Branch Name"><input value={form.branch_name} onChange={set('branch_name')} disabled={!isPM} /></Field>
                <Field label="Status">
                  <select value={form.status} onChange={set('status')} disabled={!isPM}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Address"><input value={form.address} onChange={set('address')} disabled={!isPM} /></Field>
              <div className={styles.grid3}>
                <Field label="City"><input value={form.city} onChange={set('city')} disabled={!isPM} /></Field>
                <Field label="State"><input value={form.state} onChange={set('state')} maxLength={2} disabled={!isPM} /></Field>
                <Field label="ZIP"><input value={form.zip} onChange={set('zip')} maxLength={10} disabled={!isPM} /></Field>
              </div>
              <div className={styles.grid2}>
                <Field label="Time Zone"><input value={form.time_zone} onChange={set('time_zone')} placeholder="e.g. EST" disabled={!isPM} /></Field>
                <Field label="LVV In Scope"><input value={form.lvv_in_scope} onChange={set('lvv_in_scope')} placeholder="Yes / No" disabled={!isPM} /></Field>
              </div>
            </>
          )}

          {/* ── Staffing ── */}
          {tab === 'staffing' && (
            <>
              <div className={styles.infoBox}>
                <p className={styles.infoLabel}>FST Owner</p>
                <p className={styles.infoDesc}>Internal coordinator responsible for getting this site staffed. Not the field technician.</p>
              </div>
              <Field label="Primary FST (Staffing Coordinator)">
                <input value={form.fst_owner} onChange={set('fst_owner')} placeholder="Internal FST name" disabled={!isPM} />
              </Field>
              <Field label="Onsite Tech(s)">
                <input value={form.onsite_tech} onChange={set('onsite_tech')} placeholder="Tech names, comma separated" disabled={!isPM} />
              </Field>
              <Field label="Onsite Tech Email(s)">
                <input value={form.onsite_email} onChange={set('onsite_email')} placeholder="emails, comma separated" disabled={!isPM} />
              </Field>
              <Field label="Onsite Tech Phone(s)">
                <input value={form.onsite_phone} onChange={set('onsite_phone')} placeholder="phones, comma separated" disabled={!isPM} />
              </Field>
              <Field label="Due Date to Assign Tech">
                <input type="date" value={form.due_date_assign} onChange={set('due_date_assign')} disabled={!isPM} />
              </Field>
            </>
          )}

          {/* ── Scheduling ── */}
          {tab === 'scheduling' && (
            <>
              <div className={styles.grid2}>
                <Field label="Scheduled Start">
                  <input type="date" value={form.scheduled_start} onChange={set('scheduled_start')} disabled={!isPM} />
                </Field>
                <Field label="Scheduled End">
                  <input type="date" value={form.scheduled_end} onChange={set('scheduled_end')} disabled={!isPM} />
                </Field>
              </div>
              <div className={styles.grid2}>
                <Field label="Target Quarter">
                  <select value={form.target_quarter} onChange={set('target_quarter')} disabled={!isPM}>
                    <option value="">—</option>
                    <option value="Q1">Q1</option>
                    <option value="Q2">Q2</option>
                    <option value="Q3">Q3</option>
                    <option value="Q4">Q4</option>
                  </select>
                </Field>
              </div>
              <Field label="Notes">
                <textarea value={form.notes} onChange={set('notes')} rows={3} disabled={!isPM} />
              </Field>
            </>
          )}

          {/* ── Meta ── */}
          {/* ── Work Orders ── */}
          {tab === 'work_orders' && (
            <SiteWorkOrdersPanel site={site} />
          )}

          {tab === 'meta' && (
            <div className={styles.meta}>
              <MetaRow label="Site Code"        value={site.code} mono />
              <MetaRow label="FN Work Order ID" value={site.fn_wo_id} mono />
              <MetaRow label="Smartsheet Row"   value={site.smartsheet_row_id} mono />
              <MetaRow label="Last SS Sync"     value={site.smartsheet_modified ? new Date(site.smartsheet_modified).toLocaleString() : null} />
              <MetaRow label="Created"          value={new Date(site.created_at).toLocaleString()} />
              <MetaRow label="Last Updated"     value={new Date(site.updated_at).toLocaleString()} />
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}
        </div>

        {/* Footer */}
        {isPM && tab !== 'meta' && (
          <div className={styles.modalFooter}>
            <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
              <Save size={13} />{saving ? 'Saving…' : 'Save Changes'}
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

function MetaRow({ label, value, mono }) {
  return (
    <div className={styles.metaRow}>
      <span className={styles.metaLabel}>{label}</span>
      <span className={`${styles.metaVal} ${mono ? 'mono' : ''}`}>{value ?? '—'}</span>
    </div>
  )
}
