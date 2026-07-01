import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import {
  FileText, Plus, Trash2, Edit2, Download, Save, CheckCircle,
  Loader2, Sparkles, AlertTriangle, ChevronLeft,
} from 'lucide-react'
import styles from './DocGen.module.css'

// ── Question definitions ──────────────────────────────────────────────────────

const QUESTIONS = [
  { id: 'project_name',         text: 'Project / Engagement Name',          type: 'text',   required: true },
  { id: 'customer',             text: 'Customer / Client',                   type: 'text',   required: true },
  { id: 'work_order_number',    text: 'Work Order Number(s)',                type: 'text'                  },
  { id: 'project_type',         text: 'Project Type',                        type: 'select',
    options: ['LV Installation','LV Lead','Delivery','Break/Fix','Site Survey','Installation Lead','Other'] },
  { id: 'site_address',         text: 'Site Address / Location',             type: 'text'                  },
  { id: 'scheduled_date',       text: 'Scheduled Date(s)',                   type: 'text'                  },
  { id: 'technician_count',     text: 'Number of Technicians',               type: 'number'                },
  { id: 'scope_of_work',        text: 'Scope of Work Summary',               type: 'text'                  },
  { id: 'equipment',            text: 'Equipment / Materials Required',      type: 'text'                  },
  { id: 'special_requirements', text: 'Special Requirements / Safety Notes', type: 'text'                  },
  { id: 'escalation_contacts',  text: 'Escalation Contacts',                 type: 'text'                  },
  { id: 'estimated_duration',   text: 'Estimated Duration',                  type: 'text'                  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  } catch { return ts }
}

function statusColor(status) {
  return { generating: 'var(--amber)', draft: 'var(--text-muted)', in_review: 'var(--blue)', approved: 'var(--green)' }[status] ?? 'var(--text-muted)'
}

function parseSchema(raw) {
  return {
    title: raw?.title ?? 'Untitled',
    sections: (raw?.sections ?? []).map(s => ({
      heading: s.heading ?? '',
      content: s.content ?? '',
      subsections: (s.subsections ?? []).map(sub => ({
        heading: sub.heading ?? '',
        content: sub.content ?? '',
      })),
    })),
  }
}

// ── Generating overlay ────────────────────────────────────────────────────────

function GeneratingOverlay({ elapsed, progress }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.overlayCard}>
        <Loader2 size={28} className={styles.spin} />
        <p className={styles.overlayTitle}>Generating Document</p>
        <p className={styles.overlayMsg}>{progress}</p>
        <div className={styles.overlayTrack}>
          <div className={styles.overlayBar} style={{ width: `${Math.min(8 + elapsed * 0.6, 92)}%` }} />
        </div>
        <p className={styles.overlayElapsed}>{elapsed}s elapsed</p>
      </div>
    </div>
  )
}

// ── List view ─────────────────────────────────────────────────────────────────

