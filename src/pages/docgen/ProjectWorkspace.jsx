import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Sparkles, Files, FileText, Loader2, ChevronLeft, AlertTriangle } from 'lucide-react'
import { getProject, listUploads, listDocuments } from './api'
import QuestionFlow from './QuestionFlow'
import FilesTab from './FilesTab'
import DocumentsTab from './DocumentsTab'
import styles from './DocGen.module.css'

export default function ProjectWorkspace() {
  const { projectId } = useParams()
  const navigate = useNavigate()

  const [project, setProject] = useState(null)
  const [uploads, setUploads] = useState([])
  const [documents, setDocuments] = useState([])
  const [tab, setTab] = useState('generate') // generate | files | documents
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refreshUploads = useCallback(async () => {
    try { setUploads(await listUploads(projectId)) } catch { /* non-blocking */ }
  }, [projectId])

  const refreshDocuments = useCallback(async () => {
    try { setDocuments(await listDocuments(projectId)) } catch { /* non-blocking */ }
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const p = await getProject(projectId)
        if (cancelled) return
        setProject(p)
        await Promise.all([refreshUploads(), refreshDocuments()])
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, refreshUploads, refreshDocuments])

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.body}>
          <div className={styles.loading}><Loader2 size={16} className={styles.spin} /><span>Loading project…</span></div>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className={styles.page}>
        <div className={styles.body}>
          <div className={styles.errorBanner}><AlertTriangle size={14} />{error || 'Project not found'}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={project.name}
        subtitle={[project.practice_area, project.customer].filter(Boolean).join(' · ')}
        actions={
          <button className={styles.btnSecondary} onClick={() => navigate('/doc-gen')}>
            <ChevronLeft size={14} />
            All Projects
          </button>
        }
      />

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'generate' ? styles.tabActive : ''}`}
          onClick={() => setTab('generate')}
        >
          <Sparkles size={13} /> Generate
        </button>
        <button
          className={`${styles.tab} ${tab === 'files' ? styles.tabActive : ''}`}
          onClick={() => setTab('files')}
        >
          <Files size={13} /> Source Files
          <span className={styles.tabCount}>{uploads.length}</span>
        </button>
        <button
          className={`${styles.tab} ${tab === 'documents' ? styles.tabActive : ''}`}
          onClick={() => { setTab('documents'); refreshDocuments() }}
        >
          <FileText size={13} /> Documents
          <span className={styles.tabCount}>{documents.length}</span>
        </button>
      </div>

      <div className={styles.body}>
        {tab === 'generate' && (
          <QuestionFlow project={project} uploads={uploads} />
        )}
        {tab === 'files' && (
          <FilesTab projectId={project.id} uploads={uploads} onChange={refreshUploads} />
        )}
        {tab === 'documents' && (
          <DocumentsTab project={project} documents={documents} onChange={refreshDocuments} />
        )}
      </div>
    </div>
  )
}
