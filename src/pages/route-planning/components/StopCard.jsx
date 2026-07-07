import { useState } from 'react'
import { ChevronUp, ChevronDown, X, Clock, Route, MapPin, Pencil } from 'lucide-react'
import styles from './Sidebar.module.css'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function StopCard({ stop, isFirst, isLast, onUpdate, onDelete, onMoveUp, onMoveDown }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    scheduled_start: stop.scheduled_start ?? '',
    scheduled_end: stop.scheduled_end ?? '',
    estimated_hours: stop.estimated_hours?.toString() ?? '',
    notes: stop.notes ?? '',
  })

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  async function handleSave() {
    setSaving(true)
    try {
      await onUpdate(stop.id, {
        scheduled_start: form.scheduled_start || null,
        scheduled_end: form.scheduled_end || null,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        notes: form.notes || null,
      })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.stopCard}>
      <div className={styles.stopTop}>
        <div className={styles.siteBody}>
          <div className={styles.siteRow}>
            <MapPin size={13} className={styles.siteIcon} />
            <span className={styles.siteName}>{stop.site_name ?? 'Unknown site'}</span>
          </div>
          {(stop.site_city || stop.site_state) && (
            <p className={styles.siteMeta} style={{ marginLeft: 18 }}>
              {[stop.site_city, stop.site_state].filter(Boolean).join(', ')}
            </p>
          )}
          <div className={styles.stopBadges}>
            {stop.scheduled_start && stop.scheduled_end && (
              <span className={styles.badge}>
                {formatDate(stop.scheduled_start)} - {formatDate(stop.scheduled_end)}
              </span>
            )}
            {stop.estimated_hours != null && (
              <span className={`${styles.badge} ${styles.badgeAccent}`}>
                <Clock size={9} />{stop.estimated_hours}h
              </span>
            )}
            {stop.travel_hours_from_prev != null && (
              <span className={styles.badge}>
                <Route size={9} />{stop.travel_hours_from_prev}h travel
              </span>
            )}
          </div>
        </div>

        <div className={styles.stopControls}>
          <button type="button" className={styles.iconBtn} disabled={isFirst} onClick={() => onMoveUp(stop.id)} title="Move up">
            <ChevronUp size={13} />
          </button>
          <button type="button" className={styles.iconBtn} disabled={isLast} onClick={() => onMoveDown(stop.id)} title="Move down">
            <ChevronDown size={13} />
          </button>
          <button type="button" className={styles.iconBtn} onClick={() => setEditing((p) => !p)} title="Edit stop">
            <Pencil size={12} />
          </button>
          <button type="button" className={`${styles.iconBtn} ${styles.iconDanger}`} onClick={() => onDelete(stop.id)} title="Remove stop">
            <X size={13} />
          </button>
        </div>
      </div>

      {editing && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className={styles.formRow2}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Start Date</label>
              <input type="date" className={styles.input} value={form.scheduled_start}
                onChange={(e) => updateField('scheduled_start', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>End Date</label>
              <input type="date" className={styles.input} value={form.scheduled_end}
                onChange={(e) => updateField('scheduled_end', e.target.value)} />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Estimated Hours</label>
            <input type="number" min="0" step="0.5" className={styles.input} value={form.estimated_hours}
              onChange={(e) => updateField('estimated_hours', e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Notes</label>
            <textarea rows={2} className={styles.textarea} value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)} />
          </div>
          <div className={styles.formActions}>
            <button type="button" className={`${styles.smallBtn} ${styles.smallPrimary}`} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className={styles.smallBtn} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
