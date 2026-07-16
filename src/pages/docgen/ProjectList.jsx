import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { FolderOpen, Plus, Trash2, Loader2, FileText, Upload, AlertTriangle, ChevronLeft, Wrench } from 'lucide-react'
import { listProjects, createProject, deleteProject } from './api'
import { fmtDate, PRACTICE_AREAS } from './DocGen'
import styles from './DocGen.module.css'

export default function ProjectList() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setProjects(await listProjects())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(e, id) {
    e.stopPropagation()
    if (!confirm('Delete this project and all its uploads, responses, and documents?')) return
    try {
      await deleteProject(id)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  if (creating) {
    return <NewProjectForm
      onCancel={() => setCreating(false)}
      onCreated={p => navigate(`projects/${p.id}`)}
    />
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Doc Generator"
        subtitle="AI-generated deployment guides from BOMs, SOWs, and questionnaires"
        actions={
          <div className={styles.headerActions}>
            <button className={styles.btnSecondary} onClick={() => navigate('hardware')}>
              <Wrench size={14} />
              Hardware
            </button>
            <button className={styles.btnPrimary} onClick={() => setCreating(true)}>
              <Plus size={14} />
              New Project
            </button>
          </div>
        }
      />
      <div className={styles.body}>
        {error && <div className={styles.errorBanner}><AlertTriangle size={14} />{error}</div>}

        {loading ? (
          <div className={styles.loading}><Loader2 size={16} className={styles.spin} /><span>Loading projects…</span></div>
        ) : projects.length === 0 ? (
          <div className={styles.empty}>
            <FolderOpen size={40} className={styles.emptyIcon} />
            <p>No projects yet.</p>
            <p className={styles.emptyHint}>Create a project, upload source files (BOM/SOW), answer a short questionnaire, and generate a deployment guide.</p>
          </div>
        ) : (
          <div className={styles.projectGrid}>
            {projects.map(p => (
              <button key={p.id} className={styles.projectCard} onClick={() => navigate(`projects/${p.id}`)}>
                <span className={styles.projectName}>{p.name}</span>
                <span className={styles.projectMeta}>
                  <span className={styles.projectChip}>{p.practice_area}</span>
                  {p.customer && <span>{p.customer}</span>}
                  <span className={styles.dot}>&middot;</span>
                  {fmtDate(p.created_at)}
                </span>
                <span className={styles.projectFooter}>
                  <span className={styles.projectCounts}>
                    <span><FileText size={11} style={{ verticalAlign: '-1px' }} /> {p.document_count ?? 0} docs</span>
                    <span><Upload size={11} style={{ verticalAlign: '-1px' }} /> {p.upload_count ?? 0} files</span>
                  </span>
                  <span className={styles.btnIcon} role="button" title="Delete project"
                    onClick={e => handleDelete(e, p.id)}>
                    <Trash2 size={13} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NewProjectForm({ onCancel, onCreated }) {
  const [fields, setFields] = useState({ name: '', customer: '', practice_area: 'Network', site_address: '', pm_name: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setFields(prev => ({ ...prev, [k]: v }))

  async function handleCreate() {
    setError('')
    setSaving(true)
    try {
      onCreated(await createProject(fields))
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="New DocGen Project"
        subtitle="A project groups source files, questionnaire answers, and generated documents"
        actions={
          <button className={styles.btnSecondary} onClick={onCancel}><ChevronLeft size={14} />Back</button>
        }
      />
      <div className={styles.body}>
        {error && <div className={styles.errorBanner}><AlertTriangle size={14} />{error}</div>}
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Project / Engagement Name<span className={styles.required}> *</span></label>
            <input className={styles.input} value={fields.name} onChange={e => set('name', e.target.value)} autoFocus />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Customer / Client</label>
            <input className={styles.input} value={fields.customer} onChange={e => set('customer', e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Practice Area<span className={styles.required}> *</span></label>
            <select className={styles.select} value={fields.practice_area} onChange={e => set('practice_area', e.target.value)}>
              {PRACTICE_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Primary Site Address</label>
            <input className={styles.input} value={fields.site_address} onChange={e => set('site_address', e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>PM Name</label>
            <input className={styles.input} value={fields.pm_name} onChange={e => set('pm_name', e.target.value)} />
          </div>
          <div className={styles.formFooter}>
            <button className={styles.btnPrimary} onClick={handleCreate} disabled={saving || !fields.name.trim()}>
              <Plus size={14} />
              {saving ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
