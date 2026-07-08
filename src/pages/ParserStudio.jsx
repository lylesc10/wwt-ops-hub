import { useState, useCallback } from 'react'
import { useProjects } from '@/hooks/useProjects'
import { dab, getToken } from '@/lib/dab'
import { PageHeader } from '@/components/PageHeader'
import {
  Upload, RefreshCw, Check, AlertTriangle,
  Cpu, ChevronRight, Save, Trash2, Zap
} from 'lucide-react'
import styles from './ParserStudio.module.css'

const FIELD_LABELS = {
  code:            'Site Code *',
  branch_name:     'Branch Name',
  address:         'Address',
  city:            'City',
  state:           'State',
  zip:             'ZIP Code',
  time_zone:       'Time Zone',
  status:          'Status *',
  scheduled_start: 'Scheduled Start *',
  scheduled_end:   'Scheduled End',
  due_date_assign: 'Tech Due Date',
  fst_owner:       'Primary FST',
  lead_tech:       'Lead Tech',
  onsite_tech:     'Onsite Tech Name(s)',
  onsite_email:    'Onsite Tech Email(s)',
  onsite_phone:    'Onsite Tech Phone(s)',
  lvv_in_scope:    'LVV In Scope',
  target_quarter:  'Target Quarter',
  flag_late:       'Flag: Late Assignment',
  last_modified:   'Last Modified',
}

