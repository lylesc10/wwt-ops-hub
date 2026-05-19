import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import { Phone, MapPin, TrendingUp, RefreshCw, Search, X, ChevronRight } from 'lucide-react'
import styles from './TechAnalysis.module.css'

const JOB_COLORS = {
  LVL:'#6366f1',LVT:'#3b82f6',LVV:'#8b5cf6',
  INL:'#10b981',INT:'#06b6d4',INS:'#14b8a6',
  DEL:'#f59e0b',BRK:'#a855f7',WRK:'#f97316',
  SEC:'#ec4899',SRV:'#6b7280',UXI:'#14b8a6',OTHER:'#6b7280',
}
const STATUS_COLORS = {
  Completed:'var(--green)',Assigned:'var(--blue)',Confirmed:'var(--blue)',
  Cancelled:'var(--red)',Draft:'var(--text-muted)',Published:'var(--amber)',
  Routed:'var(--amber)',Unknown:'var(--text-muted)',
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt(d) {
  if (!d) return '—'
  try { return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}) }
  catch { return d }
}

function reliabilityScore(rate, total, lastDate) {
  const vol     = Math.min(total/20,1)*20
  const recency = lastDate ? Math.max(0,20-Math.floor((Date.now()-new Date(lastDate+'T12:00:00'))/(864e5*30))) : 0
  return Math.round(rate*0.6+vol+recency)
}

function reliabilityLabel(score) {
  if (score>=85) return {label:'Excellent',color:'var(--green)'}
  if (score>=70) return {label:'Good',     color:'var(--blue)'}
  if (score>=50) return {label:'Fair',     color:'var(--amber)'}
  return              {label:'Low',      color:'var(--red)'}
}

