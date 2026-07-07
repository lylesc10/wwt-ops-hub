import { useState } from 'react'
import { Check } from 'lucide-react'
import { useTechnicians } from '@/hooks/useTechnicians'
import styles from './Sidebar.module.css'

const COLOR_PRESETS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899']

export default function TeamForm({ existingTeam, onSave, onCancel }) {
  const { technicians, loading } = useTechnicians()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(existingTeam?.name ?? '')
  const [color, setColor] = useState(existingTeam?.color ?? COLOR_PRESETS[0])
  const [memberIds, setMemberIds] = useState(
    existingTeam?.members.map((m) => m.technician_id) ?? [],
  )

  function toggleMember(techId) {
    setMemberIds((prev) =>
      prev.includes(techId) ? prev.filter((id) => id !== techId) : [...prev, techId])
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), color, member_ids: [...memberIds] })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`${styles.card} ${styles.cardPad} ${styles.cardHighlight}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className={styles.formTitle}>{existingTeam ? 'Edit Team' : 'New Team'}</p>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Team Name</label>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Team Alpha"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Color</label>
          <div className={styles.colorRow}>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className={`${styles.colorSwatch} ${color === c ? styles.colorSelected : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              >
                {color === c && <Check size={13} />}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Members</label>
          {loading ? (
            <p className={styles.sectionEmpty}>Loading technicians…</p>
          ) : technicians.length === 0 ? (
            <p className={styles.sectionEmpty}>No technicians in the Tech Pool.</p>
          ) : (
            <div className={styles.memberPicker}>
              {technicians.map((tech) => (
                <label key={tech.id} className={styles.memberOption}>
                  <input
                    type="checkbox"
                    checked={memberIds.includes(tech.id)}
                    onChange={() => toggleMember(tech.id)}
                  />
                  <span>{tech.full_name}</span>
                  {(tech.city || tech.region) && (
                    <span className={styles.memberOptionMeta}>{tech.city || tech.region}</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className={styles.formActions}>
          <button
            type="button"
            className={`${styles.smallBtn} ${styles.smallPrimary}`}
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? 'Saving…' : existingTeam ? 'Update' : 'Create'}
          </button>
          <button type="button" className={styles.smallBtn} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