export default function ParserStudio() {
  const { projects } = useProjects()

  const [selectedProject, setSelectedProject] = useState('')
  const [mapName,         setMapName]         = useState('')
  const [headers,         setHeaders]         = useState([])
  const [sampleRows,      setSampleRows]      = useState([])
  const [fileName,        setFileName]        = useState('')
  const [mapping,         setMapping]         = useState(null)
  const [aiResult,        setAiResult]        = useState(null)
  const [savedMaps,       setSavedMaps]       = useState([])
  const [loading,         setLoading]         = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState('')
  const [step,            setStep]            = useState(1)

  const loadSavedMaps = useCallback(async (projectId) => {
    if (!projectId) return
    const { data } = await dab
      .from('column_maps')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    setSavedMaps(data ?? [])
  }, [])

  const handleProjectChange = (id) => {
    setSelectedProject(id)
    setStep(1)
    setMapping(null)
    setAiResult(null)
    setError('')
    loadSavedMaps(id)
  }

  const handleFileUpload = async (file) => {
    if (!file) return
    setFileName(file.name)
    setError('')
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb    = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false })
      const ws    = wb.Sheets[wb.SheetNames[0]]
      const rows  = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false })
      if (!rows.length) { setError('No data rows found'); return }
      setHeaders(Object.keys(rows[0]))
      setSampleRows(rows.slice(0, 5))
      setMapName(file.name.replace(/\.[^/.]+$/, ''))
    } catch (e) { setError(`Failed to read file: ${e.message}`) }
  }

  const runAIMapping = async () => {
    if (!headers.length) { setError('Upload a file first'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/ai/map-columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
        body: JSON.stringify({ project_id: selectedProject || null, headers, sample_rows: sampleRows, map_name: mapName }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.message ?? `Error ${res.status}`)
      setAiResult(result)
      setMapping({ ...result.mapping })
      setStep(2)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const saveAndActivate = async () => {
    if (!mapping || !selectedProject) { setError('Select a project first'); return }
    setSaving(true); setError('')
    try {
      const { data: saved, error: saveErr } = await dab
        .from('column_maps')
        .insert({ project_id: selectedProject, name: mapName || `Mapping ${new Date().toLocaleDateString()}`, source_cols: mapping, sample_headers: headers, confidence: aiResult?.confidence ?? 1.0, verified: true })
        .select('id').single()
      if (saveErr) throw new Error(saveErr.message)
      await dab.from('projects').update({ active_column_map_id: saved.id }).eq('id', selectedProject)
      await loadSavedMaps(selectedProject)
      setStep(3)
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  const activateMap = async (mapId) => {
    await dab.from('projects').update({ active_column_map_id: mapId }).eq('id', selectedProject)
    await loadSavedMaps(selectedProject)
  }

  const deleteMap = async (mapId) => {
    if (!confirm('Delete this column map?')) return
    await dab.from('column_maps').delete().eq('id', mapId)
    await loadSavedMaps(selectedProject)
  }

  const project = projects.find(p => p.id === selectedProject)

  return (
    <div className={styles.page}>
      <PageHeader title="Parser Studio" subtitle="AI-powered column mapping — teach the system any sheet format once, use it forever"/>

      <div className={styles.body}>
        <div className={styles.left}>

          {/* Step 1 */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.stepNum}>1</span>
              <span className={styles.cardTitle}>Select Project & Upload File</span>
            </div>
            <div className={styles.cardBody}>
              <label className={styles.label}>Project</label>
              <select className={styles.select} value={selectedProject} onChange={e => handleProjectChange(e.target.value)}>
                <option value="">Select a project…</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.client} · {p.name}</option>)}
              </select>

              <label className={styles.label} style={{marginTop:12}}>Upload a sample file</label>
              <label className={styles.fileZone}>
                <input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e => e.target.files[0] && handleFileUpload(e.target.files[0])}/>
                <Upload size={20} style={{color:'var(--accent)',marginBottom:6}}/>
                {fileName
                  ? <><span className={styles.fileName}>{fileName}</span><span className={styles.fileHint}>{headers.length} columns · {sampleRows.length} sample rows</span></>
                  : <><span className={styles.fileLabel}>Drop or click to upload</span><span className={styles.fileHint}>Excel (.xlsx) or CSV — any format</span></>
                }
              </label>

              {headers.length > 0 && (
                <div className={styles.headerList}>
                  <div className={styles.headerListTitle}>Detected columns:</div>
                  <div className={styles.headerPills}>{headers.map(h => <span key={h} className={styles.headerPill}>{h}</span>)}</div>
                </div>
              )}

              <button className={styles.aiBtn} onClick={runAIMapping} disabled={!headers.length || loading}>
                {loading ? <><RefreshCw size={14} className={styles.spin}/> Analyzing…</> : <><Cpu size={14}/> Map Columns with AI</>}
              </button>
              {error && <div className={styles.error}><AlertTriangle size={12}/> {error}</div>}
            </div>
          </div>

          {/* Step 2 — Review */}
          {step >= 2 && mapping && (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.stepNum}>2</span>
                <span className={styles.cardTitle}>Review & Confirm</span>
                {aiResult && <span className={styles.confidence} style={{color: aiResult.confidence > 0.85 ? 'var(--green)' : 'var(--amber)'}}>{Math.round(aiResult.confidence * 100)}% confident</span>}
              </div>
              <div className={styles.cardBody}>
                {aiResult?.notes && <div className={styles.aiNotes}><Cpu size={11}/> {aiResult.notes}</div>}
                {aiResult?.date_format && <div className={styles.aiNotes} style={{borderColor:'var(--blue)',color:'var(--blue)'}}>📅 Date format detected: {aiResult.date_format}</div>}

                <div className={styles.mappingGrid}>
                  {Object.entries(FIELD_LABELS).map(([field, label]) => {
                    const mapped = mapping[field]
                    return (
                      <div key={field} className={`${styles.mappingRow} ${!mapped && label.includes('*') ? styles.mappingRowMissing : ''}`}>
                        <div className={styles.mappingField}>{label}</div>
                        <ChevronRight size={11} style={{color:'var(--text-muted)',flexShrink:0}}/>
                        <select
                          className={`${styles.mappingSelect} ${mapped ? styles.mappingSelectMapped : styles.mappingSelectEmpty}`}
                          value={mapped ?? ''}
                          onChange={e => setMapping(m => ({ ...m, [field]: e.target.value || null }))}
                        >
                          <option value="">— not mapped —</option>
                          {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    )
                  })}
                </div>

                {aiResult?.missing_fields?.length > 0 && (
                  <div className={styles.missing}><AlertTriangle size={12}/> Not found: {aiResult.missing_fields.join(', ')}</div>
                )}

                <label className={styles.label} style={{marginTop:12}}>Map name</label>
                <input className={styles.input} value={mapName} onChange={e => setMapName(e.target.value)} placeholder="e.g. PNC OTT Export v2"/>

                <button className={styles.saveBtn} onClick={saveAndActivate} disabled={saving || !selectedProject}>
                  {saving ? <><RefreshCw size={13} className={styles.spin}/> Saving…</> : <><Save size={13}/> Save & Activate</>}
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Done */}
          {step >= 3 && (
            <div className={styles.successCard}>
              <Check size={22} style={{color:'var(--green)'}}/>
              <div>
                <div className={styles.successTitle}>Column map saved and activated</div>
                <div className={styles.successSub}>All future uploads for <strong>{project?.name}</strong> will use this mapping automatically.</div>
              </div>
            </div>
          )}
        </div>

        {/* Right — saved maps */}
        <div className={styles.right}>
          <div className={styles.savedTitle}><Zap size={13} style={{color:'var(--accent)'}}/> Saved Maps{project ? ` — ${project.name}` : ''}</div>

          {!selectedProject ? (
            <p className={styles.muted}>Select a project to see its saved maps</p>
          ) : savedMaps.length === 0 ? (
            <p className={styles.muted}>No saved maps yet</p>
          ) : savedMaps.map(m => {
            const mappedCount = Object.values(m.source_cols ?? {}).filter(Boolean).length
            const isActive    = project?.active_column_map_id === m.id
            return (
              <div key={m.id} className={`${styles.savedMap} ${isActive ? styles.savedMapActive : ''}`}>
                <div className={styles.savedMapHead}>
                  <span className={styles.savedMapName}>{m.name}</span>
                  {isActive && <span className={styles.activeBadge}><Zap size={9}/> Active</span>}
                </div>
                <div className={styles.savedMapMeta}>{mappedCount}/{Object.keys(FIELD_LABELS).length} fields · {Math.round((m.confidence??0)*100)}% conf{m.verified?' · verified':''}</div>
                <div className={styles.savedMapMeta}>{new Date(m.created_at).toLocaleDateString()}</div>
                <div className={styles.savedMapActions}>
                  {!isActive && <button className={styles.ghostBtn} onClick={() => activateMap(m.id)}><Zap size={11}/> Activate</button>}
                  <button className={`${styles.ghostBtn} ${styles.dangerGhost}`} onClick={() => deleteMap(m.id)}><Trash2 size={11}/></button>
                </div>
              </div>
            )
          })}

          <div className={styles.howItWorks}>
            <div className={styles.howTitle}>How it works</div>
            <div className={styles.howStep}><span className={styles.howNum}>1</span> Upload any Excel or CSV — any client, any format</div>
            <div className={styles.howStep}><span className={styles.howNum}>2</span> AI reads the headers and sample data, maps to our fields</div>
            <div className={styles.howStep}><span className={styles.howNum}>3</span> Review, correct if needed, save the map</div>
            <div className={styles.howStep}><span className={styles.howNum}>4</span> Every future upload uses the saved map automatically</div>
            <div className={styles.howNote}>No code changes needed for new clients or sheet formats.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
