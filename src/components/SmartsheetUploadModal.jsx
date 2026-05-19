import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Upload, X, Check, AlertTriangle, Calendar,
  Users, ArrowRight, Plus, Minus, RefreshCw,
  ChevronDown, ChevronUp, TrendingUp
} from 'lucide-react'
import styles from './SmartsheetUploadModal.module.css'

export function SmartsheetUploadModal({ project, onClose, onSynced }) {
  const [phase,      setPhase]      = useState('idle')   // idle | analyzing | diff | committing | done
  const [dragOver,   setDragOver]   = useState(false)
  const [fileName,   setFileName]   = useState('')
  const [diff,       setDiff]       = useState(null)
  const [result,     setResult]     = useState(null)
  const [error,      setError]      = useState(null)
  const [expanded,   setExpanded]   = useState({ dates: true, weeks: true, techs: false, status: false, new: false, removed: false })
  const fileRef = useRef(null)

  const toggle = (key) => setExpanded(e => ({ ...e, [key]: !e[key] }))

  const processFile = async (file) => {
    if (!file) return
    setFileName(file.name)
    setPhase('analyzing')
    setError(null)
    setDiff(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const formData = new FormData()
      formData.append('file', file)
      formData.append('project_id', project.id)
      formData.append('diff', 'true')

      const res  = await fetch('/api/sync/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Analysis failed')
      setDiff(data)
      setPhase('diff')
    } catch(e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  const handleCommit = async () => {
    if (!diff) return
    setPhase('committing')
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const formData = new FormData()

      // Re-upload same file — use the file from the input
      const file = fileRef.current?.files?.[0]
      if (!file) throw new Error('File no longer available — please re-upload')

      formData.append('file', file)
      formData.append('project_id', project.id)
      formData.append('diff', 'false')

      const res  = await fetch('/api/sync/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Commit failed')
      setResult(data)
      setPhase('done')
      onSynced?.()
    } catch(e) {
      setError(e.message)
      setPhase('diff')
    }
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const hasCritical = diff && (diff.weekShifts?.length > 0 || diff.summary?.week_shifts > 0)
  const hasWarnings = diff && (diff.dateChanges?.length > 0 || diff.techChanges?.length > 0)

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Upload size={16} style={{ color: 'var(--accent)' }} />
            <div>
              <div className={styles.title}>Upload Smartsheet Export</div>
              <div className={styles.sub}>{project.client} · {project.name}</div>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={15}/></button>
        </div>

        <div className={styles.body}>

          {/* IDLE — drop zone */}
          {phase === 'idle' && (
            <div
              className={`${styles.dropZone} ${dragOver ? styles.dropZoneOver : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={e => processFile(e.target.files?.[0])}
              />
              <Upload size={28} style={{ color: 'var(--accent)', marginBottom: 10 }} />
              <p className={styles.dropTitle}>Drop your Smartsheet export here</p>
              <p className={styles.dropSub}>
                Export from Smartsheet → File → Export → Excel (.xlsx)<br/>
                Supports the full Onsite Tech Tracker column format
              </p>
              <button className={styles.browseBtn}>Browse file</button>
              {error && <p className={styles.errorMsg}><AlertTriangle size={12}/> {error}</p>}
            </div>
          )}

          {/* ANALYZING */}
          {phase === 'analyzing' && (
            <div className={styles.analyzing}>
              <RefreshCw size={24} className={styles.spin} style={{ color: 'var(--accent)' }} />
              <p className={styles.analyzingTitle}>Analyzing {fileName}…</p>
              <p className={styles.analyzingSub}>Comparing against current database</p>
            </div>
          )}

          {/* COMMITTING */}
          {phase === 'committing' && (
            <div className={styles.analyzing}>
              <RefreshCw size={24} className={styles.spin} style={{ color: 'var(--green)' }} />
              <p className={styles.analyzingTitle}>Saving changes…</p>
              <p className={styles.analyzingSub}>Upserting sites and firing alerts</p>
            </div>
          )}

          {/* DONE */}
          {phase === 'done' && result && (
            <div className={styles.doneState}>
              <Check size={32} style={{ color: 'var(--green)', marginBottom: 12 }} />
              <p className={styles.doneTitle}>Sync Complete</p>
              <p className={styles.doneSub}>{result.message}</p>
              <div className={styles.doneStats}>
                <Stat label="Sites synced"     value={result.upserted}                 color="var(--green)" />
                <Stat label="Date changes"     value={result.summary?.date_changes ?? 0} color={result.summary?.date_changes > 0 ? 'var(--amber)' : 'var(--text-muted)'} />
                <Stat label="Week shifts"      value={result.summary?.week_shifts ?? 0}  color={result.summary?.week_shifts > 0 ? 'var(--red)' : 'var(--text-muted)'} />
                <Stat label="Alerts fired"     value={result.alerts_fired ?? 0}          color="var(--accent)" />
              </div>
              <button className={styles.doneBtn} onClick={onClose}>Close</button>
            </div>
          )}

          {/* DIFF VIEW */}
          {phase === 'diff' && diff && (
            <div className={styles.diffBody}>

              {/* Summary banner */}
              <div className={`${styles.banner} ${hasCritical ? styles.bannerCritical : hasWarnings ? styles.bannerWarn : styles.bannerOk}`}>
                <div className={styles.bannerIcon}>
                  {hasCritical ? <AlertTriangle size={18}/> : hasWarnings ? <Calendar size={18}/> : <Check size={18}/>}
                </div>
                <div className={styles.bannerText}>
                  <div className={styles.bannerTitle}>
                    {hasCritical
                      ? `${diff.summary.week_shifts} site${diff.summary.week_shifts !== 1 ? 's' : ''} moved to different weeks`
                      : hasWarnings
                      ? `${diff.summary.date_changes} date change${diff.summary.date_changes !== 1 ? 's' : ''} detected`
                      : 'No date changes — only tech/status updates'}
                  </div>
                  <div className={styles.bannerSub}>
                    {diff.summary.total_incoming} sites in file · {diff.summary.date_changes} date changes · {diff.summary.week_shifts} week shifts · {diff.summary.tech_changes} tech changes · {diff.summary.new_sites} new sites
                  </div>
                </div>
              </div>

              {/* ── WEEK SHIFTS — top priority ── */}
              {diff.weekShifts?.length > 0 && (
                <Section
                  icon={<TrendingUp size={13}/>}
                  title="Week Shifts"
                  count={diff.weekShifts.length}
                  color="var(--red)"
                  expanded={expanded.weeks}
                  onToggle={() => toggle('weeks')}
                  critical
                >
                  {diff.weekShifts.map(c => (
                    <div key={c.code} className={styles.changeRow}>
                      <span className={styles.changeCode}>{c.code}</span>
                      <span className={styles.changeName}>{c.branch_name}</span>
                      <span className={styles.changeState}>{c.state}</span>
                      <div className={styles.changeArrow}>
                        <span className={styles.changeOld}>{c.old_week}</span>
                        <ArrowRight size={12} style={{ color: 'var(--red)', flexShrink: 0 }}/>
                        <span className={styles.changeNew}>{c.new_week}</span>
                        {c.days_diff !== null && (
                          <span className={`${styles.daysDiff} ${c.days_diff > 0 ? styles.daysDiffPos : styles.daysDiffNeg}`}>
                            {c.days_diff > 0 ? '+' : ''}{c.days_diff}d
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </Section>
              )}

              {/* ── DATE CHANGES (non-week-shift) ── */}
              {diff.dateChanges?.filter(c => !c.week_shifted).length > 0 && (
                <Section
                  icon={<Calendar size={13}/>}
                  title="Date Changes (same week)"
                  count={diff.dateChanges.filter(c => !c.week_shifted).length}
                  color="var(--amber)"
                  expanded={expanded.dates}
                  onToggle={() => toggle('dates')}
                >
                  {diff.dateChanges.filter(c => !c.week_shifted).map(c => (
                    <div key={c.code} className={styles.changeRow}>
                      <span className={styles.changeCode}>{c.code}</span>
                      <span className={styles.changeName}>{c.branch_name}</span>
                      <span className={styles.changeState}>{c.state}</span>
                      <div className={styles.changeArrow}>
                        <span className={styles.changeOld}>{c.old_start ?? 'TBD'}</span>
                        <ArrowRight size={12} style={{ color: 'var(--amber)', flexShrink: 0 }}/>
                        <span className={styles.changeNew}>{c.new_start ?? 'TBD'}</span>
                        {c.days_diff !== null && (
                          <span className={`${styles.daysDiff} ${c.days_diff > 0 ? styles.daysDiffPos : styles.daysDiffNeg}`}>
                            {c.days_diff > 0 ? '+' : ''}{c.days_diff}d
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </Section>
              )}

              {/* ── TECH CHANGES ── */}
              {diff.techChanges?.length > 0 && (
                <Section
                  icon={<Users size={13}/>}
                  title="Tech Assignments Changed"
                  count={diff.techChanges.length}
                  color="var(--blue)"
                  expanded={expanded.techs}
                  onToggle={() => toggle('techs')}
                >
                  {diff.techChanges.map(c => (
                    <div key={c.code} className={styles.changeRow}>
                      <span className={styles.changeCode}>{c.code}</span>
                      <span className={styles.changeName}>{c.branch_name}</span>
                      <span className={styles.changeState}>{c.state}</span>
                      <div className={styles.changeArrow}>
                        <span className={styles.changeOld}>{c.old_tech || 'Unassigned'}</span>
                        <ArrowRight size={12} style={{ color: 'var(--blue)', flexShrink: 0 }}/>
                        <span className={styles.changeNew}>{c.new_tech || 'Unassigned'}</span>
                        <span className={`${styles.techAction} ${styles['techAction_'+c.action]}`}>{c.action}</span>
                      </div>
                    </div>
                  ))}
                </Section>
              )}

              {/* ── NEW SITES ── */}
              {diff.newSites?.length > 0 && (
                <Section
                  icon={<Plus size={13}/>}
                  title="New Sites"
                  count={diff.newSites.length}
                  color="var(--green)"
                  expanded={expanded.new}
                  onToggle={() => toggle('new')}
                >
                  {diff.newSites.map(s => (
                    <div key={s.code} className={styles.changeRow}>
                      <span className={styles.changeCode}>{s.code}</span>
                      <span className={styles.changeName}>{s.branch_name}</span>
                      <span className={styles.changeState}>{s.state}</span>
                      <span className={styles.changeNew}>{s.start ?? 'TBD'}</span>
                    </div>
                  ))}
                </Section>
              )}

              {/* ── REMOVED SITES ── */}
              {diff.removedSites?.length > 0 && (
                <Section
                  icon={<Minus size={13}/>}
                  title="Sites Not in Export"
                  count={diff.removedSites.length}
                  color="var(--text-muted)"
                  expanded={expanded.removed}
                  onToggle={() => toggle('removed')}
                >
                  <p className={styles.removedNote}>These sites are in the database but not in this export. They will NOT be deleted — just flagged for review.</p>
                  {diff.removedSites.map(s => (
                    <div key={s.code} className={styles.changeRow}>
                      <span className={styles.changeCode}>{s.code}</span>
                      <span className={styles.changeName}>{s.branch_name}</span>
                      <span className={`${styles.changeState}`}>{s.status}</span>
                    </div>
                  ))}
                </Section>
              )}

              {error && <p className={styles.errorMsg}><AlertTriangle size={12}/> {error}</p>}
            </div>
          )}

        </div>

        {/* Footer */}
        {phase === 'diff' && diff && (
          <div className={styles.footer}>
            <div className={styles.footerLeft}>
              <span className={styles.fileLabel}>📄 {fileName}</span>
              <button className={styles.reuploadBtn} onClick={() => { setPhase('idle'); setDiff(null); setFileName('') }}>
                Change file
              </button>
            </div>
            <div className={styles.footerRight}>
              <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
              <button className={styles.commitBtn} onClick={handleCommit}>
                <Check size={14}/>
                Commit {diff.summary.total_incoming} sites
                {diff.summary.week_shifts > 0 && ` · fire ${diff.summary.week_shifts} alerts`}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function Section({ icon, title, count, color, expanded, onToggle, children, critical }) {
  return (
    <div className={`${styles.section} ${critical ? styles.sectionCritical : ''}`}>
      <button className={styles.sectionHeader} onClick={onToggle}>
        <span className={styles.sectionIcon} style={{ color }}>{icon}</span>
        <span className={styles.sectionTitle}>{title}</span>
        <span className={styles.sectionCount} style={{ background: `${color}18`, color }}>{count}</span>
        <span className={styles.sectionChevron}>
          {expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
        </span>
      </button>
      {expanded && <div className={styles.sectionBody}>{children}</div>}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className={styles.doneStat}>
      <div className={styles.doneStatVal} style={{ color }}>{value}</div>
      <div className={styles.doneStatLabel}>{label}</div>
    </div>
  )
}
