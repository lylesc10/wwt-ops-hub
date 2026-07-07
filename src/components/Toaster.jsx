import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { subscribeToToasts } from '@/lib/toast'
import styles from './Toaster.module.css'

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info }
const DISMISS_MS = 3500

export function Toaster() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    return subscribeToToasts((item) => {
      setToasts((prev) => [...prev, item])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id))
      }, DISMISS_MS)
    })
  }, [])

  if (!toasts.length) return null

  return (
    <div className={styles.host}>
      {toasts.map((t) => {
        const Icon = ICONS[t.type] ?? Info
        return (
          <div key={t.id} className={`${styles.toast} ${styles[t.type] ?? ''}`}>
            <Icon size={15} />
            <span>{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}
