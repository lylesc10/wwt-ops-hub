import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import {
  Sparkles, CheckCircle, Download, Save, ChevronLeft, Loader2, AlertTriangle,
} from 'lucide-react'
import { getDocument, updateDocument, downloadDocument } from './api'
import { statusColor } from './DocGen'
import styles from './DocGen.module.css'

const AI_SPLIT_RE = /(\[AI-GENERATED\][\s\S]*?\[\/AI-GENERATED\])/

function parseSchemaData(raw) {
  return {
    title: typeof raw?.title === 'string' ? raw.title : 'Untitled Document',
    error: typeof raw?.error === 'string' ? raw.error : null,
    sections: Array.isArray(raw?.sections)
      ? raw.sections.map(s => ({
          heading: typeof s.heading === 'string' ? s.heading : '',
          content: typeof s.content === 'string' ? s.content : '',
          procedure_steps: s.procedure_steps,
          subsections: Array.isArray(s.subsections)
            ? s.subsections.map(sub => ({
                heading: typeof sub.heading === 'string' ? sub.heading : '',
                content: typeof sub.content === 'string' ? sub.content : '',
                procedure_steps: sub.procedure_steps,
              }))
            : [],
        }))
      : [],
  }
}

function schemaToRecord(schema) {
  return {
    title: schema.title,
    sections: schema.sections.map(s => ({
      heading: s.heading,
      content: s.content,
      ...(s.procedure_steps ? { procedure_steps: s.procedure_steps } : {}),
      subsections: s.subsections.map(sub => ({
        heading: sub.heading,
        content: sub.content,
        ...(sub.procedure_steps ? { procedure_steps: sub.procedure_steps } : {}),
      })),
    })),
  }
}

/**
 * Content editor that renders [AI-GENERATED]...[/AI-GENERATED] spans as
 * highlighted, separately-editable blocks — ported from field-services
 * DocumentEditor.tsx.
 */
function ContentEditor({ content, onChange, rows }) {
  if (!content.includes('[AI-GENERATED]')) {
    return (
      <textarea
        className={styles.textarea}
        value={content}
        onChange={e => onChange(e.target.value)}
        rows={rows ?? Math.max(3, content.split('\n').length + 1)}
      />
    )
  }

  const parts = content.split(AI_SPLIT_RE)

  function updatePart(partIdx, newValue, isAi) {
    const next = parts.map((p, i) => {
      if (i !== partIdx) return p
      return isAi ? `[AI-GENERATED]${newValue}[/AI-GENERATED]` : newValue
    })
    onChange(next.join(''))
  }

  return (
    <div>
      {parts.map((part, idx) => {
        if (part.startsWith('[AI-GENERATED]')) {
          const inner = part.replace('[AI-GENERATED]', '').replace('[/AI-GENERATED]', '')
          return (
            <div key={idx} className={styles.aiBlock}>
              <span className={styles.aiBadge}><Sparkles size={9} /> AI Generated — review carefully</span>
              <textarea
                className={`${styles.textarea} ${styles.aiTextarea}`}
                value={inner}
                onChange={e => updatePart(idx, e.target.value, true)}
                rows={Math.max(2, inner.split('\n').length)}
              />
            </div>
          )
        }
        if (!part) return null
        return (
          <textarea
            key={idx}
            className={styles.textarea}
            value={part}
            onChange={e => updatePart(idx, e.target.value, false)}
            rows={Math.max(2, part.split('\n').length)}
          />
        )
      })}
    </div>
  )
}

