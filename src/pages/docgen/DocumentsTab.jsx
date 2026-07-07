import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Edit2, Download, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { deleteDocument, downloadDocument } from './api'
import { fmtDate, statusColor } from './DocGen'
import styles from './DocGen.module.css'

export default function DocumentsTab({ project, documents, onChange }) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [downloadingId, setDownloadingId] = useState(null)

  // Poll while any document is generating so status/progress stays live
  const anyGenerating = documents.some(d => d.status === 'generating')
  useEffect(() => {
    if (!anyGenerating) return
    const interval = setInterval(onChange, 3000)
    return () => clearInterval(interval)
  }, [anyGenerating, onChange])

  async function handleDelete(id) {
    if (!confirm('Delete this document? This cannot be undone.')) return
    try {
      await deleteDocument(id)
      onChange()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDownload(doc) {
    setError('')
    setDownloadingId(doc.id)
    try {
      await downloadDocument(doc.id, `${(doc.doc_type ?? 'Document').replace(/ /g, '_')}_${doc.id}.docx`)
    } catch (e) {
      setError(e.message)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <>
      {error && <div className={styles.errorBanner}><AlertTriangle size={14} />{error}</div>}

      {documents.length === 0 ? (
        <div className={styles.empty}>
          <FileText size={40} className={styles.emptyIcon} />
          <p>No documents yet.</p>
          <p className={styles.emptyHint}>Use the Generate tab to create a deployment guide.</p>
        </div>
      ) : (
        <div className={styles.docList}>
          {documents.map(doc => (
            <div key={doc.id} className={styles.docCard}>
              {doc.status === 'generating'
                ? <Loader2 size={18} className={`${styles.docIcon} ${styles.spin}`} />
                : <FileText size={18} className={styles.docIcon} />}
              <div className={styles.docInfo}>
                <p className={styles.docTitle}>{doc.title ?? 'Untitled'}</p>
                <p className={styles.docMeta}>
                  <span style={{ color: statusColor(doc.status) }}>{doc.status}</span>
                  <span className={styles.dot}>&middot;</span>
                  {doc.doc_type}
                  <span className={styles.dot}>&middot;</span>
                  {fmtDate(doc.created_at)}
                  {doc.status === 'generating' && doc.generation_progress && (
                    <><span className={styles.dot}>&middot;</span>{doc.generation_progress}</>
                  )}
                  {doc.generation_time_seconds != null && doc.status !== 'generating' && (
                    <><span className={styles.dot}>&middot;</span>generated in {Math.round(doc.generation_time_seconds)}s</>
                  )}
                </p>
              </div>
              <div className={styles.docActions}>
                <button
                  className={styles.btnIcon} title="Edit"
                  disabled={doc.status === 'generating'}
                  onClick={() => navigate(`/doc-gen/projects/${project.id}/documents/${doc.id}`)}
                >
                  <Edit2 size={13} />
                </button>
                <button
                  className={styles.btnIcon} title="Download .docx"
                  disabled={doc.status === 'generating' || downloadingId === doc.id}
                  onClick={() => handleDownload(doc)}
                >
                  {downloadingId === doc.id ? <Loader2 size={13} className={styles.spin} /> : <Download size={13} />}
                </button>
                <button className={styles.btnIcon} title="Delete" onClick={() => handleDelete(doc.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
