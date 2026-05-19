import { useDashboard } from '@/hooks/useDashboard'
import { useAlerts } from '@/hooks/useAlerts'
import { format } from 'date-fns'
import { RefreshCw, AlertTriangle, CheckCircle, Users, Calendar, TrendingUp, MapPin, BarChart2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import styles from './Dashboard.module.css'

const STATUS_META = {
  completed:           { label: 'Completed',    color: 'var(--green)' },
  in_progress:         { label: 'In Progress',  color: 'var(--blue)'  },
  staffed:             { label: 'Staffed',       color: '#a855f7'      },
  scheduled:           { label: 'Scheduled',     color: 'var(--amber)' },
  cancelled:           { label: 'Cancelled',     color: 'var(--text-muted)' },
  flagged_date_change: { label: 'Date Flagged',  color: 'var(--red)'   },
  flagged_payment:     { label: 'Pmt Flag',      color: 'var(--red)'   },
  not_started:         { label: 'Not Started',   color: 'var(--text-muted)' },
}

export default function Dashboard() {
  const { data, loading, refetch } = useDashboard()
  const { count: alertCount } = useAlerts()
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className={styles.loading}>
        <RefreshCw size={18} className={styles.spin} />
        <span>Loading dashboard…</span>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles.loading}>
        <AlertTriangle size={18} style={{color:'var(--red)'}}/>
        <span>Dashboard failed to load. <button style={{background:'none',border:'none',color:'var(--accent)',cursor:'pointer',textDecoration:'underline'}} onClick={refetch}>Retry</button></span>
      </div>
    )
  }

  const {
    total, completed, completionPct, unstaffed, withFNWO, noDate,
    weeklyData, thisWeek, nextWeek, topStates, fstBreakdown,
    statusCounts, activeAlerts, dateChanges, lastUpdated,
  } = data

  const weekMax = Math.max(...weeklyData.map(w => w.total), 1)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Operations Dashboard</h1>
          <p className={styles.subtitle}>
            WWT Field Services · PNC LVV Remediation
            <span className={styles.updatedAt}> · updated {format(lastUpdated, 'h:mm a')}</span>
          </p>
        </div>
        <button className={styles.refreshBtn} onClick={refetch}><RefreshCw size={13} /></button>
      </div>

      <div className={styles.body}>

        {/* KPI chips */}
        <div className={styles.kpiRow}>
          <KPI label="Total Sites"   value={total}           color="var(--text-primary)" onClick={() => navigate('/sites')} />
          <KPI label="Completed"     value={completed}       color="var(--green)"        sub={`${completionPct}%`} onClick={() => navigate('/sites')} />
          <KPI label="This Week"     value={thisWeek.length} color="var(--amber)"        sub={`${thisWeek.filter(s=>s.onsite_tech).length} staffed`} onClick={() => navigate('/routes')} />
          <KPI label="Next Week"     value={nextWeek.length} color="var(--blue)"         sub={`${nextWeek.filter(s=>s.onsite_tech).length} staffed`} onClick={() => navigate('/routes')} />
          <KPI label="Unstaffed"     value={unstaffed}       color={unstaffed > 10 ? 'var(--red)' : 'var(--amber)'} sub="active" onClick={() => navigate('/sites')} />
          <KPI label="No Date"       value={noDate}          color={noDate > 20 ? 'var(--red)' : 'var(--text-muted)'} sub="TBD" />
          <KPI label="Alerts"        value={activeAlerts}    color={activeAlerts > 0 ? 'var(--red)' : 'var(--green)'} onClick={() => navigate('/alerts')} />
          <KPI label="WOs in FN"     value={withFNWO}        color="var(--blue)"         sub={`of ${total}`} onClick={() => navigate('/work-orders')} />
        </div>

        <div className={styles.mainGrid}>

          {/* Status breakdown */}
          <div className={styles.card}>
            <div className={styles.cardHead}><BarChart2 size={13}/><span>Status Breakdown</span></div>
            <div className={styles.statusLayout}>
              <CompletionRing pct={completionPct} completed={completed} total={total} />
              <div className={styles.statusBars}>
                {Object.entries(statusCounts).sort(([,a],[,b])=>b-a).map(([status,count])=>{
                  const meta = STATUS_META[status] ?? {label:status,color:'var(--text-muted)'}
                  const pct  = Math.round((count/total)*100)
                  return (
                    <div key={status} className={styles.statusBarRow}>
                      <span className={styles.statusLabel}>{meta.label}</span>
                      <div className={styles.statusTrack}>
                        <div className={styles.statusFill} style={{width:`${pct}%`,background:meta.color}}/>
                      </div>
                      <span className={styles.statusCount}>{count}</span>
                      <span className={styles.statusPct}>{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Weekly chart */}
          <div className={styles.card} style={{gridColumn:'span 2'}}>
            <div className={styles.cardHead}><TrendingUp size={13}/><span>Weekly Schedule</span><span className={styles.cardSub}>8-week window</span></div>
            <div className={styles.weekChart}>
              {weeklyData.map((wk,i) => (
                <div key={i} className={`${styles.weekCol} ${wk.isNow?styles.weekColNow:''}`}>
                  <div className={styles.weekColInner}>
                    <div className={styles.weekColBg}   style={{height:`${(wk.total/weekMax)*100}%`,opacity:0.25}}/>
                    <div className={styles.weekColDone} style={{height:`${(wk.completed/weekMax)*100}%`}}/>
                  </div>
                  <span className={styles.weekColNum}>{wk.total||''}</span>
                  <span className={styles.weekColDate}>{wk.week}</span>
                  <span className={styles.weekColWk}>{wk.label}</span>
                </div>
              ))}
            </div>
            <div className={styles.weekLegend}>
              <span className={styles.legendDot} style={{background:'var(--green)'}}/>Completed
              <span className={styles.legendDot} style={{background:'var(--amber)',marginLeft:14}}/>Scheduled
            </div>
          </div>

          {/* States */}
          <div className={styles.card}>
            <div className={styles.cardHead}><MapPin size={13}/><span>By State</span><span className={styles.cardSub}>top {topStates.length}</span></div>
            <div className={styles.stateList}>
              {topStates.map(({state,count,completed:c,pct}) => (
                <div key={state} className={styles.stateRow}>
                  <span className={styles.stateCode}>{state}</span>
                  <div className={styles.stateTrack}>
                    <div className={styles.stateBg}   style={{width:`${pct}%`}}/>
                    <div className={styles.stateDone} style={{width:`${Math.round((c/count)*pct)}%`}}/>
                  </div>
                  <span className={styles.stateNum}>{count}</span>
                  <span className={styles.stateDoneNum}>{c}✓</span>
                </div>
              ))}
            </div>
          </div>

          {/* FST */}
          <div className={styles.card}>
            <div className={styles.cardHead}><Users size={13}/><span>By FST Owner</span></div>
            <div className={styles.fstList}>
              {fstBreakdown.map(({fst,total:t,completed:c,unstaffed:u,pct}) => (
                <div key={fst} className={styles.fstRow}>
                  <span className={styles.fstName}>{fst==='Unassigned'?<span className={styles.fstUnass}>Unassigned</span>:fst}</span>
                  <div className={styles.fstTrack}><div className={styles.fstFill} style={{width:`${pct}%`}}/></div>
                  <span className={styles.fstNum}>{t}</span>
                  <span className={styles.fstDone}>{c}✓</span>
                  {u>0&&<span className={styles.fstWarn}>{u}⚠</span>}
                </div>
              ))}
            </div>
          </div>

          {/* This week spotlight */}
          <div className={styles.card}>
            <div className={styles.cardHead}><Calendar size={13}/><span>This Week</span><span className={styles.cardSub}>{thisWeek.length} sites</span><button className={styles.cardLink} onClick={()=>navigate('/routes')}>Routes →</button></div>
            {thisWeek.length===0
              ? <p className={styles.empty}>No sites scheduled this week</p>
              : <div className={styles.spotList}>
                  {thisWeek.slice(0,8).map(s=>(
                    <div key={s.id} className={styles.spotRow}>
                      <span className={styles.spotCode}>{s.code}</span>
                      <span className={styles.spotState}>{s.state}</span>
                      <span className={s.onsite_tech?styles.spotGreen:styles.spotAmber}>{s.onsite_tech?'✓ staffed':'⚠ open'}</span>
                    </div>
                  ))}
                  {thisWeek.length>8&&<p className={styles.more}>+{thisWeek.length-8} more</p>}
                </div>
            }
          </div>

          {/* Alerts */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <AlertTriangle size={13}/>
              <span>Active Alerts</span>
              {activeAlerts>0&&<span className={styles.alertBadge}>{activeAlerts}</span>}
              <button className={styles.cardLink} onClick={()=>navigate('/alerts')}>View all →</button>
            </div>
            {activeAlerts===0
              ? <div className={styles.allClear}><CheckCircle size={20} style={{color:'var(--green)',marginBottom:6}}/><p>All clear</p></div>
              : <div className={styles.alertRows}>
                  {dateChanges>0&&<AlertRow icon="📅" label="Date changes"   count={dateChanges}           onClick={()=>navigate('/alerts')}/>}
                  {data.cancellations>0&&<AlertRow icon="✕" label="Cancellations" count={data.cancellations} onClick={()=>navigate('/alerts')}/>}
                  {unstaffed>0&&<AlertRow icon="👤" label="Unstaffed sites" count={unstaffed}              onClick={()=>navigate('/sites')}/>}
                  {noDate>0&&<AlertRow icon="📋" label="TBD dates"        count={noDate}                onClick={()=>navigate('/sites')}/>}
                </div>
            }
          </div>

        </div>
      </div>
    </div>
  )
}

function KPI({ label, value, color, sub, onClick }) {
  return (
    <div className={`${styles.kpi} ${onClick?styles.kpiLink:''}`} onClick={onClick}>
      <div className={styles.kpiVal} style={{color}}>{value}</div>
      <div className={styles.kpiLabel}>{label}</div>
      {sub&&<div className={styles.kpiSub}>{sub}</div>}
    </div>
  )
}

function AlertRow({ icon, label, count, onClick }) {
  return (
    <div className={styles.alertRow} onClick={onClick}>
      <span className={styles.alertIcon}>{icon}</span>
      <span className={styles.alertLabel}>{label}</span>
      <span className={styles.alertCount}>{count}</span>
    </div>
  )
}

function CompletionRing({ pct, completed, total }) {
  const r = 48, cx = 60, cy = 60
  const circ  = 2 * Math.PI * r
  const dash  = (pct / 100) * circ
  return (
    <svg width={120} height={120} viewBox="0 0 120 120" style={{flexShrink:0}}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth={10}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--green)" strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ-dash}`}
        strokeDashoffset={circ/4}
        style={{transition:'stroke-dasharray 0.6s ease'}}
      />
      <text x={cx} y={cy-4}  textAnchor="middle" fill="var(--text-primary)" fontSize={20} fontWeight={800} fontFamily="var(--font-head)">{pct}%</text>
      <text x={cx} y={cy+12} textAnchor="middle" fill="var(--text-muted)"   fontSize={9}  fontFamily="var(--font-mono)">COMPLETE</text>
      <text x={cx} y={cy+24} textAnchor="middle" fill="var(--text-muted)"   fontSize={9}  fontFamily="var(--font-mono)">{completed}/{total}</text>
    </svg>
  )
}