export default function DocumentEditor() {
  const { projectId, docId } = useParams()
  const navigate = useNavigate()

  const [doc, setDoc] = useState(null)
  const [schema, setSchema] = useState({ title: '', error: null, sections: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getDocument(docId)
      .then(d => {
        if (cancelled) return
        setDoc(d)
        setSchema(parseSchemaData(d.schema_data ?? {}))
      })
      .catch(e => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [docId])

  const updateTitle = v => setSchema(p => ({ ...p, title: v }))
  const updateSection = (i, patch) =>
    setSchema(p => ({ ...p, sections: p.sections.map((s, j) => j === i ? { ...s, ...patch } : s) }))
  const updateSubsection = (i, k, patch) =>
    setSchema(p => ({
      ...p,
      sections: p.sections.map((s, j) => j === i
        ? { ...s, subsections: s.subsections.map((sub, l) => l === k ? { ...sub, ...patch } : sub) }
        : s),
    }))

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const updated = await updateDocument(docId, schemaToRecord(schema))
      setDoc(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    setError('')
    try {
      // Persist current edits first so the server renders what's on screen
      await updateDocument(docId, schemaToRecord(schema))
      await downloadDocument(docId, `${(doc?.doc_type ?? 'Document').replace(/ /g, '_')}_${docId}.docx`)
    } catch (e) {
      setError(e.message)
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.body}>
          <div className={styles.loading}><Loader2 size={16} className={styles.spin} /><span>Loading document…</span></div>
        </div>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className={styles.page}>
        <div className={styles.body}>
          <div className={styles.errorBanner}><AlertTriangle size={14} />{error || 'Document not found.'}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={schema.title || 'Document Editor'}
        subtitle={`${doc.doc_type} · ${doc.status}`}
        actions={
          <div className={styles.headerActions}>
            <button className={styles.btnSecondary} onClick={() => navigate(`/doc-gen/projects/${projectId}`)}>
              <ChevronLeft size={14} />
              Back
            </button>
            {saved && <span className={styles.savedChip}><CheckCircle size={12} />Saved</span>}
            <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
              <Save size={14} />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button className={styles.btnSecondary} onClick={handleExport} disabled={exporting}>
              <Download size={14} />
              {exporting ? 'Exporting…' : 'Export to Word'}
            </button>
          </div>
        }
      />
      <div className={styles.body}>
        {error && <div className={styles.errorBanner}><AlertTriangle size={14} />{error}</div>}

        {schema.error && (
          <div className={styles.errorBanner}>
            <AlertTriangle size={14} />
            Generation failed: {schema.error} — regenerate from the project&apos;s Generate tab.
          </div>
        )}

        <div className={styles.editorCard}>
          <p className={styles.editorLabel}>Document Title</p>
          <input
            className={`${styles.input} ${styles.titleInput}`}
            value={schema.title}
            onChange={e => updateTitle(e.target.value)}
          />
          <p className={styles.docMeta}>
            <span style={{ color: statusColor(doc.status) }}>{doc.status}</span>
            {doc.generation_time_seconds != null && (
              <><span className={styles.dot}>&middot;</span>generated in {Math.round(doc.generation_time_seconds)}s</>
            )}
          </p>
        </div>

        {schema.sections.length === 0 && !schema.error && (
          <div className={styles.empty}><p>No sections to edit. Generate content first.</p></div>
        )}

        {schema.sections.map((section, sIdx) => (
          <div key={sIdx} className={styles.editorCard}>
            <p className={styles.editorLabel}>Section {sIdx + 1}</p>
            <input
              className={`${styles.input} ${styles.sectionInput}`}
              value={section.heading}
              onChange={e => updateSection(sIdx, { heading: e.target.value })}
              placeholder="Section heading"
            />
            {section.content !== '' || section.subsections.length === 0 ? (
              <ContentEditor
                content={section.content}
                onChange={v => updateSection(sIdx, { content: v })}
              />
            ) : null}

            {section.subsections.map((sub, subIdx) => (
              <div key={subIdx} className={styles.subsection}>
                <input
                  className={`${styles.input} ${styles.subInput}`}
                  value={sub.heading}
                  onChange={e => updateSubsection(sIdx, subIdx, { heading: e.target.value })}
                  placeholder="Subsection heading"
                />
                <ContentEditor
                  content={sub.content}
                  onChange={v => updateSubsection(sIdx, subIdx, { content: v })}
                />
              </div>
            ))}
          </div>
        ))}

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
