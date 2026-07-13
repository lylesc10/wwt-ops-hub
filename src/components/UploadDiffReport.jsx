import { useState } from 'react'
import { Calendar, AlertTriangle, Plus, Minus, Users, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import styles from './UploadDiffReport.module.css'

function humanDate(d) {
  if (!d) return 'TBD'
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch { return d }
}

export function UploadDiffReport({ result, onClose }) {
  const [expanded, setExpanded] = useState({ dates: true, weeks: true, added: false, removed: false, techs: false })
  const toggle = (k) => setExpanded(e => ({ ...e, [k]: !e[k] }))

  if (!result?.diff) return null
  const { diff, summary, upserted, fileName } = result

  const hasChanges = Object.values(summary).some(v => v > 0)

  return (
    <div className={styles.report}>
      {/* Header */}
      <div className={styles.reportHeader}>
        <div className={styles.reportTitle}>
          <span className={styles.reportIcon}>📊</span>
          <div>
            <div className={styles.reportName}>Upload Complete</div>
            <div className={styles.reportFile}>{fileName} · {upserted} sites synced</div>
          </div>
        </div>
        <button className={styles.closeBtn} onClick={onClose}>×</button>
      </div>

      {/* Summary chips */}
      <div className={styles.summaryRow}>
        <SummaryChip
          count={summary.date_changes}
          label="Date Changes"
          color="var(--purple)"
          bg="var(--purple-bg)"
          urgent={summary.date_changes > 0}
        />
        <SummaryChip
          count={summary.week_changes}
          label="Week Shifts"
          color="var(--red)"
          bg="var(--red-bg)"
          urgent={summary.week_changes > 0}
        />
        <SummaryChip
          count={summary.sites_added}
          label="Sites Added"
          color="var(--green)"
          bg="var(--green-bg)"
        />
        <SummaryChip
          count={summary.sites_removed}
          label="Not in Upload"
          color="var(--amber)"
          bg="var(--amber-bg)"
        />
        <SummaryChip
          count={summary.tech_changes}
          label="Tech Changes"
          color="var(--blue)"
          bg="var(--blue-bg)"
        />
      </div>

      {!hasChanges && (
        <div className={styles.noChanges}>
          ✓ No changes detected — all sites match the previous upload
        </div>
      )}

      {/* Date changes — most critical */}
      {diff.date_changes.length > 0 && (
        <Section
          title="Date Changes"
          count={diff.date_changes.length}
          color="var(--purple)"
          icon={<Calendar size={13}/>}
          expanded={expanded.dates}
          onToggle={() => toggle('dates')}
          urgent
        >
          {diff.date_changes.map((c, i) => (
            <div key={i} className={`${styles.changeRow} ${c.week_moved ? styles.changeRowUrgent : ''}`}>
              <div className={styles.changeLeft}>
                <span className={styles.changeCode}>{c.code}</span>
                <span className={styles.changeBranch}>{c.branch}</span>
                {c.state && <span className={styles.changeState}>{c.state}</span>}
              </div>
              <div className={styles.changeDates}>
                <span className={styles.dateOld}>{humanDate(c.old_start)}</span>
                <ArrowRight size={11} style={{color:'var(--text-muted)',flexShrink:0}}/>
                <span className={styles.dateNew}>{humanDate(c.new_start)}</span>
                {c.week_moved && (
                  <span className={styles.weekMovedBadge}>
                    Wk {c.old_week} → Wk {c.new_week}
                  </span>
                )}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Week shifts — subset of date changes that crossed a week boundary */}
      {diff.week_changes.length > 0 && (
        <Section
          title="Week Boundary Shifts"
          count={diff.week_changes.length}
          color="var(--red)"
          icon={<AlertTriangle size={13}/>}
          expanded={expanded.weeks}
          onToggle={() => toggle('weeks')}
          urgent
        >
          <div className={styles.urgentNote}>
            ⚠ These sites moved to a different week — staffing may need to be reassigned
          </div>
          {diff.week_changes.map((c, i) => (
            <div key={i} className={`${styles.changeRow} ${styles.changeRowUrgent}`}>
              <div className={styles.changeLeft}>
                <span className={styles.changeCode}>{c.code}</span>
                <span className={styles.changeBranch}>{c.branch}</span>
              </div>
              <div className={styles.changeDates}>
                <span className={styles.weekBadgeOld}>Week {c.from_week}</span>
                <ArrowRight size={11} style={{color:'var(--text-muted)',flexShrink:0}}/>
                <span className={styles.weekBadgeNew}>Week {c.to_week}</span>
                <span className={styles.dateOld} style={{marginLeft:6}}>{humanDate(c.from_date)}</span>
                <ArrowRight size={11} style={{color:'var(--text-muted)',flexShrink:0}}/>
                <span className={styles.dateNew}>{humanDate(c.to_date)}</span>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Sites added */}
      {diff.sites_added.length > 0 && (
        <Section
          title="New Sites"
          count={diff.sites_added.length}
          color="var(--green)"
          icon={<Plus size={13}/>}
          expanded={expanded.added}
          onToggle={() => toggle('added')}
        >
          {diff.sites_added.map((s, i) => (
            <div key={i} className={styles.changeRow}>
              <div className={styles.changeLeft}>
                <span className={styles.changeCode}>{s.code}</span>
                <span className={styles.changeBranch}>{s.branch}</span>
                {s.state && <span className={styles.changeState}>{s.state}</span>}
              </div>
              <span className={styles.dateNew}>{humanDate(s.start)}</span>
            </div>
          ))}
        </Section>
      )}

      {/* Sites not in upload */}
      {diff.sites_removed.length > 0 && (
        <Section
          title="Not in This Upload"
          count={diff.sites_removed.length}
          color="var(--amber)"
          icon={<Minus size={13}/>}
          expanded={expanded.removed}
          onToggle={() => toggle('removed')}
        >
          <div className={styles.removedNote}>
            These sites exist in the DB but weren&apos;t in the uploaded file. They have NOT been deleted — verify in Smartsheet if they were cancelled or moved.
          </div>
          {diff.sites_removed.map((s, i) => (
            <div key={i} className={styles.changeRow}>
              <div className={styles.changeLeft}>
                <span className={styles.changeCode}>{s.code}</span>
                <span className={styles.changeBranch}>{s.branch}</span>
              </div>
              <span style={{fontSize:11,color:'var(--text-muted)'}}>{humanDate(s.start)}</span>
            </div>
          ))}
        </Section>
      )}

      {/* Tech changes */}
      {diff.tech_changes.length > 0 && (
        <Section
          title="Tech Changes"
          count={diff.tech_changes.length}
          color="var(--blue)"
          icon={<Users size={13}/>}
          expanded={expanded.techs}
          onToggle={() => toggle('techs')}
        >
          {diff.tech_changes.map((c, i) => (
            <div key={i} className={styles.changeRow}>
              <div className={styles.changeLeft}>
                <span className={styles.changeCode}>{c.code}</span>
                <span className={styles.changeBranch}>{c.branch}</span>
              </div>
              <div className={styles.changeDates}>
                {c.added ? (
                  <span className={styles.dateNew}>+ {c.new_tech}</span>
                ) : c.removed ? (
                  <span className={styles.dateOld}>- {c.old_tech}</span>
                ) : (
                  <>
                    <span className={styles.dateOld} style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.old_tech}</span>
                    <ArrowRight size={11} style={{color:'var(--text-muted)',flexShrink:0}}/>
                    <span className={styles.dateNew} style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.new_tech}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ title, count, color, icon, expanded, onToggle, urgent, children }) {
  return (
    <div className={`${styles.section} ${urgent ? styles.sectionUrgent : ''}`} style={urgent ? { borderLeftColor: color } : {}}>
      <button className={styles.sectionHeader} onClick={onToggle}>
        <span className={styles.sectionIcon} style={{ color }}>{icon}</span>
        <span className={styles.sectionTitle}>{title}</span>
        <span className={styles.sectionCount} style={{ background: `${color}20`, color }}>{count}</span>
        <span className={styles.sectionToggle}>
          {expanded ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
        </span>
      </button>
      {expanded && <div className={styles.sectionBody}>{children}</div>}
    </div>
  )
}

function SummaryChip({ count, label, color, bg, urgent }) {
  return (
    <div className={`${styles.chip} ${urgent && count > 0 ? styles.chipUrgent : ''}`}
      style={count > 0 ? { background: bg, borderColor: `${color}30` } : {}}>
      <span className={styles.chipCount} style={{ color: count > 0 ? color : 'var(--text-muted)' }}>{count}</span>
      <span className={styles.chipLabel}>{label}</span>
    </div>
  )
}