function ListView({ docs, loading, onNew, onEdit, onDelete }) {
  return (
    <div className={styles.page}>
      <PageHeader
        title="Doc Generator"
        subtitle="AI-generated deployment guides and field documentation"
        actions={
          <button className={styles.btnPrimary} onClick={onNew}>
            <Plus size={14} />
            New Document
          </button>
        }
      />
      <div className={styles.body}>
        {loading ? (
          <div className={styles.loading}>
            <Loader2 size={16} className={styles.spin} />
            <span>Loading documents…</span>
          </div>
        ) : docs.length === 0 ? (
          <div className={styles.empty}>
            <FileText size={40} className={styles.emptyIcon} />
            <p>No documents yet.</p>
            <p className={styles.emptyHint}>Click "New Document" to generate your first deployment guide.</p>
          </div>
        ) : (
          <div className={styles.docList}>
            {docs.map(doc => (
              <div key={doc.id} className={styles.docCard}>
                <FileText size={18} className={styles.docIcon} />
                <div className={styles.docInfo}>
                  <p className={styles.docTitle}>{doc.title ?? 'Untitled'}</p>
                  <p className={styles.docMeta}>
                    <span style={{ color: statusColor(doc.status) }}>{doc.status}</span>
                    <span className={styles.dot}>&middot;</span>
                    {doc.doc_type}
                    <span className={styles.dot}>&middot;</span>
                    {fmtDate(doc.created_at)}
                    {doc.generation_time_seconds != null && (
                      <><span className={styles.dot}>&middot;</span>{Math.round(doc.generation_time_seconds)}s gen</>
                    )}
                  </p>
                </div>
                <div className={styles.docActions}>
                  <button className={styles.btnIcon} onClick={() => onEdit(doc)} title="Edit">
                    <Edit2 size={13} />
                  </button>
                  <button className={styles.btnIcon} onClick={() => onDelete(doc.id)} title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Generate view ─────────────────────────────────────────────────────────────

function GenerateView({ onBack, onDone }) {
  const [answers, setAnswers] = useState({})
  const [generating, setGenerating] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [progress, setProgress] = useState('Calling AI…')
  const [error, setError] = useState('')
  const timerRef = useRef(null)

  function setAnswer(id, value) {
    setAnswers(prev => ({ ...prev, [id]: value }))
  }

  async function handleGenerate() {
    setError('')
    setGenerating(true)
    setElapsed(0)
    setProgress('Calling AI…')

    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const t0 = Date.now()

      const res = await fetch('/api/docgen/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ answers, doc_type: 'Deployment Guide' }),
      })

      clearInterval(timerRef.current)

      const body = await res.json()
      if (!res.ok) throw new Error(body.message ?? `Error ${res.status}`)

      const { schema_data } = body
      const title = schema_data?.title ?? answers.project_name ?? 'Deployment Guide'
      const genSecs = (Date.now() - t0) / 1000

      setProgress('Saving to database…')

      const { data: saved, error: dbErr } = await supabase
        .from('documents')
        .insert({
          title,
          doc_type: 'Deployment Guide',
          schema_data,
          status: 'draft',
          generation_time_seconds: genSecs,
          context: answers,
        })
        .select()
        .single()

      if (dbErr) throw new Error(dbErr.message)

      onDone(saved)
    } catch (err) {
      clearInterval(timerRef.current)
      setError(err.message ?? 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className={styles.page}>
      {generating && <GeneratingOverlay elapsed={elapsed} progress={progress} />}
      <PageHeader
        title="Generate Deployment Guide"
        subtitle="Answer the questions below — AI will build a customized document"
        actions={
          <button className={styles.btnSecondary} onClick={onBack}>
            <ChevronLeft size={14} />
            Back
          </button>
        }
      />
      <div className={styles.body}>
        {error && (
          <div className={styles.errorBanner}>
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        <div className={styles.form}>
          {QUESTIONS.map(q => (
            <div key={q.id} className={styles.field}>
              <label className={styles.label}>
                {q.text}
                {q.required && <span className={styles.required}> *</span>}
              </label>
              {q.type === 'text' && (
                <input
                  className={styles.input}
                  type="text"
                  value={answers[q.id] ?? ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                />
              )}
              {q.type === 'number' && (
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  value={answers[q.id] ?? ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                />
              )}
              {q.type === 'select' && (
                <select
                  className={styles.select}
                  value={answers[q.id] ?? ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                >
                  <option value="">Select…</option>
                  {q.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
            </div>
          ))}

          <div className={styles.formFooter}>
            <button
              className={styles.btnPrimary}
              onClick={handleGenerate}
              disabled={generating || !answers.project_name?.trim()}
            >
              <Sparkles size={14} />
              {generating ? 'Generating…' : 'Generate Deployment Guide'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Edit view ─────────────────────────────────────────────────────────────────

function EditView({ doc, onBack, onRefresh }) {
  const [schema, setSchema] = useState(() => parseSchema(doc.schema_data))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportErr, setExportErr] = useState('')

  const updateTitle      = v => setSchema(p => ({ ...p, title: v }))
  const updateSecHeading = (i, v) => setSchema(p => ({ ...p, sections: p.sections.map((s, j) => j === i ? { ...s, heading: v } : s) }))
  const updateSecContent = (i, v) => setSchema(p => ({ ...p, sections: p.sections.map((s, j) => j === i ? { ...s, content: v } : s) }))
  const updateSubHeading = (i, k, v) => setSchema(p => ({ ...p, sections: p.sections.map((s, j) => j === i ? { ...s, subsections: s.subsections.map((sub, l) => l === k ? { ...sub, heading: v } : sub) } : s) }))
  const updateSubContent = (i, k, v) => setSchema(p => ({ ...p, sections: p.sections.map((s, j) => j === i ? { ...s, subsections: s.subsections.map((sub, l) => l === k ? { ...sub, content: v } : sub) } : s) }))

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    const { error } = await supabase
      .from('documents')
      .update({ schema_data: schema, title: schema.title })
      .eq('id', doc.id)
    setSaving(false)
    if (!error) {
      onRefresh()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  async function handleExport() {
    setExporting(true)
    setExportErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/docgen/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ schema_data: schema, title: schema.title }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.message ?? `Error ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(schema.title ?? 'document').replace(/[^a-z0-9_\- ]/gi, '_').trim().slice(0, 60)}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportErr(err.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={schema.title || 'Document Editor'}
        subtitle={`${doc.doc_type} · ${doc.status}`}
        actions={
          <div className={styles.headerActions}>
            <button className={styles.btnSecondary} onClick={onBack}>
              <ChevronLeft size={14} />
              Back
            </button>
            {saved && (
              <span className={styles.savedChip}>
                <CheckCircle size={12} />
                Saved
              </span>
            )}
            <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
              <Save size={14} />
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className={styles.btnSecondary} onClick={handleExport} disabled={exporting}>
              <Download size={14} />
              {exporting ? 'Exporting…' : 'Export .docx'}
            </button>
          </div>
        }
      />
      <div className={styles.body}>
        {exportErr && (
          <div className={styles.errorBanner}>
            <AlertTriangle size={14} />
            {exportErr}
          </div>
        )}

        <div className={styles.editorCard}>
          <p className={styles.editorLabel}>Document Title</p>
          <input
            className={`${styles.input} ${styles.titleInput}`}
            value={schema.title}
            onChange={e => updateTitle(e.target.value)}
          />
        </div>

        {schema.sections.map((section, sIdx) => (
          <div key={sIdx} className={styles.editorCard}>
            <p className={styles.editorLabel}>Section {sIdx + 1}</p>
            <input
              className={`${styles.input} ${styles.sectionInput}`}
              value={section.heading}
              onChange={e => updateSecHeading(sIdx, e.target.value)}
              placeholder="Section heading"
            />
            <textarea
              className={styles.textarea}
              value={section.content}
              onChange={e => updateSecContent(sIdx, e.target.value)}
              rows={Math.max(4, (section.content.match(/\n/g)?.length ?? 0) + 2)}
            />
            {section.subsections.map((sub, subIdx) => (
              <div key={subIdx} className={styles.subsection}>
                <input
                  className={`${styles.input} ${styles.subInput}`}
                  value={sub.heading}
                  onChange={e => updateSubHeading(sIdx, subIdx, e.target.value)}
                  placeholder="Subsection heading"
                />
                <textarea
                  className={styles.textarea}
                  value={sub.content}
                  onChange={e => updateSubContent(sIdx, subIdx, e.target.value)}
                  rows={Math.max(3, (sub.content.match(/\n/g)?.length ?? 0) + 2)}
                />
              </div>
            ))}
          </div>
        ))}

        {schema.sections.length === 0 && (
          <div className={styles.empty}><p>No sections to edit.</p></div>
        )}

        {schema.sections.length > 0 && (
          <div className={styles.bottomBar}>
            <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
              <Save size={14} />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button className={styles.btnSecondary} onClick={handleExport} disabled={exporting}>
              <Download size={14} />
              {exporting ? 'Exporting…' : 'Export to Word'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DocGen() {
  const [view, setView] = useState('list') // 'list' | 'generate' | 'edit'
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingDoc, setEditingDoc] = useState(null)

  const loadDocs = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('documents')
      .select('id, title, doc_type, status, generation_time_seconds, created_at, updated_at')
      .order('created_at', { ascending: false })
    setDocs(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadDocs() }, [loadDocs])

  async function handleDelete(id) {
    if (!confirm('Delete this document? This cannot be undone.')) return
    await supabase.from('documents').delete().eq('id', id)
    loadDocs()
  }

  async function handleEdit(docStub) {
    const { data } = await supabase.from('documents').select('*').eq('id', docStub.id).single()
    if (data) { setEditingDoc(data); setView('edit') }
  }

  if (view === 'generate') {
    return (
      <GenerateView
        onBack={() => setView('list')}
        onDone={doc => { loadDocs(); setEditingDoc(doc); setView('edit') }}
      />
    )
  }

  if (view === 'edit' && editingDoc) {
    return (
      <EditView
        doc={editingDoc}
        onBack={() => setView('list')}
        onRefresh={loadDocs}
      />
    )
  }

  return (
    <ListView
      docs={docs}
      loading={loading}
      onNew={() => setView('generate')}
      onEdit={handleEdit}
      onDelete={handleDelete}
    />
  )
}
