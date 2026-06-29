import { useRef } from 'react'
import styles from './PNCDashboard.module.css'

export default function PNCDashboard() {
  const iframeRef = useRef(null)

  return (
    <div className={styles.wrap}>
      <iframe
        ref={iframeRef}
        src="/pnc-dashboard.html"
        className={styles.frame}
        title="PNC Unification Dashboard"
        allow="clipboard-write"
      />
    </div>
  )
}
