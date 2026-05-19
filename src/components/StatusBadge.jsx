import styles from './StatusBadge.module.css'

const STATUS = {
  scheduled:           { label: 'Scheduled',    cls: 'scheduled'    },
  staffed:             { label: 'Staffed',       cls: 'staffed'      },
  in_progress:         { label: 'In Progress',   cls: 'in_progress'  },
  completed:           { label: 'Completed',     cls: 'completed'    },
  cancelled:           { label: 'Cancelled',     cls: 'cancelled'    },
  flagged_payment:     { label: 'Pmt Flag',      cls: 'flagged'      },
  flagged_date_change: { label: 'Date Change',   cls: 'flagged'      },
  not_started:         { label: 'Not Started',   cls: 'scheduled'    },
}

export function StatusBadge({ status }) {
  const meta = STATUS[status] ?? { label: status ?? 'Unknown', cls: 'scheduled' }
  return <span className={`${styles.badge} ${styles[meta.cls]}`}>{meta.label}</span>
}
