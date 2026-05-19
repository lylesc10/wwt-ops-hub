import { AlertTriangle, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import styles from './AlertBanner.module.css'

const ICON_MAP = {
  date_change:          '📅',
  provider_cancelled:   '🚫',
  unstaffed_approaching:'⏰',
  payment_flag:         '💰',
  site_added:           '➕',
  site_removed:         '➖',
}

export function AlertBanner({ alert, onAcknowledge, onResolve }) {
  const { user } = useAuth()

  return (
    <div className={`${styles.banner} ${styles[alert.alert_type]}`}>
      <span className={styles.icon}>{ICON_MAP[alert.alert_type] ?? '⚠️'}</span>
      <div className={styles.body}>
        <p className={styles.title}>{alert.title}</p>
        {alert.detail && <p className={styles.detail}>{alert.detail}</p>}
        {alert.site && (
          <p className={styles.site}>
            <span className="mono">{alert.site.code}</span> · {alert.site.branch_name}
          </p>
        )}
      </div>
      <div className={styles.actions}>
        {alert.status === 'active' && (
          <button className={styles.ackBtn} onClick={() => onAcknowledge(alert.id, user.id)}>
            Acknowledge
          </button>
        )}
        {alert.status !== 'resolved' && (
          <button className={styles.resolveBtn} onClick={() => onResolve(alert.id)}>
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