export default function TechAnalysis() {
  const [allRows,    setAllRows]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [stateFilter,setStateFilter]= useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortBy,     setSortBy]     = useState('reliability')
  const [selected,   setSelected]   = useState(null)
  const [popout,     setPopout]     = useState(null) // WO being previewed

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('fn_work_history')
      .select('*')
      .not('provider_name','is',null)   // only assigned WOs for tech profiles
      .order('work_date',{ascending:false})
    setAllRows(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Build tech profiles
  const techs = useMemo(() => {
    const map = new Map()
    for (const row of allRows) {
      const name = row.provider_name
      if (!name) continue
      if (!map.has(name)) map.set(name,{
        name, provider_id:row.provider_id, phone:row.provider_phone,
        jobs:[], job_types:{}, statuses:{}, states:new Set(),
        total_pay:0, lv:0, ins:0, del:0, other:0,
        monthly:{}, last_date:null, first_date:null,
      })
      const t = map.get(name)
      if (!t.provider_id&&row.provider_id) t.provider_id=row.provider_id
      if (!t.phone&&row.provider_phone)    t.phone=row.provider_phone
      const cat=row.wo_category??'OTHER'
      if(cat==='LV')t.lv++;else if(cat==='INSTALL')t.ins++;else if(cat==='DELIVERY')t.del++;else t.other++
      t.job_types[row.wo_type]=(t.job_types[row.wo_type]??0)+1
      t.statuses[row.status]=(t.statuses[row.status]??0)+1
      if(row.site_state)t.states.add(row.site_state)
      if(row.total_pay)t.total_pay+=row.total_pay
      if(row.work_date){
        if(!t.last_date||row.work_date>t.last_date) t.last_date=row.work_date
        if(!t.first_date||row.work_date<t.first_date) t.first_date=row.work_date
        const ym=row.work_date.slice(0,7)
        if(!t.monthly[ym]) t.monthly[ym]={count:0,completed:0,pay:0}
        t.monthly[ym].count++
        if(row.status==='Completed')t.monthly[ym].completed++
        if(row.total_pay)t.monthly[ym].pay+=row.total_pay
      }
      t.jobs.push(row)
    }
    return Array.from(map.values()).map(t=>{
      const completed=t.statuses['Completed']??0
      const cancelled=t.statuses['Cancelled']??0
      const total=t.jobs.length
      const rate=total>0?Math.round((completed/total)*100):0
      const score=reliabilityScore(rate,total,t.last_date)
      return{...t,
        states:Array.from(t.states).sort(),total,completed,cancelled,
        assigned:(t.statuses['Assigned']??0)+(t.statuses['Confirmed']??0),
        draft:(t.statuses['Draft']??0)+(t.statuses['Published']??0)+(t.statuses['Routed']??0),
        completion_rate:rate,reliability_score:score,reliability:reliabilityLabel(score),
        total_pay:Math.round(t.total_pay*100)/100,
        avg_pay:total>0?Math.round(t.total_pay/total):0,
        jobs:t.jobs.sort((a,b)=>(b.work_date??'')>(a.work_date??'')?1:-1),
      }
    })
  },[allRows])

  const allStates = useMemo(()=>{const s=new Set();techs.forEach(t=>t.states.forEach(st=>s.add(st)));return Array.from(s).sort()},[techs])

  const filtered = useMemo(()=>techs
    .filter(t=>{
      if(search){const q=search.toLowerCase();if(!t.name.toLowerCase().includes(q)&&!(t.phone??'').includes(q)&&!(t.provider_id??'').includes(q)&&!t.states.some(s=>s.toLowerCase().includes(q)))return false}
      if(stateFilter!=='all'&&!t.states.includes(stateFilter))return false
      if(typeFilter==='LV'&&t.lv===0)return false
      if(typeFilter==='INS'&&t.ins===0)return false
      if(typeFilter==='DEL'&&t.del===0)return false
      return true
    })
    .sort((a,b)=>{
      if(sortBy==='reliability')return b.reliability_score-a.reliability_score
      if(sortBy==='completed')  return b.completed-a.completed
      if(sortBy==='total')      return b.total-a.total
      if(sortBy==='pay')        return b.total_pay-a.total_pay
      if(sortBy==='recent')     return(b.last_date??'')>(a.last_date??'')?1:-1
      return a.name.localeCompare(b.name)
    })
  ,[techs,search,stateFilter,typeFilter,sortBy])

  const tech = techs.find(t=>t.name===selected)

  // Chart data - last 12 months
  const chartData = useMemo(()=>{
    if(!tech)return[]
    const now=new Date()
    return Array.from({length:12},(_,i)=>{
      const d=new Date(now.getFullYear(),now.getMonth()-11+i,1)
      const ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      return{label:MONTHS[d.getMonth()],ym,...(tech.monthly[ym]??{count:0,completed:0,pay:0})}
    })
  },[tech])
  const chartMax=useMemo(()=>Math.max(...chartData.map(m=>m.count),1),[chartData])

  return (
    <div className={styles.page}>
      <PageHeader title="Tech Analysis"
        subtitle={`${techs.length} techs · ${allRows.length.toLocaleString()} work orders`}
        actions={<button className={styles.iconBtn} onClick={load} disabled={loading}><RefreshCw size={13} className={loading?styles.spin:''}/></button>}
      />

      <div className={styles.layout}>
        {/* ── Roster ── */}
        <div className={styles.roster}>
          <div className={styles.rosterFilters}>
            <div className={styles.searchWrap}>
              <Search size={11} className={styles.searchIcon}/>
              <input className={styles.search} placeholder="Name, phone, FN ID, state…" value={search} onChange={e=>setSearch(e.target.value)}/>
              {search&&<button className={styles.clearX} onClick={()=>setSearch('')}><X size={11}/></button>}
            </div>
            <div className={styles.filterRow}>
              <select className={styles.sel} value={stateFilter} onChange={e=>setStateFilter(e.target.value)}>
                <option value="all">All States</option>
                {allStates.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <select className={styles.sel} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
                <option value="all">All Types</option>
                <option value="LV">Low Voltage</option>
                <option value="INS">Installation</option>
                <option value="DEL">Delivery</option>
              </select>
              <select className={styles.sel} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
                <option value="reliability">Reliability</option>
                <option value="completed">Completed</option>
                <option value="total">Total WOs</option>
                <option value="pay">Pay</option>
                <option value="recent">Recent</option>
                <option value="name">Name</option>
              </select>
            </div>
          </div>

          <div className={styles.rosterList}>
            {loading ? <div className={styles.loading}><RefreshCw size={13} className={styles.spin}/> Loading…</div>
            : filtered.length===0 ? <div className={styles.empty}>No techs match</div>
            : filtered.map(t=>{
              const rel=t.reliability
              const active=selected===t.name
              return (
                <div key={t.name} className={`${styles.rosterRow} ${active?styles.rosterRowActive:''}`} onClick={()=>setSelected(active?null:t.name)}>
                  <div className={styles.rosterAvatar} style={{background:`${rel.color}18`,color:rel.color}}>
                    {t.name.split(' ').map(w=>w[0]).slice(0,2).join('')}
                  </div>
                  <div className={styles.rosterInfo}>
                    <div className={styles.rosterName}>{t.name}</div>
                    <div className={styles.rosterSub}>{t.states.slice(0,4).join(' · ')}{t.states.length>4?` +${t.states.length-4}`:''}</div>
                  </div>
                  <div className={styles.rosterStats}>
                    <div className={styles.rosterStat}><span style={{color:rel.color,fontSize:15,fontWeight:800,fontFamily:'var(--font-head)'}}>{t.reliability_score}</span><span className={styles.rosterStatL}>score</span></div>
                    <div className={styles.rosterStat}><span style={{fontSize:15,fontWeight:800,fontFamily:'var(--font-head)'}}>{t.completed}</span><span className={styles.rosterStatL}>done</span></div>
                    <div className={styles.rosterStat}><span style={{fontSize:13,fontWeight:700,fontFamily:'var(--font-head)'}}>{t.completion_rate}%</span><span className={styles.rosterStatL}>rate</span></div>
                  </div>
                  <div className={styles.rosterPips}>
                    {t.lv >0&&<span className={styles.pip} style={{background:'#6366f1'}} title={`LV: ${t.lv}`}/>}
                    {t.ins>0&&<span className={styles.pip} style={{background:'#10b981'}} title={`Install: ${t.ins}`}/>}
                    {t.del>0&&<span className={styles.pip} style={{background:'#f59e0b'}} title={`Del: ${t.del}`}/>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Profile ── */}
        {tech ? (
          <div className={styles.profile}>
            {/* Header */}
            <div className={styles.profileHead}>
              <div className={styles.profileAvatar} style={{background:`${tech.reliability.color}18`,color:tech.reliability.color}}>
                {tech.name.split(' ').map(w=>w[0]).slice(0,2).join('')}
              </div>
              <div className={styles.profileMeta}>
                <div className={styles.profileName}>{tech.name}</div>
                <div className={styles.profileContacts}>
                  {tech.phone&&<a href={`tel:${tech.phone}`} className={styles.contact}><Phone size={10}/>{tech.phone}</a>}
                  {tech.provider_id&&<span className={styles.contact}>FN #{tech.provider_id}</span>}
                </div>
                {tech.states.length>0&&<div className={styles.profileStates}><MapPin size={9}/>{tech.states.join(', ')}</div>}
              </div>
              <div className={styles.scoreBlock}>
                <div className={styles.scoreNum} style={{color:tech.reliability.color}}>{tech.reliability_score}</div>
                <div className={styles.scoreLabel} style={{color:tech.reliability.color}}>{tech.reliability.label}</div>
              </div>
            </div>

            {/* KPIs */}
            <div className={styles.kpiRow}>
              {[
                ['Total',      tech.total,         null],
                ['Completed',  tech.completed,      'var(--green)'],
                ['Cancelled',  tech.cancelled,      'var(--red)'],
                ['Assigned',   tech.assigned,       'var(--blue)'],
                ['Rate',       tech.completion_rate+'%', tech.completion_rate>=90?'var(--green)':tech.completion_rate>=70?'var(--amber)':'var(--red)'],
                ['Total Paid', tech.total_pay>0?`$${tech.total_pay.toLocaleString()}`:'—', 'var(--amber)'],
                ['Avg/WO',     tech.avg_pay>0?`$${tech.avg_pay}`:'—', null],
                ['First Job',  fmt(tech.first_date), null],
                ['Last Job',   fmt(tech.last_date),  null],
              ].map(([label,value,color])=>(
                <div key={label} className={styles.kpi}>
                  <span className={styles.kpiVal} style={{color:color??'var(--text-primary)'}}>{value}</span>
                  <span className={styles.kpiLabel}>{label}</span>
                </div>
              ))}
            </div>

            {/* Type split */}
            <div className={styles.typeSplit}>
              {[
                {label:'Low Voltage', count:tech.lv,  color:'#6366f1', types:['LVL','LVT','LVV']},
                {label:'Installation',count:tech.ins, color:'#10b981', types:['INL','INT','INS']},
                {label:'Delivery/BRK',count:tech.del, color:'#f59e0b', types:['DEL','BKR','BRK']},
              ].map(({label,count,color,types})=>{
                if(!count)return null
                const pct=tech.total>0?Math.round((count/tech.total)*100):0
                const sub=types.filter(t=>tech.job_types[t]).map(t=>`${t}×${tech.job_types[t]}`).join(' · ')
                return(
                  <div key={label} className={styles.typeCard}>
                    <div className={styles.typeCardTop}>
                      <span style={{color,fontWeight:700,fontSize:12,fontFamily:'var(--font-mono)'}}>{label}</span>
                      <span style={{fontSize:20,fontWeight:800,fontFamily:'var(--font-head)'}}>{count}</span>
                    </div>
                    <div className={styles.typeBar}><div className={styles.typeBarFill} style={{width:`${pct}%`,background:color}}/></div>
                    <div className={styles.typeSub}>{sub||'—'}</div>
                  </div>
                )
              })}
            </div>

            {/* Activity chart */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Activity — Last 12 Months</div>
              <div className={styles.chart}>
                {chartData.map(m=>(
                  <div key={m.ym} className={styles.chartCol}>
                    <div className={styles.chartWrap}>
                      {m.count>0&&(
                        <div className={styles.chartBar} style={{height:`${Math.round((m.count/chartMax)*100)}%`}}
                          title={`${m.label}: ${m.count} WOs · ${m.completed} completed${m.pay>0?` · $${Math.round(m.pay)}`:''}`}>
                          <div className={styles.chartCompleted} style={{height:`${Math.round((m.completed/m.count)*100)}%`}}/>
                        </div>
                      )}
                    </div>
                    <div className={styles.chartLabel}>{m.label}</div>
                    {m.count>0&&<div className={styles.chartCount}>{m.count}</div>}
                  </div>
                ))}
              </div>
              <div className={styles.chartLegend}>
                <span className={styles.legendDot} style={{background:'var(--green)'}}/> Completed &nbsp;
                <span className={styles.legendDot} style={{background:'var(--border-strong)'}}/> Total
              </div>
            </div>

            {/* Work order list — clean, no clutter */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Work Orders ({tech.total})</div>
              <div className={styles.woList}>
                {tech.jobs.map((job,i)=>{
                  const color=JOB_COLORS[job.wo_type]??'#6b7280'
                  const sc=STATUS_COLORS[job.status]??'var(--text-muted)'
                  return(
                    <div key={i} className={styles.woRow} onClick={()=>setPopout(job)}>
                      <span className={styles.woBadge} style={{color,background:`${color}18`,borderColor:`${color}35`}}>{job.wo_type}</span>
                      <span className={styles.woTitle}>{job.site_name?.replace(/,.*$/,'').slice(0,35) || job.wo_title?.slice(0,35) || '—'}</span>
                      <span className={styles.woLoc}>{[job.site_city,job.site_state].filter(Boolean).join(', ')||'—'}</span>
                      <span className={styles.woStatus} style={{color:sc}}>{job.status}</span>
                      <span className={styles.woDate}>{fmt(job.work_date)}</span>
                      <span className={styles.woPay}>{job.total_pay!=null?`$${job.total_pay}`:'—'}</span>
                      <ChevronRight size={11} className={styles.woChev}/>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.noSel}>
            <TrendingUp size={32} style={{color:'var(--border-strong)',marginBottom:10}}/>
            <p>Select a tech to view their profile</p>
          </div>
        )}
      </div>

      {/* WO Popout */}
      {popout&&(
        <div className={styles.popoverOverlay} onClick={()=>setPopout(null)}>
          <div className={styles.popover} onClick={e=>e.stopPropagation()}>
            <div className={styles.popoverHead}>
              <span className={styles.woBadge} style={{color:JOB_COLORS[popout.wo_type]??'#6b7280',background:`${JOB_COLORS[popout.wo_type]??'#6b7280'}18`,borderColor:`${JOB_COLORS[popout.wo_type]??'#6b7280'}35`}}>
                {popout.wo_type}
              </span>
              <button className={styles.popoverClose} onClick={()=>setPopout(null)}><X size={14}/></button>
            </div>
            <div className={styles.popoverBody}>
              {popout.wo_title&&<div className={styles.popoverTitle}>{popout.wo_title}</div>}
              <div className={styles.popoverGrid}>
                {popout.fn_wo_id&&<Row label="WO ID"    value={popout.fn_wo_id}/>}
                {popout.status&&  <Row label="Status"   value={popout.status} color={STATUS_COLORS[popout.status]}/>}
                {popout.work_date&&<Row label="Date"    value={fmt(popout.work_date)}/>}
                {popout.total_pay!=null&&<Row label="Pay" value={`$${popout.total_pay}`} color="var(--amber)"/>}
                {popout.pay_rate!=null&&<Row label="Rate"  value={`$${popout.pay_rate}/hr`}/>}
                {popout.site_name&&<Row label="Location" value={popout.site_name}/>}
                {popout.site_city&&<Row label="City"    value={`${popout.site_city}${popout.site_state?`, ${popout.site_state}`:''}`}/>}
                {popout.provider_id&&<Row label="Provider ID" value={popout.provider_id}/>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({label,value,color}){
  return(
    <div className={styles.popoverRow}>
      <span className={styles.popoverLabel}>{label}</span>
      <span className={styles.popoverVal} style={{color:color??'var(--text-primary)'}}>{value}</span>
    </div>
  )
}
