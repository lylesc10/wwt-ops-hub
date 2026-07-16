import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { UploadCloud, Trash2, Loader2, AlertTriangle, Wrench } from 'lucide-react'
import { uploadFile, deleteUpload, getBomMatches } from './api'
import styles from './DocGen.module.css'

const FILE_TYPES = [
  { value: 'bom',    label: 'Bill of Materials' },
  { value: 'sow',    label: 'Scope of Work' },
  { value: 'design', label: 'Design Document' },
  { value: 'config', label: 'Configuration' },
  { value: 'other',  label: 'Other' },
]

const ACCEPT = '.xlsx,.xls,.docx,.doc,.pdf,.csv'

export default function FilesTab({ projectId, uploads, onChange }) {
  const [fileType, setFileType] = useState('bom')
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState('')
  const [bomMatches, setBomMatches] = useState(null)
  const inputRef = useRef(null)

  const hasBom = uploads.some(u => u.file_type === 'bom')

  // Matching is computed server-side against the global hardware repo —
  // refetch whenever the upload list changes. Non-blocking; errors are
  // swallowed so a matching hiccup never breaks the files view.
  useEffect(() => {
    if (!hasBom) { setBomMatches(null); return }
    let cancelled = false
    getBomMatches(projectId)
      .then(m => { if (!cancelled) setBomMatches(m) })
      .catch(() => { if (!cancelled) setBomMatches(null) })
    return () => { cancelled = true }
  }, [projectId, uploads, hasBom])

  async function handleFiles(files) {
    setError('')
    setUploading(true)
    try {
      for (const file of files) {
        await uploadFile(projectId, fileType, file)
      }
      await onChange()
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleDelete(uploadId) {
    if (!confirm('Remove this file from the project?')) return
    try {
      await deleteUpload(projectId, uploadId)
      await onChange()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <>
      {error && <div className={styles.errorBanner}><AlertTriangle size={14} />{error}</div>}

      <div className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label}>File Type</label>
          <select className={styles.select} value={fileType} onChange={e => setFileType(e.target.value)}>
            {FILE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <button
          type="button"
          className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onDrop={e => {
            e.preventDefault()
            setDragActive(false)
            if (e.dataTransfer.files?.length) handleFiles([...e.dataTransfer.files])
          }}
        >
          {uploading
            ? <><Loader2 size={22} className={styles.spin} /><span>Uploading & parsing…</span></>
            : <><UploadCloud size={22} /><span>Drop files here or click to browse</span><span className={styles.emptyHint}>Excel, PDF, Word, CSV — parsed automatically for AI context</span></>}
        </button>
        <input
          ref={inputRef} type="file" accept={ACCEPT} multiple hidden
          onChange={e => e.target.files?.length && handleFiles([...e.target.files])}
        />
      </div>

      {uploads.length === 0 ? (
        <p className={styles.emptyHint}>No files uploaded yet. BOM and SOW files feed the AI generation and answer suggestions.</p>
      ) : (
        uploads.map(u => {
          const parseError = u.parsed_data?.parse_error
          return (
            <div key={u.id} className={styles.fileRow}>
              <span className={styles.fileType}>{u.file_type}</span>
              <span className={styles.fileName}>{u.original_filename}</span>
              {parseError
                ? <span className={styles.fileParseFail} title={parseError}>parse failed</span>
                : <span className={styles.fileParsed}>parsed ✓</span>}
              <button className={styles.btnIcon} title="Remove" onClick={() => handleDelete(u.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          )
        })
      )}

      {bomMatches && bomMatches.items.length > 0 && (
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>
              <Wrench size={12} style={{ verticalAlign: '-2px' }} /> BOM Hardware Matches
            </label>
            <p className={styles.emptyHint}>
              {bomMatches.summary.with_steps} of {bomMatches.summary.total} BOM items have install
              instructions — those steps replace AI-generated content in the document.{' '}
              <Link to="/doc-gen/hardware">Manage hardware →</Link>
            </p>
          </div>
          {bomMatches.items.map((item, i) => (
            <div key={i} className={styles.fileRow}>
              <span className={styles.fileType}>{item.part_number || 'no pn'}</span>
              <span className={styles.fileName}>{item.description}</span>
              {item.match?.step_count > 0
                ? <span className={styles.matchChipGood}>✓ instructions ({item.match.step_count} steps)</span>
                : item.match
                  ? <span className={styles.matchChipWarn}>matched — no steps yet</span>
                  : <span className={styles.matchChipNone}>no match</span>}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
