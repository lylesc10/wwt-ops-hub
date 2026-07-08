import { useState } from 'react'
import { getToken } from '@/lib/dab'
import { RefreshCw, Check, AlertTriangle, ExternalLink, Play } from 'lucide-react'
import styles from './FNTestPanel.module.css'

const ACTIONS = [
  { id:'auth',           label:'Test Auth',       desc:'Get OAuth token from FN',         params:[] },
  { id:'company',        label:'Get Company',      desc:'Fetch your company profile',       params:[] },
  { id:'list_wos',       label:'List Work Orders', desc:'Fetch first 10 WOs',              params:[{key:'status',label:'Status',placeholder:'e.g. published (optional)'}] },
  { id:'get_wo',         label:'Get Work Order',   desc:'Fetch specific WO by ID',          params:[{key:'wo_id',label:'WO ID',placeholder:'e.g. 12345',required:true}] },
  { id:'list_providers', label:'List Providers',   desc:'Search available providers',       params:[{key:'state',label:'State',placeholder:'e.g. OH (optional)'}] },
  { id:'create_wo',      label:'Create Test WO',   desc:'Push a test WO to FN sandbox',    params:[
    {key:'title',label:'Title',placeholder:'TEST-001-LVL(1)'},
    {key:'location_name',label:'Location Name',placeholder:'Test Branch'},
    {key:'address',label:'Address',placeholder:'123 Main St'},
    {key:'city',label:'City',placeholder:'Columbus'},
    {key:'state',label:'State',placeholder:'OH'},
    {key:'zip',label:'ZIP',placeholder:'43215'},
    {key:'budget',label:'Budget ($)',placeholder:'150'},
    {key:'project_id',label:'FN Project ID',placeholder:'optional'},
  ]},
]

export function FNTestPanel() {
  const [activeAction, setActiveAction] = useState('auth')
  const [params,       setParams]       = useState({})
  const [running,      setRunning]      = useState(false)
  const [result,       setResult]       = useState(null)
  const action = ACTIONS.find(a => a.id === activeAction)

  const run = async () => {
    setRunning(true); setResult(null)
    try {
      const res = await fetch('/api/fn/test', { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${getToken()??''}`}, body:JSON.stringify({ action:activeAction, params }) })
      setResult(await res.json())
    } catch(e) { setResult({ ok:false, error:e.message }) }
    setRunning(false)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}><span className={styles.title}>FieldNation Integration Test</span><span className={styles.badge}>Sandbox</span></div>
      <div className={styles.actions}>
        {ACTIONS.map(a => (
          <button key={a.id} className={`${styles.actionBtn} ${activeAction===a.id?styles.actionBtnActive:''}`}
            onClick={() => { setActiveAction(a.id); setParams({}); setResult(null) }}>{a.label}</button>
        ))}
      </div>
      <div className={styles.body}>
        <div className={styles.section}>
          <div className={styles.sectionLabel}>{action?.desc}</div>
          {action?.params.length > 0 && (
            <div className={styles.paramGrid}>
              {action.params.map(p => (
                <div key={p.key} className={styles.paramField}>
                  <label>{p.label}{p.required?' *':''}</label>
                  <input className={styles.input} placeholder={p.placeholder} value={params[p.key]??''} onChange={e => setParams(prev=>({...prev,[p.key]:e.target.value}))}/>
                </div>
              ))}
            </div>
          )}
          <button className={styles.runBtn} onClick={run} disabled={running}>
            {running ? <><RefreshCw size={13} className={styles.spin}/>Running…</> : <><Play size={13}/>Run</>}
          </button>
        </div>
        {result && (
          <div className={`${styles.result} ${result.ok?styles.resultOk:styles.resultErr}`}>
            <div className={styles.resultHeader}>
              {result.ok ? <><Check size={13}/>{result.action} — {result.ms}ms</> : <><AlertTriangle size={13}/>{result.action} failed</>}
              {result.endpoint && <span className={styles.endpoint}>{result.base_url}{result.endpoint}</span>}
            </div>
            {result.ok && result.result && <pre className={styles.resultJson}>{JSON.stringify(result.result,null,2)}</pre>}
            {!result.ok && <div className={styles.errorMsg}>{result.error}</div>}
            {result.result?.url && <a href={result.result.url} target="_blank" rel="noreferrer" className={styles.woLink}><ExternalLink size={11}/>View in FN Sandbox</a>}
          </div>
        )}
      </div>
    </div>
  )
}
