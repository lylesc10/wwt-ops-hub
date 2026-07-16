import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import {
  Wrench, Plus, Trash2, Loader2, AlertTriangle, ChevronLeft,
  ArrowUp, ArrowDown, Search, Save,
} from 'lucide-react'
import { listHardware, createHardware, updateHardware, deleteHardware } from './api'
import { fmtDate } from './DocGen'
import styles from './DocGen.module.css'

const emptyStep = () => ({ text: '', warning: false, photo_required: false })
const emptyEntry = { part_number: '', description: '', notes: '', steps: [] }

export default function HardwarePage() {
  const navigate = useNavigate()
  const [hardware, setHardware] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null) // null = nothing, 'new' = create form

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setHardware(await listHardware())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return hardware
    return hardware.filter(h =>
      h.description?.toLowerCase().includes(q) || h.part_number?.toLowerCase().includes(q))
  }, [hardware, search])

  const selected = selectedId === 'new'
    ? emptyEntry
    : hardware.find(h => h.id === selectedId)

  async function handleDelete(e, id) {
    e.stopPropagation()
    if (!confirm('Delete this hardware entry and its install instructions?')) return
    try {
      await deleteHardware(id)
      if (selectedId === id) setSelectedId(null)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Hardware Repository"
        subtitle="Auto-populated from BOM uploads — attach install instructions to hardware that needs them"
        actions={
          <div className={styles.headerActions}>
            <button className={styles.btnSecondary} onClick={() => navigate('/doc-gen')}>
              <ChevronLeft size={14} />Back
            </button>
            <button className={styles.btnPrimary} onClick={() => setSelectedId('new')}>
              <Plus size={14} />Add Hardware
            </button>
          </div>
        }
      />
      <div className={styles.body}>
        {error && <div className={styles.errorBanner}><AlertTriangle size={14} />{error}</div>}

        {selected ? (
          <HardwareEditor
            key={selectedId}
            entry={selected}
            onCancel={() => setSelectedId(null)}
            onSaved={() => { setSelectedId(null); load() }}
            onError={setError}
          />
        ) : loading ? (
          <div className={styles.loading}><Loader2 size={16} className={styles.spin} /><span>Loading hardware…</span></div>
        ) : hardware.length === 0 ? (
          <div className={styles.empty}>
            <Wrench size={40} className={styles.emptyIcon} />
            <p>No hardware yet.</p>
            <p className={styles.emptyHint}>Upload a BOM to a DocGen project and its line items will appear here, or add hardware manually.</p>
          </div>
        ) : (
          <>
            <div className={styles.searchRow}>
              <Search size={14} />
              <input
                className={styles.input}
                placeholder="Search by description or part number…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className={styles.docList}>
              {filtered.map(h => {
                const stepCount = Array.isArray(h.steps) ? h.steps.length : 0
                return (
                  <button key={h.id} className={styles.hwRow} onClick={() => setSelectedId(h.id)}>
                    <span className={styles.fileType}>{h.part_number ?? 'no pn'}</span>
                    <span className={styles.fileName}>{h.description}</span>
                    {stepCount > 0
                      ? <span className={styles.fileParsed}>{stepCount} step{stepCount === 1 ? '' : 's'}</span>
                      : <span className={styles.fileParseFail}>no instructions</span>}
                    <span className={styles.hwMeta}>
                      {h.source} &middot; seen {h.seen_count}× &middot; {fmtDate(h.last_seen_at)}
                    </span>
                    <span className={styles.btnIcon} role="button" title="Delete hardware"
                      onClick={e => handleDelete(e, h.id)}>
                      <Trash2 size={13} />
                    </span>
                  </button>
                )
              })}
              {filtered.length === 0 && <p className={styles.emptyHint}>No hardware matches “{search}”.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function HardwareEditor({ entry, onCancel, onSaved, onError }) {
  const isNew = !entry.id
  const [fields, setFields] = useState({
    part_number: entry.part_number ?? '',
    description: entry.description ?? '',
    notes: entry.notes ?? '',
    steps: (Array.isArray(entry.steps) ? entry.steps : []).map(s => ({ ...emptyStep(), ...s })),
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setFields(prev => ({ ...prev, [k]: v }))
  const setStep = (i, k, v) => setFields(prev => ({
    ...prev,
    steps: prev.steps.map((s, idx) => idx === i ? { ...s, [k]: v } : s),
  }))
  const moveStep = (i, dir) => setFields(prev => {
    const steps = [...prev.steps]
    const j = i + dir
    if (j < 0 || j >= steps.length) return prev
    ;[steps[i], steps[j]] = [steps[j], steps[i]]
    return { ...prev, steps }
  })
  const removeStep = (i) => setFields(prev => ({
    ...prev,
    steps: prev.steps.filter((_, idx) => idx !== i),
  }))

  async function handleSave() {
    onError('')
    setSaving(true)
    try {
      const payload = {
        part_number: fields.part_number.trim() || null,
        description: fields.description.trim(),
        notes: fields.notes.trim() || null,
        steps: fields.steps.filter(s => s.text.trim()),
      }
      if (isNew) await createHardware(payload)
      else await updateHardware(entry.id, payload)
      onSaved()
    } catch (e) {
      onError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label}>Description<span className={styles.required}> *</span></label>
        <input className={styles.input} value={fields.description} autoFocus={isNew}
          onChange={e => set('description', e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Part Number</label>
        <input className={styles.input} value={fields.part_number}
          placeholder="e.g. C9300-48P — normalized automatically"
          onChange={e => set('part_number', e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Notes</label>
        <textarea className={styles.textarea} rows={2} value={fields.notes}
          placeholder="Internal notes — not included in generated documents"
          onChange={e => set('notes', e.target.value)} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Install Instructions</label>
        <p className={styles.emptyHint}>
          Steps are injected verbatim into generated documents as a checklist wherever this hardware appears in a project&apos;s BOM.
        </p>
        {fields.steps.map((step, i) => (
          <div key={i} className={styles.stepRow}>
            <span className={styles.stepNum}>{i + 1}.</span>
            <input className={styles.input} value={step.text}
              placeholder="Step instruction…"
              onChange={e => setStep(i, 'text', e.target.value)} />
            <label className={styles.stepFlag} title="Render as ⚠️ CRITICAL in the document">
              <input type="checkbox" checked={step.warning}
                onChange={e => setStep(i, 'warning', e.target.checked)} />
              ⚠️
            </label>
            <label className={styles.stepFlag} title="Technician must attach a photo after this step">
              <input type="checkbox" checked={step.photo_required}
                onChange={e => setStep(i, 'photo_required', e.target.checked)} />
              📷
            </label>
            <button className={styles.btnIcon} title="Move up" disabled={i === 0}
              onClick={() => moveStep(i, -1)}><ArrowUp size={13} /></button>
            <button className={styles.btnIcon} title="Move down" disabled={i === fields.steps.length - 1}
              onClick={() => moveStep(i, 1)}><ArrowDown size={13} /></button>
            <button className={styles.btnIcon} title="Remove step"
              onClick={() => removeStep(i)}><Trash2 size={13} /></button>
          </div>
        ))}
        <button className={styles.btnSecondary} style={{ alignSelf: 'flex-start' }}
          onClick={() => set('steps', [...fields.steps, emptyStep()])}>
          <Plus size={13} />Add step
        </button>
      </div>

      <div className={styles.formFooter} style={{ display: 'flex', gap: 8 }}>
        <button className={styles.btnPrimary} onClick={handleSave}
          disabled={saving || !fields.description.trim()}>
          <Save size={14} />
          {saving ? 'Saving…' : isNew ? 'Create Hardware' : 'Save Changes'}
        </button>
        <button className={styles.btnSecondary} onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  )
}
