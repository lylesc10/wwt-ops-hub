import { useState } from 'react'
import { useSiteWorkOrders, WO_TYPE_META, FN_STATUS_META, EXPECTED_WO_TYPES } from '@/hooks/useSiteWorkOrders'
import { ExternalLink, RefreshCw, CheckCircle, AlertTriangle, Plus, X } from 'lucide-react'
import styles from './SiteWorkOrdersPanel.module.css'

export function SiteWorkOrdersPanel({ site }) {
  const {
    workOrders, loading, byType, coverage,
    missingTypes, totalWOs, completedWOs, assignedWOs,
    refetch
  } = useSiteWorkOrders(site?.id)

  const [expandedType, setExpandedType] = useState(null)

  if (loading) {
    return <div className={styles.loading}><RefreshCw size={13} className={styles.spin}/> Loading work orders…</div>
  }

  const fullyMapped = totalWOs > 0

  return (
    <div className={styles.panel}>
      {/* Summary bar */}
      <div className={styles.summaryBar}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryNum}>{totalWOs}</span>
          <span className={styles.summaryLabel}>Total WOs</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryNum} style={{color:'var(--green)'}}>{assignedWOs}</span>
          <span className={styles.summaryLabel}>Assigned</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryNum} style={{color:'var(--accent)'}}>{completedWOs}</span>
          <span className={styles.summaryLabel}>Complete</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryNum} style={{color: missingTypes.length > 0 ? 'var(--red)' : 'var(--green)'}}>
            {missingTypes.length > 0 ? missingTypes.length + ' missing' : '✓ all types'}
          </span>
          <span className={styles.summaryLabel}>Coverage</span>
        </div>
        <button className={styles.refreshBtn} onClick={refetch} title="Refresh from DB">
          <RefreshCw size={12}/>
        </button>
      </div>

      {/* Missing types warning */}
      {missingTypes.length > 0 && (
        <div className={styles.missingBanner}>
          <AlertTriangle size={13}/>
          <span>Missing WO types: {missingTypes.map(t => WO_TYPE_META[t]?.label ?? t).join(', ')}</span>
          <span className={styles.missingHint}>Generate these in Work Orders then re-map from FN</span>
        </div>
      )}

      {!fullyMapped && (
        <div className={styles.noWOs}>
          <p>No work orders mapped for this site yet.</p>
          <p className={styles.noWOsHint}>
            Generate WOs in the Work Orders page, upload to FieldNation,
            then use <strong>Settings → Projects → Map FN</strong> to sync them back here.
          </p>
        </div>
      )}

      {/* WO type rows */}
      {EXPECTED_WO_TYPES.map(type => {
        const meta  = WO_TYPE_META[type] ?? { label: type, color: '#6b7280' }
        const cov   = coverage[type]
        const wos   = byType[type] ?? []
        const isExp = expandedType === type

        return (
          <div key={type} className={styles.typeBlock}>
            <button
              className={`${styles.typeHeader} ${wos.length === 0 ? styles.typeHeaderMissing : ''}`}
              onClick={() => setExpandedType(isExp ? null : type)}
            >
              <span className={styles.typeDot} style={{background: meta.color}}/>
              <span className={styles.typeLabel}>{meta.label}</span>
              <span className={styles.typeSuffix}>{type}</span>

              {/* Coverage pills */}
              <div className={styles.typePills}>
                {wos.length === 0 ? (
                  <span className={styles.pill} style={{background:'var(--red-bg)',color:'var(--red)',borderColor:'rgba(244,63,94,.2)'}}>
                    missing
                  </span>
                ) : (
                  wos.map(wo => {
                    const sm = FN_STATUS_META[wo.fn_status] ?? FN_STATUS_META.UNKNOWN
                    return (
                      <span key={wo.id} className={styles.pill}
                        style={{background:`${sm.color}18`,color:sm.color,borderColor:`${sm.color}35`}}>
                        {wo.wo_number && wo.wo_number > 1 ? `#${wo.wo_number} ` : ''}
                        {sm.label}
                      </span>
                    )
                  })
                )}
              </div>
              <span className={styles.typeChevron}>{isExp ? '▲' : '▼'}</span>
            </button>

            {isExp && wos.length > 0 && (
              <div className={styles.typeBody}>
                {wos.map(wo => (
                  <WORow key={wo.id} wo={wo}/>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Any extra WO types not in expected list */}
      {Object.entries(byType)
        .filter(([type]) => !EXPECTED_WO_TYPES.includes(type))
        .map(([type, wos]) => (
          <div key={type} className={styles.typeBlock}>
            <button className={styles.typeHeader} onClick={() => setExpandedType(expandedType === type ? null : type)}>
              <span className={styles.typeDot} style={{background:'#6b7280'}}/>
              <span className={styles.typeLabel}>{type}</span>
              <div className={styles.typePills}>
                {wos.map(wo => {
                  const sm = FN_STATUS_META[wo.fn_status] ?? FN_STATUS_META.UNKNOWN
                  return <span key={wo.id} className={styles.pill} style={{background:`${sm.color}18`,color:sm.color,borderColor:`${sm.color}35`}}>{sm.label}</span>
                })}
              </div>
              <span className={styles.typeChevron}>{expandedType === type ? '▲' : '▼'}</span>
            </button>
            {expandedType === type && (
              <div className={styles.typeBody}>
                {wos.map(wo => <WORow key={wo.id} wo={wo}/>)}
              </div>
            )}
          </div>
        ))
      }
    </div>
  )
}

function WORow({ wo }) {
  const sm = FN_STATUS_META[wo.fn_status] ?? FN_STATUS_META.UNKNOWN
  return (
    <div className={styles.woRow}>
      <div className={styles.woLeft}>
        <div className={styles.woId}>
          {wo.fn_wo_id
            ? <a href={wo.fn_url} target="_blank" rel="noreferrer" className={styles.woIdLink}>
                #{wo.fn_wo_id} <ExternalLink size={10}/>
              </a>
            : <span className={styles.woIdNone}>No FN ID</span>
          }
        </div>
        {wo.fn_title && <div className={styles.woTitle}>{wo.fn_title}</div>}
        {wo.assigned_tech && (
          <div className={styles.woTech}>
            👤 {wo.assigned_tech}
            {wo.provider_id && <span className={styles.woProviderId}>ID: {wo.provider_id}</span>}
          </div>
        )}
        {wo.scheduled_date && <div className={styles.woDate}>📅 {new Date(String(wo.scheduled_date).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', {weekday:'short',month:'short',day:'numeric'})}</div>}
      </div>
      <div className={styles.woRight}>
        <span className={styles.woStatus} style={{background:`${sm.color}18`,color:sm.color,borderColor:`${sm.color}30`}}>
          {sm.label}
        </span>
        {wo.budget && <span className={styles.woBudget}>${wo.budget}</span>}
      </div>
    </div>
  )
}
