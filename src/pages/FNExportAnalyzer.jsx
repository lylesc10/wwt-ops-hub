import { useState, useEffect, useCallback } from 'react'
import { dab, getToken } from '@/lib/dab'
import { PageHeader } from '@/components/PageHeader'
import {
  Upload, RefreshCw, Cpu, Check, AlertTriangle,
  ChevronDown, Phone, Database, Clock
} from 'lucide-react'
import styles from './FNExportAnalyzer.module.css'

const JOB_COLORS = {
  LVL:'#6366f1',LVT:'#3b82f6',LVV:'#8b5cf6',
  INL:'#10b981',INT:'#06b6d4',INS:'#14b8a6',
  DEL:'#f59e0b',BRK:'#a855f7',OTHER:'#6b7280',
}
const STATUS_COLORS = {
  Completed:'var(--green)',Assigned:'var(--blue)',Confirmed:'var(--blue)',
  Cancelled:'var(--red)',Draft:'var(--text-muted)',Published:'var(--amber)',
  Routed:'var(--amber)',Unknown:'var(--text-muted)',
}

function fmt(d) {
  if (!d) return '—'
  try { return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}) } catch { return d }
}

export default function FNExportAnalyzer() {
  const [processing,  setProcessing]  = useState(false)
  const [loadingDB,   setLoadingDB]   = useState(false)
  const [result,      setResult]      = useState(null)
  const [error,       setError]       = useState('')
  const [search,      setSearch]      = useState('')
  const [expanded,    setExpanded]    = useState(null)
  const [sortBy,      setSortBy]      = useState('completed')
  const [statusFilter,setStatusFilter]= useState('all')
  const [typeFilter,  setTypeFilter]  = useState('all')
  const [batches,     setBatches]     = useState([])
  const [selectedJob, setSelectedJob]  = useState(null)

  // Load upload history
  useEffect(() => {
    dab.from('fn_upload_batches').select('*').order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setBatches(data ?? []))
  }, [])

  // Load from DB without re-uploading
  const loadFromDB = useCallback(async () => {
    setLoadingDB(true); setError('')
    try {
      const res = await fetch('/api/ai/load-fn-history', {
        method:'POST',
        headers:{'Content-Type':'application/json', Authorization:`Bearer ${getToken()??''}`},
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? `Error ${res.status}`)
      setResult(data)
    } catch(e) { setError(e.message) }
    setLoadingDB(false)
  }, [])

  const handleFiles = async (files) => {
    if (!files?.length) return
    setError(''); setResult(null); setProcessing(true)

    try {
      const XLSX = await import('xlsx')
      const token = getToken()
      let lastResult = null

      for (const file of Array.from(files)) {
        const buf  = await file.arrayBuffer()
        const wb   = XLSX.read(buf, {type:'array',cellDates:false,raw:false})
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:null,raw:false})
        if (!rows.length) { setError(`No data rows in ${file.name}`); continue }

        const res = await fetch('/api/ai/analyze-fn-export', {
          method:'POST',
          headers:{'Content-Type':'application/json', Authorization:`Bearer ${token??''}`},
          body: JSON.stringify({ rows, fileName: file.name }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message ?? `Error ${res.status}`)
        lastResult = data
      }

      if (lastResult) setResult(lastResult)

      const { data: newBatches } = await dab.from('fn_upload_batches').select('*').order('created_at', { ascending: false }).limit(10)
      setBatches(newBatches ?? [])
    } catch(e) { setError(e.message) }
    setProcessing(false)
  }

  const sorted = (result?.techs ?? [])
    .filter(t => {
      if (search) {
        const q = search.toLowerCase()
        if (!t.name.toLowerCase().includes(q) && !(t.phone??'').includes(q) && !(t.provider_id??'').includes(q) && !(t.states??[]).some(s=>s.toLowerCase().includes(q))) return false
      }
      if (statusFilter !== 'all' && !(t.statuses?.[statusFilter] > 0)) return false
      if (typeFilter === 'LV'  && t.lv_count  === 0) return false
      if (typeFilter === 'INS' && t.ins_count  === 0) return false
      if (typeFilter === 'DEL' && t.del_count  === 0) return false
      return true
    })
    .sort((a,b) => {
      if (sortBy==='completed') return b.completed - a.completed
      if (sortBy==='total')     return b.total     - a.total
      if (sortBy==='lv')        return b.lv_count  - a.lv_count
      if (sortBy==='ins')       return b.ins_count - a.ins_count
      if (sortBy==='pay')       return b.total_pay - a.total_pay
      if (sortBy==='rate')      return b.completion_rate - a.completion_rate
      return a.name.localeCompare(b.name)
    })

  const s = result?.summary

  return (
    <div className={styles.page}>
      <PageHeader title="FN Analyzer" subtitle="Tech performance by job type — deduplicated across uploads"/>

      <div className={styles.body}>

        {/* Upload + history panel */}
        <div className={styles.topRow}>
          {/* Upload zone */}
          <label className={styles.dropZone}>
            <input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}}
              multiple onChange={e => e.target.files.length && handleFiles(e.target.files)}/>
            {processing
              ? <><Cpu size={20} style={{color:'var(--accent)'}} className={styles.pulse}/><span className={styles.dropLabel}>AI analyzing…</span><span className={styles.dropHint}>Deduplicating against existing data</span></>
              : <><Upload size={20} style={{color:'var(--accent)'}}/><span className={styles.dropLabel}>Upload FN export(s)</span><span className={styles.dropHint}>Select one or multiple files — dupes skipped automatically</span></>
            }
          </label>

          {/* Load from DB */}
          <button className={styles.loadBtn} onClick={loadFromDB} disabled={loadingDB}>
            {loadingDB
              ? <><RefreshCw size={14} className={styles.spin}/>Loading…</>
              : <><Database size={14}/>Load Existing Data</>}
          </button>

          {/* Upload history */}
          {batches.length > 0 && (
            <div className={styles.batchList}>
              <div className={styles.batchTitle}><Clock size={11}/> Upload History</div>
              {batches.map(b => (
                <div key={b.id} className={styles.batchRow}>
                  <span className={styles.batchFile}>{b.file_name}</span>
                  <span className={styles.batchNew}>+{b.new_rows} new</span>
                  {b.skipped_rows > 0 && <span className={styles.batchSkipped}>{b.skipped_rows} skipped</span>}
                  <span className={styles.batchDate}>{new Date(b.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upload result banner */}
        {result?.upload && (
          <div className={`${styles.uploadBanner} ${result.upload.new_rows === 0 ? styles.uploadBannerWarn : styles.uploadBannerNew}`}>
            <Check size={13}/>
            <strong>{result.upload.new_rows} new</strong>
            {result.upload.updated_rows > 0 && <span>· {result.upload.updated_rows} updated</span>}
            {result.upload.skipped_no_name > 0 && <span>· {result.upload.skipped_no_name} skipped (no name)</span>}
            <span>· {result.upload.total_stored} stored of {result.upload.total_in_file} rows</span>
            {result.upload.unassigned_wos > 0 && <span>· {result.upload.unassigned_wos} unassigned (Draft/no provider)</span>}
            {result.column_map?.provider_name && <span className={styles.uploadNote}>Name col: &quot;{result.column_map.provider_name}&quot;</span>}
            {result.errors?.length > 0 && <span style={{color:'var(--red)'}}>⚠ {result.errors[0]}</span>}
            <span className={styles.uploadNote}>All stats reflect full DB history</span>
          </div>
        )}

        {error && <div className={styles.error}><AlertTriangle size={12}/>{error}</div>}

        {result && <>
          {/* Summary */}
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryCardTitle}>Volume</div>
              <div className={styles.chips}>
                <Chip label="Techs"     value={s.unique_techs}   />
                <Chip label="Total WOs" value={s.total_jobs}     />
                <Chip label="Completed" value={s.total_completed} color="var(--green)"/>
                <Chip label="Cancelled" value={s.total_cancelled} color="var(--red)"/>
                <Chip label="Assigned"  value={s.total_assigned}  color="var(--blue)"/>
                <Chip label="Draft"     value={s.total_draft}     color="var(--text-muted)"/>
                {s.total_pay > 0 && <Chip label="Total Paid" value={`$${s.total_pay.toLocaleString()}`} color="var(--amber)"/>}
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryCardTitle}>By Category</div>
              <div className={styles.catBars}>
                <CatBar label="Low Voltage" count={s.total_lv}  total={s.total_jobs} color="#6366f1" desc="LVL · LVT · LVV"/>
                <CatBar label="Installation" count={s.total_ins} total={s.total_jobs} color="#10b981" desc="INL · INT · INS"/>
                <CatBar label="Delivery/BRK" count={s.total_del} total={s.total_jobs} color="#f59e0b" desc="DEL · BRK"/>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryCardTitle}>By Job Type</div>
              <div className={styles.typeBreakdown}>
                {s.job_types.slice(0,8).map(({type,count}) => (
                  <div key={type} className={styles.typeRow}>
                    <span className={styles.typeTag} style={{color:JOB_COLORS[type]??'#6b7280'}}>{type}</span>
                    <div className={styles.typeTrack}><div className={styles.typeFill} style={{width:`${Math.round((count/s.total_jobs)*100)}%`,background:JOB_COLORS[type]??'#6b7280'}}/></div>
                    <span className={styles.typeCount}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className={styles.filterBar}>
            <input className={styles.search} placeholder="Search name, phone, FN ID, state…" value={search} onChange={e=>setSearch(e.target.value)}/>
            <select className={styles.sel} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
              <option value="all">All Types</option>
              <option value="LV">Low Voltage</option>
              <option value="INS">Installation</option>
              <option value="DEL">Delivery / BRK</option>
            </select>
            <select className={styles.sel} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              {s.statuses.map(({status})=><option key={status} value={status}>{status}</option>)}
            </select>
            <select className={styles.sel} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
              <option value="completed">Most Completed</option>
              <option value="total">Most Total</option>
              <option value="lv">Most LV</option>
              <option value="ins">Most Install</option>
              <option value="pay">Highest Pay</option>
              <option value="rate">Completion Rate</option>
              <option value="name">Name A-Z</option>
            </select>
            <span className={styles.count}>{sorted.length} techs</span>
          </div>

          {/* Tech cards */}
          <div className={styles.techList}>
            {sorted.map(tech => {
              const isExp = expanded === tech.name
              return (
                <div key={tech.name} className={styles.techCard}>
                  <div className={styles.techHeader} onClick={()=>setExpanded(isExp?null:tech.name)}>
                    <div className={styles.techAvatar}>{tech.name.split(' ').map(w=>w[0]).slice(0,2).join('')}</div>

                    <div className={styles.techIdentity}>
                      <div className={styles.techName}>{tech.name}</div>
                      <div className={styles.techMeta}>
                        {tech.phone && <a href={`tel:${tech.phone}`} className={styles.metaItem} onClick={e=>e.stopPropagation()}><Phone size={9}/>{tech.phone}</a>}
                        {tech.provider_id && <span className={styles.metaItem}>FN #{tech.provider_id}</span>}
                        {tech.states.length>0 && <span className={styles.metaItem}>{tech.states.slice(0,5).join(', ')}{tech.states.length>5?'…':''}</span>}
                      </div>
                    </div>

                    {/* LV / Install / Del split */}
                    <div className={styles.catPills}>
                      {tech.lv_count >0 && <CatPill label="LV"  count={tech.lv_count}  color="#6366f1"/>}
                      {tech.ins_count>0 && <CatPill label="Install" count={tech.ins_count} color="#10b981"/>}
                      {tech.del_count>0 && <CatPill label="Del" count={tech.del_count} color="#f59e0b"/>}
                    </div>

                    {/* Status breakdown */}
                    <div className={styles.statusPills}>
                      {Object.entries(tech.statuses).sort(([,a],[,b])=>b-a).map(([status,count])=>(
                        <span key={status} className={styles.statusPill}
                          style={{color:STATUS_COLORS[status]??'var(--text-muted)',background:`${STATUS_COLORS[status]??'#6b7280'}18`,borderColor:`${STATUS_COLORS[status]??'#6b7280'}35`}}>
                          {status} {count}
                        </span>
                      ))}
                    </div>

                    {/* Pay + rate */}
                    <div className={styles.techPayRate}>
                      {tech.total_pay>0 && <span className={styles.payAmt}>${tech.total_pay.toLocaleString()}</span>}
                      <div className={styles.rateBar}>
                        <div className={styles.rateFill} style={{width:`${tech.completion_rate}%`,background:tech.completion_rate>=90?'var(--green)':tech.completion_rate>=70?'var(--amber)':'var(--red)'}}/>
                      </div>
                      <span className={styles.rateNum}>{tech.completion_rate}%</span>
                    </div>

                    <ChevronDown size={13} className={`${styles.chevron} ${isExp?styles.chevronOpen:''}`}/>
                  </div>

                  {/* Job drill-down */}
                  {isExp && (
                    <div className={styles.woList}>
                      {tech.jobs
                        .filter(j => j.status !== 'Draft')
                        .map((job, i) => (
                          <div key={i} className={styles.woListRow} onClick={()=>setSelectedJob(job)}>
                            <span className={styles.woBadge} style={{color:JOB_COLORS[job.job_type]??'#6b7280',background:`${JOB_COLORS[job.job_type]??'#6b7280'}18`,borderColor:`${JOB_COLORS[job.job_type]??'#6b7280'}35`}}>{job.job_type}</span>
                            <span className={styles.woSite}>{job.site_name?.slice(0,50)??job.title?.slice(0,50)??'—'}</span>
                            <span className={styles.woStatus} style={{color:STATUS_COLORS[job.status]??'var(--text-muted)'}}>{job.status}</span>
                            <span className={styles.woDate}>{fmt(job.date)}</span>
                            <span className={styles.woPay}>{job.pay!=null?`$${job.pay}`:'—'}</span>
                          </div>
                        ))
                      }
                      {tech.draft > 0 && <div className={styles.woDraftNote}>{tech.draft} draft / unassigned not shown</div>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>}
      </div>
      {/* WO detail modal */}
      {selectedJob && (
        <div className={styles.modalOverlay} onClick={()=>setSelectedJob(null)}>
          <div className={styles.woModal} onClick={e=>e.stopPropagation()}>
            <div className={styles.woModalHeader}>
              <span className={styles.woBadge} style={{color:JOB_COLORS[selectedJob.job_type]??'#6b7280',background:`${JOB_COLORS[selectedJob.job_type]??'#6b7280'}18`,borderColor:`${JOB_COLORS[selectedJob.job_type]??'#6b7280'}35`,fontSize:13,padding:'4px 12px'}}>{selectedJob.job_type}</span>
              <span className={styles.woModalTitle}>{selectedJob.title?.slice(0,80)??'Work Order'}</span>
              <button className={styles.modalClose} onClick={()=>setSelectedJob(null)}>×</button>
            </div>
            <div className={styles.woModalBody}>
              <WODetail label="FN WO ID"   value={selectedJob.fn_wo_id?.startsWith('hash-') ? '—' : selectedJob.fn_wo_id} />
              <WODetail label="Status"     value={selectedJob.status} color={STATUS_COLORS[selectedJob.status]} />
              <WODetail label="Date"       value={fmt(selectedJob.date)} />
              <WODetail label="Pay"        value={selectedJob.pay!=null?`$${selectedJob.pay}`:selectedJob.rate!=null?`$${selectedJob.rate}/hr`:'—'} />
              <WODetail label="Location"   value={selectedJob.site_name?.slice(0,80)} />
              <WODetail label="City"       value={[selectedJob.city,selectedJob.state].filter(Boolean).join(', ')||null} />
              <WODetail label="Site Code"  value={selectedJob.site_code} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WODetail({ label, value, color }) {
  if (!value) return null
  return (
    <div className={styles.woDetailRow}>
      <span className={styles.woDetailLabel}>{label}</span>
      <span className={styles.woDetailValue} style={color?{color}:{}}>{value}</span>
    </div>
  )
}

function Chip({label,value,color}) {
  return (
    <div className={styles.chip}>
      <span className={styles.chipVal} style={{color:color??'var(--text-primary)'}}>{value}</span>
      <span className={styles.chipLabel}>{label}</span>
    </div>
  )
}
function CatBar({label,count,total,color,desc}) {
  const pct = total>0?Math.round((count/total)*100):0
  return (
    <div className={styles.catBar}>
      <div className={styles.catBarLabel}><span style={{color}}>{label}</span><span className={styles.catBarDesc}>{desc}</span></div>
      <div className={styles.catBarTrack}><div className={styles.catBarFill} style={{width:`${pct}%`,background:color}}/></div>
      <span className={styles.catBarCount}>{count}</span>
    </div>
  )
}
function CatPill({label,count,color}) {
  return (
    <div className={styles.catPill} style={{color,background:`${color}18`,borderColor:`${color}30`}}>
      <span className={styles.catPillNum}>{count}</span>{label}
    </div>
  )
}
