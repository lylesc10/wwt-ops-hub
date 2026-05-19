import styles from './GanttCell.module.css'

const STATUS_COLORS = {
  scheduled:           'var(--blue)',
  staffed:             'var(--green)',
  in_progress:         'var(--amber)',
  completed:           '#6b7280',
  cancelled:           'var(--red)',
  flagged_payment:     '#f97316',
  flagged_date_change: 'var(--purple)',
}

export function GanttCell({ site, position, project, onClick }) {
  const color = project?.color ?? STATUS_COLORS[site.status] ?? 'var(--blue)'

  return (
    <div
      className={`${styles.cell} ${styles[position]}`}
      style={{ '--cell-color': color }}
      onClick={() => onClick(site)}
      title={`${site.code} — ${site.branch_name}\n${site.status.replace(/_/g, ' ')}`}
    >
      {(position === 'single' || position === 'start') && (
        <span className={styles.label}>{site.code}</span>
      )}
    </div>
  )
}
