import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useProjects } from '@/hooks/useProjects'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import {
  WO_TYPES, WO_DEFAULTS, WO_HEADERS, SITE_COLS, EMPTY_SITE,
  buildRows, toCSV, compressString, decompressString,
  rowComplete, isPastDate, triggerDownload,
} from '@/cpwog/engine'
import { parsePaste, parseCSVImport } from '@/cpwog/parsers'
import { Download, History, Route, Plus, X, Trash2, Check, ChevronDown, AlertTriangle, Loader, ExternalLink, ShieldAlert, BarChart2, RefreshCw, Send } from 'lucide-react'
import { useFNSync } from '@/hooks/useFNSync'
import { createWorkOrderDirect, deleteWorkOrderDirect, isFNConfigured, listClients } from '@/lib/fnDirect'
import styles from './WorkOrders.module.css'

const JOKES = [
  "Why did the field technician bring a ladder? Because the job was on another level.",
  "Why don't work orders ever get lonely? Because they always come in bundles.",
  "How many FieldNation techs does it take to change a lightbulb? One, but you have to submit a work order first.",
  "Why did the CSV file go to therapy? It had too many unresolved columns.",
  "The FieldNation upload failed. Turns out it was a CSV trauma response.",
]
const STEP_LABELS = ['Project Info', 'Add Sites', 'Review & Export']

export default function WorkOrders() {
  const { user } = useAuth()
  const [step,         setStep]         = useState(0)
  const [joke,         setJoke]         = useState(() => JOKES[0])
  const [projectId,    setProjectId]    = useState('')
  const [displayName,  setDisplayName]  = useState('')
  const [woType,       setWoType]       = useState('LVL')
  const [woConfig,     setWoConfig]     = useState({ ...WO_DEFAULTS.LVL })
  const [sites,        setSites]        = useState([EMPTY_SITE()])
  const [generating,   setGenerating]   = useState(false)
  const [includeDEL,   setIncludeDEL]   = useState(false)
  const [delConfig,    setDelConfig]    = useState({ ...WO_DEFAULTS.DEL })
  const [includeBRK,   setIncludeBRK]   = useState(false)
  const [brkConfig,    setBrkConfig]    = useState({ ...WO_DEFAULTS.BRK })
  const [pasteMode,    setPasteMode]    = useState(true)
  const [importMode,   setImportMode]   = useState(false)
  const [pasteText,    setPasteText]    = useState('')
  const [pasteError,   setPasteError]   = useState('')
  const [activeCell,   setActiveCell]   = useState({ row: 0, col: 0 })
  const [showHistory,  setShowHistory]  = useState(false)
  const [showRoute,    setShowRoute]    = useState(false)
  const [histSearch,   setHistSearch]   = useState('')
  const [jobHistory,   setJobHistory]   = useState([])
  const [tidHistory,   setTidHistory]   = useState({})
  const [showTidDD,    setShowTidDD]    = useState(false)
  const [showDelTidDD, setShowDelTidDD] = useState(false)
  const [showBrkTidDD, setShowBrkTidDD] = useState(false)
  const [pidHistory,   setPidHistory]   = useState([])
  const [dnHistory,    setDnHistory]    = useState([])
  const [showPidDD,    setShowPidDD]    = useState(false)
  const [showDnDD,     setShowDnDD]     = useState(false)
  const [customTypes,  setCustomTypes]  = useState({})
  const [deletedBuiltins, setDeletedBuiltins] = useState({})
  const [overriddenBuiltins, setOverriddenBuiltins] = useState({})
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [editingKey,   setEditingKey]   = useState(null)
  const [customForm,   setCustomForm]   = useState({ key:'',label:'',siteIdSuffix:'',numTechs:'1',numDays:'1',useBundle:false })
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  const [showAdminPw,  setShowAdminPw]  = useState(false)
  const [adminPwInput, setAdminPwInput] = useState('')
  const [clearConfirm, setClearConfirm] = useState(false)
  const [startOverConfirm, setStartOverConfirm] = useState(false)
  const [pendingTidLabel, setPendingTidLabel] = useState(null)
  const [tidLabelInput, setTidLabelInput] = useState('')
  const [activeTab, setActiveTab] = useState('generator')
  const { checking, dupeResults, checkDupes, clearDupes } = useFNSync()
  const [fnResults,  setFnResults]  = useState({})
  const [fnPushing,  setFnPushing]  = useState(false)
  const [fnClients,  setFnClients]  = useState([])
  const [fnClientId, setFnClientId] = useState('')
  const fileInputRef = useRef(null)
  const inputRefs = useRef({})
  const prevConfigRef = useRef(woConfig)

  const ALL_WO_TYPES = Object.fromEntries(
    Object.entries({ ...WO_TYPES, ...customTypes })
      .filter(([k]) => !deletedBuiltins[k])
      .map(([k, v]) => [k, overriddenBuiltins[k] ? { ...v, ...overriddenBuiltins[k] } : v])
  )

  useEffect(() => {
    if (isFNConfigured()) listClients().then(c => { setFnClients(c); if (c.length === 1) setFnClientId(String(c[0].id)) }).catch(()=>{})
    supabase.from('job_history').select('*').order('created_at',{ascending:false}).limit(100).then(({data})=>{if(data)setJobHistory(data)})
    supabase.from('template_id_history').select('data').eq('id',1).then(({data})=>{if(data?.[0]?.data)setTidHistory(data[0].data)})
    supabase.from('custom_wo_types').select('data').eq('id',1).then(({data})=>{
      if(!data?.[0]?.data)return
      const d=data[0].data
      if(d.custom)setCustomTypes(d.custom)
      if(d.deletedBuiltins)setDeletedBuiltins(d.deletedBuiltins)
      if(d.overriddenBuiltins)setOverriddenBuiltins(d.overriddenBuiltins)
    })
    supabase.from('project_history').select('project_ids,display_names').eq('id',1).then(({data})=>{
      if(!data?.[0])return
      if(data[0].project_ids)setPidHistory(data[0].project_ids)
      if(data[0].display_names)setDnHistory(data[0].display_names)
    })
  }, [])

  useEffect(() => {
    const prev = prevConfigRef.current
    setSites(s => s.map(site => {
      const updates = {}
      if(prev.numTechs!==woConfig.numTechs&&site.numTechs===prev.numTechs) updates.numTechs=woConfig.numTechs
      if(prev.numDays!==woConfig.numDays&&site.numDays===prev.numDays) updates.numDays=woConfig.numDays
      if(prev.defaultDate!==woConfig.defaultDate&&!site.dateOverridden) updates.date=woConfig.defaultDate||''
      return Object.keys(updates).length?{...site,...updates}:site
    }))
    prevConfigRef.current = woConfig
  }, [woConfig.numTechs, woConfig.numDays, woConfig.defaultDate])

  const saveTidHistory = (type, id, label='') => {
    if(!id?.trim())return
    setTidHistory(prev=>{
      const existing=prev[type]||[]
      const entry={id,label:label.trim()}
      const updated=[entry,...existing.filter(x=>(typeof x==='string'?x:x.id)!==id)].slice(0,10)
      const next={...prev,[type]:updated}
      supabase.from('template_id_history').upsert({id:1,data:next,updated_at:new Date().toISOString()})
      return next
    })
  }

  const savePidHistory = (id) => {
    if(!id?.trim())return
    setPidHistory(prev=>{
      const updated=[id,...prev.filter(x=>x!==id)].slice(0,15)
      supabase.from('project_history').upsert({id:1,project_ids:updated,updated_at:new Date().toISOString()})
      return updated
    })
  }

  const saveDnHistory = (name) => {
    if(!name?.trim())return
    setDnHistory(prev=>{
      const updated=[name,...prev.filter(x=>x!==name)].slice(0,15)
      supabase.from('project_history').upsert({id:1,display_names:updated,updated_at:new Date().toISOString()})
      return updated
    })
  }

  const persistWoTypes = (custom,deleted,overridden) => {
    supabase.from('custom_wo_types').upsert({id:1,data:{custom,deletedBuiltins:deleted,overriddenBuiltins:overridden},updated_at:new Date().toISOString()})
  }

  const saveJob = async (extra={}) => {
    const job = {project_id:projectId,display_name:displayName,wo_type:woType,wo_config:woConfig,del_config:includeDEL?delConfig:null,include_del:includeDEL,brk_config:includeBRK?brkConfig:null,include_brk:includeBRK,sites:sites.filter(s=>s.code||s.address),site_count:sites.filter(rowComplete).length,created_at:new Date().toISOString(),...extra}
    const {data} = await supabase.from('job_history').insert(job).select()
    if(data?.[0])setJobHistory(prev=>[data[0],...prev].slice(0,100))
  }

  const updateSite = (i,field,val) => setSites(prev=>prev.map((s,idx)=>{
    if(idx!==i)return s
    const addrFields=['address','city','state','zip']
    return {...s,[field]:val,verified:addrFields.includes(field)?null:s.verified,verifyError:'',...(field==='date'?{dateOverridden:true}:{})}
  }))

  const addRows = (n) => setSites(prev=>[...prev,...Array(n).fill(null).map(()=>({...EMPTY_SITE(),date:woConfig.defaultDate||'',numTechs:woConfig.numTechs||'1',numDays:woConfig.numDays||'1'}))])
  const removeSite = (i) => setSites(prev=>prev.length>1?prev.filter((_,idx)=>idx!==i):prev)

  const verifySite = async (i) => {
    const s=sites[i]; if(!s.address)return
    setSites(prev=>prev.map((x,idx)=>idx===i?{...x,verifying:true,verifyError:''}:x))
    try {
      const fullAddr=[s.address,s.city,s.state,s.zip].filter(Boolean).join(', ')
      const url=`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(fullAddr)}&benchmark=Public_AR_Current&format=json`
      const res=await fetch(url); if(!res.ok)throw new Error(`Census ${res.status}`)
      const json=await res.json(); const matches=json?.result?.addressMatches
      if(!matches?.length)throw new Error('No match found')
      const c=matches[0].addressComponents
      const addr=[c.fromAddress,c.preDirection,c.streetName,c.suffixType,c.suffixDirection].filter(Boolean).join(' ').trim()
      setSites(prev=>prev.map((x,idx)=>idx===i?{...x,verifying:false,verified:true,address:addr||x.address,city:c.city||x.city,state:c.state||x.state,zip:c.zip||x.zip,verifyError:''}:x))
    } catch(e) {
      setSites(prev=>prev.map((x,idx)=>idx===i?{...x,verifying:false,verified:false,verifyError:e.message}:x))
    }
  }

  const verifyAll = async () => {
    const toVerify=sites.map((s,i)=>({i,s})).filter(({s})=>s.address&&s.verified!==true)
    if(!toVerify.length)return
    setSites(prev=>prev.map((s,i)=>toVerify.find(t=>t.i===i)?{...s,verifying:true,verifyError:''}:s))
    for(let start=0;start<toVerify.length;start+=5) await Promise.all(toVerify.slice(start,start+5).map(({i})=>verifySite(i)))
  }

  const handlePaste = () => {
    setPasteError('')
    const {sites:parsed,error}=parsePaste(pasteText,{numTechs:woConfig.numTechs,numDays:woConfig.numDays,defaultDate:woConfig.defaultDate})
    if(error){setPasteError(error);return}
    setSites(prev=>{const existing=prev.filter(s=>s.code||s.address||s.branchName);return existing.length?[...existing,...parsed]:parsed})
    setPasteMode(false); setPasteText('')
  }

  const importCSV = (file) => {
    if(!file)return
    const reader=new FileReader()
    reader.onload=(e)=>{
      const {sites:imported,error}=parseCSVImport(e.target.result,{numTechs:woConfig.numTechs,numDays:woConfig.numDays,defaultDate:woConfig.defaultDate})
      if(error){alert(error);return}
      setSites(prev=>{const existing=prev.filter(s=>s.code||s.address||s.branchName);return existing.length?[...existing,...imported]:imported})
      setImportMode(false); setPasteMode(false)
      if(fileInputRef.current)fileInputRef.current.value=''
    }
    reader.readAsText(file)
  }

  const handleKeyDown = (e,rowIdx,colIdx) => {
    if(e.key==='Tab'){
      e.preventDefault()
      const next=e.shiftKey?colIdx-1:colIdx+1
      if(next>=0&&next<SITE_COLS.length){setActiveCell({row:rowIdx,col:next});inputRefs.current[`${rowIdx}-${next}`]?.focus()}
      else if(!e.shiftKey){if(rowIdx+1>=sites.length)addRows(1);setTimeout(()=>{setActiveCell({row:rowIdx+1,col:0});inputRefs.current[`${rowIdx+1}-0`]?.focus()},30)}
    } else if(e.key==='Enter'){
      e.preventDefault()
      if(rowIdx+1>=sites.length)addRows(1)
      setTimeout(()=>{setActiveCell({row:rowIdx+1,col:colIdx});inputRefs.current[`${rowIdx+1}-${colIdx}`]?.focus()},30)
    } else if(e.key==='ArrowDown'&&rowIdx+1<sites.length){e.preventDefault();setActiveCell({row:rowIdx+1,col:colIdx});inputRefs.current[`${rowIdx+1}-${colIdx}`]?.focus()}
    else if(e.key==='ArrowUp'&&rowIdx>0){e.preventDefault();setActiveCell({row:rowIdx-1,col:colIdx});inputRefs.current[`${rowIdx-1}-${colIdx}`]?.focus()}
  }

  const nextStep = () => setStep(s=>{setJoke(JOKES[Math.floor(Math.random()*JOKES.length)]);return s+1})
  const prevStep = () => setStep(s=>{setJoke(JOKES[Math.floor(Math.random()*JOKES.length)]);return s-1})

  const handleContinue0 = () => {
    savePidHistory(projectId); if(displayName.trim())saveDnHistory(displayName)
    if(includeDEL&&delConfig.templateId?.trim())saveTidHistory('DEL',delConfig.templateId.trim())
    if(includeBRK&&brkConfig.templateId?.trim())saveTidHistory('BRK',brkConfig.templateId.trim())
    const id=woConfig.templateId.trim()
    if(!id){nextStep();return}
    const existing=(tidHistory[woType]||[]).find(e=>(typeof e==='string'?e:e.id)===id)
    if(!existing){setPendingTidLabel({type:woType,id});setTidLabelInput('')}
    else{saveTidHistory(woType,id,typeof existing==='string'?'':existing.label);nextStep()}
  }

  const confirmTidLabel = (skip=false) => {
    if(!pendingTidLabel)return
    saveTidHistory(pendingTidLabel.type,pendingTidLabel.id,skip?'':tidLabelInput)
    setPendingTidLabel(null);setTidLabelInput('');nextStep()
  }

  const downloadCSV = useCallback(async () => {
    setGenerating(true)
    try {
      const now=new Date(),datePart=now.toISOString().split('T')[0],timePart=now.toTimeString().slice(0,8).replace(/:/g,'-')
      const safeProj=projectId.replace(/[^a-zA-Z0-9]/g,'_').slice(0,40)
      const csvFiles=[]
      const rows=[]
      for(const site of sites)rows.push(...buildRows(site,projectId,displayName,woType,woConfig,ALL_WO_TYPES))
      if(rows.length&&rows[rows.length-1].length===0)rows.pop()
      const mainFile=`FieldNation_${woType}_${safeProj}_${datePart}_${timePart}.csv`
      const mainCSV=toCSV(WO_HEADERS,rows)
      triggerDownload(mainCSV,mainFile); csvFiles.push({filename:mainFile,content:mainCSV})
      if(includeDEL){
        const delRows=[]
        for(const site of sites){if(!site.address&&!site.code)continue;const s1={...site,numTechs:'1',numDays:'1',budgetTech:'',payRate:'',...(delConfig.date?{date:delConfig.date}:{})};delRows.push(...buildRows(s1,projectId,displayName,'DEL',delConfig,ALL_WO_TYPES))}
        if(delRows.length&&delRows[delRows.length-1].length===0)delRows.pop()
        if(delRows.length){const df=`FieldNation_DEL_${safeProj}_${datePart}_${timePart}.csv`,dc=toCSV(WO_HEADERS,delRows);csvFiles.push({filename:df,content:dc});setTimeout(()=>triggerDownload(dc,df),500)}
      }
      if(includeBRK){
        const brkRows=[]
        for(const site of sites){if(!site.address&&!site.code)continue;const s1={...site,numTechs:'1',numDays:'1',budgetTech:'',payRate:''};brkRows.push(...buildRows(s1,projectId,displayName,'BRK',brkConfig,ALL_WO_TYPES))}
        if(brkRows.length&&brkRows[brkRows.length-1].length===0)brkRows.pop()
        if(brkRows.length){const bf=`FieldNation_BRK_${safeProj}_${datePart}_${timePart}.csv`,bc=toCSV(WO_HEADERS,brkRows);csvFiles.push({filename:bf,content:bc});setTimeout(()=>triggerDownload(bc,bf),includeDEL?1000:500)}
      }
      const MAX=400_000
      const compressed=await Promise.all(csvFiles.filter(f=>f.content.length<=MAX).map(async f=>({filename:f.filename,content:await compressString(f.content),compressed:true})))
      await saveJob({csv_files:compressed})
    } catch(err){alert('Error: '+err.message)}
    setGenerating(false)
  }, [sites,projectId,displayName,woType,woConfig,includeDEL,delConfig,includeBRK,brkConfig,ALL_WO_TYPES])

  const fnRows = sites.filter(rowComplete).flatMap(s => buildRows(s,projectId,displayName,woType,woConfig,ALL_WO_TYPES).filter(r=>r.length>0))

  const pushAllToFN = useCallback(async () => {
    const rows = sites.filter(rowComplete).flatMap(s => buildRows(s,projectId,displayName,woType,woConfig,ALL_WO_TYPES).filter(r=>r.length>0))
    setFnPushing(true)
    setFnResults({})
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const key = String(i)
      setFnResults(prev => ({...prev, [key]: {status:'pushing', title:row[2], date:row[11]}}))
      try {
        const result = await createWorkOrderDirect({
          title:       row[2],
          address:     row[4],
          address2:    row[5] || '',
          city:        row[6],
          state:       row[7],
          zip:         row[8],
          startDate:   row[11],
          startTime:   row[13],
          budget:      row[18],
          payType:     row[28],
          payRate:     row[21],
          approxHours: row[26],
          templateId:  row[0],
          clientId:    fnClientId || undefined,
        })
        setFnResults(prev => ({...prev, [key]: {status:'success', title:row[2], date:row[11], wo_id:result.id, url:result.url}}))
      } catch(err) {
        setFnResults(prev => ({...prev, [key]: {status:'error', title:row[2], date:row[11], error:err.message}}))
      }
    }
    setFnPushing(false)
  }, [sites, projectId, displayName, woType, woConfig, ALL_WO_TYPES, fnClientId])

  const totalRows=sites.filter(rowComplete).reduce((sum,s)=>sum+buildRows(s,projectId,displayName,woType,woConfig,ALL_WO_TYPES).filter(r=>r.length>0).length,0)
  const canProceed=[projectId.trim().length>0&&!!woType,sites.every(rowComplete),true]
  const anyUnverified=sites.some(s=>s.address&&s.verified!==true)

  return (
    <div className={styles.page}>
      <PageHeader title="Work Orders" subtitle="FieldNation CSV generator"
        actions={
          <div className={styles.headerActions}>
            <button className={styles.ghostBtn} onClick={()=>setShowHistory(true)}><History size={13}/> History{jobHistory.length>0&&<span className={styles.badge}>{jobHistory.length}</span>}</button>
            {!adminUnlocked?<button className={styles.ghostBtn} onClick={()=>setShowAdminPw(true)}>🔒</button>:<button className={`${styles.ghostBtn} ${styles.adminActive}`} onClick={()=>setAdminUnlocked(false)}>🔓</button>}
          </div>
        }
      />

      <div className={styles.body}>
        {/* Top-level tab switcher */}
        <div className={styles.topTabBar}>
          <button className={`${styles.topTab} ${activeTab==='generator'?styles.topTabActive:''}`} onClick={()=>setActiveTab('generator')}>WO Generator</button>
          <button className={`${styles.topTab} ${activeTab==='stats'?styles.topTabActive:''}`} onClick={()=>setActiveTab('stats')}><BarChart2 size={13}/> Project Stats</button>
        </div>

        {/* Step bar — only shown in generator tab */}
        {activeTab==='generator'&&<div className={styles.stepBar}>
          {STEP_LABELS.map((label,i)=>(
            <div key={i} className={styles.stepItem}>
              <div className={`${styles.stepNum} ${i<step?styles.stepDone:i===step?styles.stepActive:styles.stepPending}`}>{i<step?<Check size={11}/>:i+1}</div>
              <span className={`${styles.stepLabel} ${i===step?styles.stepLabelActive:''}`}>{label}</span>
              {i<STEP_LABELS.length-1&&<div className={`${styles.stepLine} ${i<step?styles.stepLineDone:''}`}/>}
            </div>
          ))}
        </div>}

        {/* Project Stats tab */}
        {activeTab==='stats'&&<ProjectStats styles={styles}/>}

        <div className={styles.content} style={{display: activeTab==='generator' ? undefined : 'none'}}>
          {/* STEP 0 */}
          {step===0&&(
            <div className={styles.step0}>
              <div className={styles.card}>
                <div className={styles.cardTitle}>Project Info</div>
                <div className={styles.field}>
                  <label>Project ID</label>
                  <div className={styles.inputRow}>
                    <input className={styles.input} value={projectId} onChange={e=>setProjectId(e.target.value)} placeholder="e.g. 10035574 - 4569395 - PNC - First Bank Conversion" />
                    {pidHistory.length>0&&<button className={styles.ddBtn} onClick={()=>setShowPidDD(v=>!v)}><ChevronDown size={12}/></button>}
                  </div>
                  {showPidDD&&pidHistory.length>0&&<div className={styles.dropdown}>{pidHistory.map(pid=><div key={pid} className={styles.ddItem} onClick={()=>{setProjectId(pid);setShowPidDD(false)}}>{pid}</div>)}</div>}
                  <span className={styles.hint}>Full project string as it appears in FieldNation</span>
                </div>
                <div className={styles.field}>
                  <label>Display Name Prefix</label>
                  <div className={styles.inputRow}>
                    <input className={styles.input} value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="e.g. PNC - FB Conversion (H1)" />
                    {dnHistory.length>0&&<button className={styles.ddBtn} onClick={()=>setShowDnDD(v=>!v)}><ChevronDown size={12}/></button>}
                  </div>
                  {showDnDD&&dnHistory.length>0&&<div className={styles.dropdown}>{dnHistory.map(dn=><div key={dn} className={styles.ddItem} onClick={()=>{setDisplayName(dn);setShowDnDD(false)}}>{dn}</div>)}</div>}
                  <span className={styles.hint}>Defaults to Project ID if blank</span>
                </div>
                {isFNConfigured() && fnClients.length > 0 && (
                  <div className={styles.field}>
                    <label>FieldNation Client</label>
                    <select
                      className={styles.input}
                      value={fnClientId}
                      onChange={e => setFnClientId(e.target.value)}
                    >
                      <option value=''>— None —</option>
                      {fnClients.map(c => (
                        <option key={c.id} value={String(c.id)}>{c.name} (ID: {c.id})</option>
                      ))}
                    </select>
                    <span className={styles.hint}>Assigned to WOs when pushing to FieldNation</span>
                  </div>
                )}
              </div>

              <div className={styles.card}>
                <div className={styles.cardTitle}>Work Order Type</div>
                <div className={styles.woTypeList}>
                  {Object.entries(ALL_WO_TYPES).map(([key,wot])=>(
                    <div key={key} className={`${styles.woCard} ${woType===key?styles.woCardActive:''}`} onClick={()=>{setWoType(key);setWoConfig(WO_DEFAULTS[key]?{...WO_DEFAULTS[key]}:{templateId:'',startTime:'',defaultDate:'',techType:'',numTechs:String(wot.numTechs||1),numDays:String(wot.numDays||1),budgetTech:'',payRate:'',approxHours:'',country:'',payType:'Fixed'})}}>
                      <div className={styles.woCardRadio}>{woType===key&&<div className={styles.woCardRadioDot}/>}</div>
                      <div className={styles.woCardInfo}><span className={styles.woCardKey}>{key}</span><span className={styles.woCardLabel}>{wot.label||key}</span></div>
                      <div className={styles.woCardMeta}>{wot.numTechs}t × {wot.numDays}d{wot.useBundle?' · bundled':''}</div>
                      {adminUnlocked&&<div className={styles.woCardActions}>
                        <button className={styles.microBtn} onClick={e=>{e.stopPropagation();setEditingKey(key);setCustomForm({key,label:wot.label||'',siteIdSuffix:wot.siteIdSuffix||key,numTechs:String(wot.numTechs||1),numDays:String(wot.numDays||1),useBundle:!!wot.useBundle});setShowCustomModal(true)}}>edit</button>
                        <button className={`${styles.microBtn} ${styles.microBtnDanger}`} onClick={e=>{e.stopPropagation();if(WO_TYPES[key]){const next={...deletedBuiltins,[key]:true};setDeletedBuiltins(next);persistWoTypes(customTypes,next,overriddenBuiltins)}else{const next={...customTypes};delete next[key];setCustomTypes(next);persistWoTypes(next,deletedBuiltins,overriddenBuiltins)}}}>×</button>
                      </div>}
                    </div>
                  ))}
                  {adminUnlocked&&<button className={styles.addTypeBtn} onClick={()=>{setEditingKey(null);setCustomForm({key:'',label:'',siteIdSuffix:'',numTechs:'1',numDays:'1',useBundle:false});setShowCustomModal(true)}}><Plus size={13}/> Add Custom WO Type</button>}
                </div>
              </div>

              {woType&&(
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Configure <span style={{color:'var(--amber)'}}>{woType}</span></div>
                  <div className={styles.configGrid}>
                    <div className={styles.field} style={{position:'relative'}}>
                      <label>Template ID</label>
                      <div className={styles.inputRow}>
                        <input className={styles.input} value={woConfig.templateId} onChange={e=>setWoConfig(p=>({...p,templateId:e.target.value}))} placeholder="e.g. 103095"/>
                        {(tidHistory[woType]?.length>0)&&<button className={styles.ddBtn} onClick={()=>setShowTidDD(v=>!v)}><ChevronDown size={12}/></button>}
                      </div>
                      {showTidDD&&tidHistory[woType]?.length>0&&<div className={styles.dropdown}>{tidHistory[woType].map(entry=>{const tid=typeof entry==='string'?entry:entry.id,lbl=typeof entry==='string'?'':entry.label;return<div key={tid} className={styles.ddItem} onClick={()=>{setWoConfig(p=>({...p,templateId:tid}));setShowTidDD(false)}}><b>{tid}</b>{lbl&&<span className={styles.ddItemSub}>{lbl}</span>}</div>})}</div>}
                    </div>
                    {[{k:'startTime',l:'Start Time',ph:'4:30pm'},{k:'defaultDate',l:'Default Date',type:'date'},{k:'techType',l:'Tech Type',ph:'Tech 1'},{k:'numTechs',l:'# Techs',ph:'1'},{k:'numDays',l:'# Days',ph:'3'},{k:'budgetTech',l:'Budget $',ph:'700'},{k:'payRate',l:'Pay Rate $',ph:'700'},{k:'approxHours',l:'Est Hours',ph:'10'},{k:'country',l:'Country',ph:'US'}].map(({k,l,ph,type:t})=>(
                      <div key={k} className={styles.field}>
                        <label>{l}</label>
                        <input className={`${styles.input}${k==='defaultDate'&&isPastDate(woConfig[k])?` ${styles.inputWarn}`:''}`} type={t||'text'} placeholder={ph||''} value={woConfig[k]||''} onChange={e=>setWoConfig(p=>({...p,[k]:e.target.value}))}/>
                      </div>
                    ))}
                    <div className={styles.field} style={{gridColumn:'span 2'}}>
                      <label>Pay Type</label>
                      <div className={styles.payTypeRow}>
                        {['Fixed','Hourly'].map(pt=><button key={pt} className={`${styles.payTypeBtn} ${(woConfig.payType||'Fixed')===pt?styles.payTypeBtnActive:''}`} onClick={()=>setWoConfig(p=>({...p,payType:pt}))}>{pt}</button>)}
                      </div>
                    </div>
                    <div className={styles.payNote} style={{gridColumn:'span 2'}}>
                      Budget and pay rate are defaults — values provided in location data will override these.
                    </div>
                  </div>
                  <CompanionToggle label="Also generate BRK (Backboard) on Day 1" enabled={includeBRK} onToggle={()=>setIncludeBRK(v=>!v)} config={brkConfig} setConfig={setBrkConfig} type="BRK" tidHistory={tidHistory} showTidDD={showBrkTidDD} setShowTidDD={setShowBrkTidDD} styles={styles}/>
                  <CompanionToggle label="Also generate DEL (Delivery) on Day 1" enabled={includeDEL} onToggle={()=>setIncludeDEL(v=>!v)} config={delConfig} setConfig={setDelConfig} type="DEL" tidHistory={tidHistory} showTidDD={showDelTidDD} setShowTidDD={setShowDelTidDD} showDateField styles={styles}/>
                </div>
              )}
            </div>
          )}

          {/* STEP 1 */}
          {step===1&&(
            <div className={styles.step1}>
              <div className={styles.tabBar}>
                <button className={`${styles.tab} ${pasteMode&&!importMode?styles.tabActive:''}`} onClick={()=>{setPasteMode(true);setImportMode(false)}}>⌘ Paste</button>
                <button className={`${styles.tab} ${!pasteMode&&!importMode?styles.tabActive:''}`} onClick={()=>{setPasteMode(false);setImportMode(false)}}>✎ Table ({sites.length})</button>
                <button className={`${styles.tab} ${importMode?styles.tabActive:''}`} onClick={()=>{setImportMode(true);setPasteMode(false)}}>⬆ Import CSV</button>
                {!pasteMode&&!importMode&&<button className={styles.clearBtn} onClick={()=>setClearConfirm(true)}><Trash2 size={11}/> Clear</button>}
              </div>

              {importMode&&(
                <div className={styles.importDrop}>
                  <input ref={fileInputRef} type="file" accept=".csv" style={{display:'none'}} onChange={e=>importCSV(e.target.files[0])}/>
                  <div style={{fontSize:32,marginBottom:12}}>📂</div>
                  <p>Upload a previously exported FieldNation CSV to re-import its sites.</p>
                  <button className={styles.primaryBtn} onClick={()=>fileInputRef.current?.click()}>Choose CSV File</button>
                </div>
              )}

              {pasteMode&&!importMode&&(
                <div className={styles.pasteSection}>
                  <p className={styles.pasteHint}>Copy rows from your SiteList. Supports all formats: tab-delimited, comma, services sheet (Format 4/5), 3-line blocks.</p>
                  <textarea className={styles.pasteArea} rows={8} placeholder={"Paste here...\nFB1A\tCascade Branch\t1H2026\t...\t2 N Cascade Ave\tColorado Springs\tCO\t80903\t...\t...\t...\t3/30/2026"} value={pasteText} onChange={e=>setPasteText(e.target.value)}/>
                  {pasteError&&<p className={styles.pasteError}><AlertTriangle size={12}/> {pasteError}</p>}
                  <div className={styles.pasteActions}>
                    <button className={styles.primaryBtn} onClick={handlePaste} disabled={!pasteText.trim()}>Parse {pasteText.trim().split('\n').filter(Boolean).length} rows →</button>
                    <button className={styles.ghostBtn} onClick={()=>setPasteMode(false)}>Enter Manually</button>
                  </div>
                </div>
              )}

              {!pasteMode&&!importMode&&(
                <div className={styles.tableSection}>
                  <div className={styles.tableToolbar}>
                    <span className={styles.tableStat}><b>{sites.filter(rowComplete).length}</b> complete · <b>{sites.filter(s=>s.verified===true).length}</b> verified{sites.filter(s=>isPastDate(s.date)).length>0&&<span className={styles.pastWarn}> · ⚠ {sites.filter(s=>isPastDate(s.date)).length} past</span>}</span>
                    <div className={styles.tableActions}>
                      <button className={styles.ghostBtn} onClick={()=>addRows(1)}><Plus size={12}/> Row</button>
                      <button className={styles.ghostBtn} onClick={()=>addRows(5)}><Plus size={12}/> 5</button>
                      <button className={`${styles.ghostBtn} ${!anyUnverified?styles.ghostBtnDisabled:''}`} onClick={verifyAll} disabled={!anyUnverified}>✦ Verify All</button>
                    </div>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.siteTable}>
                      <thead>
                        <tr>
                          <th style={{width:30}}>#</th>
                          {SITE_COLS.map(col=><th key={col.key} style={{width:col.width}}>{col.label}</th>)}
                          <th style={{width:70}}>Verify</th>
                          <th style={{width:28}}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sites.map((site,rowIdx)=>{
                          const rowActive=activeCell.row===rowIdx
                          const borderColor=site.verified===true?'var(--green)':site.verified===false?'var(--red)':rowComplete(site)?'var(--amber)':'transparent'
                          return(
                            <tr key={rowIdx} className={`${styles.siteRow} ${rowActive?styles.siteRowActive:''}`} style={{borderLeft:`3px solid ${borderColor}`}}>
                              <td className={styles.rowNum}>{rowIdx+1}</td>
                              {SITE_COLS.map((col,colIdx)=>{
                                const cellActive=rowActive&&activeCell.col===colIdx
                                return(
                                  <td key={col.key} className={styles.siteCell}>
                                    <input
                                      ref={el=>inputRefs.current[`${rowIdx}-${colIdx}`]=el}
                                      type={col.type||'text'}
                                      value={site[col.key]}
                                      placeholder={col.key==='numTechs'?(woConfig.numTechs||col.ph):col.key==='numDays'?(woConfig.numDays||col.ph):col.key==='date'?(woConfig.defaultDate||''):col.key==='budgetTech'?(woConfig.budgetTech||col.ph):col.key==='payRate'?(woConfig.payRate||col.ph):col.ph}
                                      onChange={e=>updateSite(rowIdx,col.key,e.target.value)}
                                      onKeyDown={e=>handleKeyDown(e,rowIdx,colIdx)}
                                      onFocus={()=>setActiveCell({row:rowIdx,col:colIdx})}
                                      className={`${styles.cellInput} ${cellActive?styles.cellInputActive:''} ${col.key==='date'&&isPastDate(site[col.key])?styles.cellInputWarn:''}`}
                                    />
                                  </td>
                                )
                              })}
                              <td className={styles.verifyCell}>
                                {site.verifying?<span className={styles.verifying}>…</span>:site.verified===true?<span className={styles.verified}><Check size={11}/></span>:site.verified===false?<button className={styles.retryBtn} onClick={()=>verifySite(rowIdx)} title={site.verifyError}>✗ Retry</button>:<button className={styles.verifyBtn} onClick={()=>verifySite(rowIdx)} disabled={!site.address}>Verify</button>}
                              </td>
                              <td><button className={styles.removeBtn} onClick={()=>removeSite(rowIdx)}>×</button></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2 */}
          {step===2&&(
            <div className={styles.step2}>
              <div className={styles.reviewGrid}>
                <div className={styles.reviewCard}><div className={styles.reviewCardLabel}>Project ID</div><div className={styles.reviewCardValue}>{projectId}</div>{displayName&&<div className={styles.reviewCardSub}>Prefix: {displayName}</div>}</div>
                <div className={styles.reviewCard}><div className={styles.reviewCardLabel}>WO Type</div><div className={styles.reviewCardValue} style={{color:'var(--amber)',fontFamily:'var(--font-head)',fontSize:20}}>{woType}</div><div className={styles.reviewCardSub}>{ALL_WO_TYPES[woType]?.label}</div></div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardTitle}>Summary</div>
                {[['Sites',sites.filter(rowComplete).length],['Pattern',`${woConfig.numTechs}t × ${woConfig.numDays}d`],['Template ID',woConfig.templateId],['Start Time',woConfig.startTime||'—'],['Budget / Pay',`$${woConfig.budgetTech} / $${woConfig.payRate}`],['Pay Type',woConfig.payType||'Fixed'],['Total rows',`${totalRows}${includeDEL?` + ${sites.filter(rowComplete).length} DEL`:''}${includeBRK?` + ${sites.filter(rowComplete).length} BRK`:''}`,true]].map(([l,v,bold])=>(
                  <div key={l} className={styles.summaryRow}><span className={styles.summaryLabel}>{l}</span><span className={`${styles.summaryValue} ${bold?styles.summaryValueBold:''}`}>{v}</span></div>
                ))}
              </div>
              <div className={styles.card}>
                <div className={styles.cardTitle}>Sites ({sites.filter(rowComplete).length}){sites.filter(s=>rowComplete(s)&&(s.routeToTechs||[]).some(Boolean)).length>0&&<span className={styles.routedBadge}> · {sites.filter(s=>rowComplete(s)&&(s.routeToTechs||[]).some(Boolean)).length} pre-routed 🎯</span>}</div>
                <div className={styles.siteCards}>
                  {sites.filter(rowComplete).map((s,i)=>(
                    <div key={i} className={styles.siteCard} style={{borderLeftColor:s.verified===true?'var(--green)':'var(--border-strong)'}}>
                      <div className={styles.siteCardCode}>{s.code}{s.branchName?` — ${s.branchName}`:''}</div>
                      <div className={styles.siteCardAddr}>{s.address}{s.address2?`, ${s.address2}`:''}<br/>{s.city}, {s.state} {s.zip}</div>
                      <div className={styles.siteCardDate}>{s.date}</div>
                      {(s.budgetTech||s.payRate)&&<div className={styles.siteCardOverride}>⚡ ${s.budgetTech||woConfig.budgetTech} / ${s.payRate||woConfig.payRate}</div>}
                    </div>
                  ))}
                </div>
              </div>
              {/* Dupe Check */}
              <DupeCheckPanel
                sites={sites.filter(rowComplete)}
                dupeResults={dupeResults}
                checking={checking}
                onCheck={() => checkDupes(sites.filter(rowComplete).map(s=>s.code))}
                onClear={clearDupes}
                styles={styles}
              />

              <button className={styles.routeBtn} onClick={()=>setShowRoute(true)}><Route size={14}/>{sites.filter(s=>rowComplete(s)&&(s.routeToTechs||[]).some(Boolean)).length>0?`Route WOs — ${sites.filter(s=>rowComplete(s)&&(s.routeToTechs||[]).some(Boolean)).length} assigned`:'Route WOs — optional'}</button>
              <button className={styles.downloadBtn} onClick={downloadCSV} disabled={generating}><Download size={16}/>{generating?'Building CSV…':`Download ${woType}${includeDEL?' + DEL':''}${includeBRK?' + BRK':''} CSV${(includeDEL||includeBRK)?'s':''}`}</button>

              {isFNConfigured() && (
                <FNPushPanel
                  rows={fnRows}
                  fnResults={fnResults}
                  setFnResults={setFnResults}
                  fnPushing={fnPushing}
                  onPushAll={pushAllToFN}
                  onClear={() => setFnResults({})}
                  styles={styles}
                />
              )}

              <div className={styles.startOverRow}><button className={styles.ghostBtn} onClick={()=>setStartOverConfirm(true)}>↩ Start Over</button></div>
            </div>
          )}

          {/* Nav */}
          <div className={styles.navRow}>
            {step>0?<button className={styles.backBtn} onClick={prevStep}>← Back</button>:<div/>}
            {step<2&&<button className={`${styles.continueBtn} ${!canProceed[step]?styles.continueBtnDisabled:''}`} onClick={()=>step===0?handleContinue0():nextStep()} disabled={!canProceed[step]}>Continue →</button>}
          </div>

          <div className={styles.jokeBar}><span>😄</span><span className={styles.jokeText}>{joke}</span><button className={styles.jokeNext} onClick={()=>setJoke(JOKES[Math.floor(Math.random()*JOKES.length)])}>next</button></div>
        </div>
      </div>

      {/* History Panel */}
      {showHistory&&(
        <div className={styles.panelOverlay} onClick={()=>setShowHistory(false)}>
          <div className={styles.panel} onClick={e=>e.stopPropagation()}>
            <div className={styles.panelHeader}><h3>Job History</h3><button onClick={()=>setShowHistory(false)}><X size={16}/></button></div>
            <div className={styles.panelSearch}><input className={styles.input} placeholder="Search…" value={histSearch} onChange={e=>setHistSearch(e.target.value)}/></div>
            <div className={styles.panelBody}>
              {jobHistory.filter(j=>{if(!histSearch.trim())return true;const q=histSearch.toLowerCase();return(j.project_id||'').toLowerCase().includes(q)||(j.display_name||'').toLowerCase().includes(q)||(j.wo_type||'').toLowerCase().includes(q)}).map(job=>(
                <div key={job.id} className={styles.historyCard}>
                  <div className={styles.historyCardTop}>
                    <div><div className={styles.historyCardTitle}>{job.wo_type} — {job.project_id}</div>{job.display_name&&<div className={styles.historyCardSub}>{job.display_name}</div>}</div>
                    <div className={styles.historyCardDate}>{new Date(job.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className={styles.historyCardMeta}>{job.site_count} sites{job.wo_config?.templateId&&` · ${job.wo_config.templateId}`}{job.include_del&&' · +DEL'}{job.include_brk&&' · +BRK'}</div>
                  {Array.isArray(job.csv_files)&&job.csv_files.length>0&&(
                    <div className={styles.historyCardFiles}>
                      {job.csv_files.map((f,fi)=>(
                        <button key={fi} className={styles.redownloadBtn} onClick={async()=>{const content=f.compressed?await decompressString(f.content):f.content;triggerDownload(content,f.filename)}}><Download size={10}/> {f.filename.replace(/^FieldNation_/,'').replace(/_\d{4}-\d{2}-\d{2}_.*$/,'')}</button>
                      ))}
                    </div>
                  )}
                  <div className={styles.historyCardActions}>
                    <button className={styles.restoreBtn} onClick={()=>{setProjectId(job.project_id||'');setDisplayName(job.display_name||'');setWoType(job.wo_type||'LVL');setWoConfig(job.wo_config||WO_DEFAULTS.LVL);if(job.include_del&&job.del_config){setIncludeDEL(true);setDelConfig(job.del_config)}else setIncludeDEL(false);if(job.include_brk&&job.brk_config){setIncludeBRK(true);setBrkConfig(job.brk_config)}else setIncludeBRK(false);if(Array.isArray(job.sites)&&job.sites.length)setSites(job.sites);setStep(0);setShowHistory(false)}}>↩ Restore</button>
                    <button className={styles.ghostBtn} onClick={()=>{setProjectId(job.project_id||'');setDisplayName(job.display_name||'');setWoType(job.wo_type||'LVL');setWoConfig(job.wo_config||WO_DEFAULTS.LVL);if(job.include_del&&job.del_config){setIncludeDEL(true);setDelConfig(job.del_config)}else setIncludeDEL(false);if(job.include_brk&&job.brk_config){setIncludeBRK(true);setBrkConfig(job.brk_config)}else setIncludeBRK(false);setSites([{...EMPTY_SITE(),date:(job.wo_config||{}).defaultDate||'',numTechs:(job.wo_config||{}).numTechs||'1',numDays:(job.wo_config||{}).numDays||'1'}]);setStep(0);setShowHistory(false)}}>Config only</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Route Panel */}
      {showRoute&&(
        <div className={styles.panelOverlay} onClick={()=>setShowRoute(false)}>
          <div className={styles.panel} onClick={e=>e.stopPropagation()}>
            <div className={styles.panelHeader}><h3>🎯 Route Work Orders</h3><button onClick={()=>setShowRoute(false)}><X size={16}/></button></div>
            <div className={styles.routeGlobal}>
              <label>Assign ALL slots across all sites</label>
              <div className={styles.inputRow}>
                <input className={styles.input} id="route-global" placeholder="Provider ID"/>
                <button className={styles.applyBtn} onClick={()=>{const val=document.getElementById('route-global').value.trim();setSites(prev=>prev.map(s=>{if(!rowComplete(s))return s;const n=Number(s.numTechs||woConfig.numTechs)||1;return{...s,routeToTechs:Array(n).fill(val)}}))}}>Apply All</button>
                <button className={styles.ghostBtn} onClick={()=>setSites(prev=>prev.map(s=>({...s,routeToTechs:[]})))}>Clear</button>
              </div>
            </div>
            <div className={styles.panelBody}>
              {sites.filter(rowComplete).map((site,i)=>{
                const realIdx=sites.indexOf(site),numTechs=Number(site.numTechs||woConfig.numTechs)||1
                const techSlots=Array.from({length:numTechs},(_,ti)=>(site.routeToTechs||[])[ti]||'')
                const anyRouted=techSlots.some(Boolean)
                return(
                  <div key={i} className={`${styles.routeCard} ${anyRouted?styles.routeCardActive:''}`}>
                    <div className={styles.routeCardHeader}>
                      <div><div className={styles.routeCardCode}>{site.code}{site.branchName?` — ${site.branchName}`:''}</div><div className={styles.routeCardMeta}>{site.city}, {site.state} · {numTechs} tech{numTechs>1?'s':''}</div></div>
                      {anyRouted&&<button className={styles.clearRouteBtn} onClick={()=>setSites(p=>p.map((s,idx)=>idx===realIdx?{...s,routeToTechs:[]}:s))}>clear</button>}
                    </div>
                    {techSlots.map((val,ti)=>(
                      <div key={ti} className={styles.techSlot}>
                        <span className={styles.techSlotLabel}>Tech {ti+1}</span>
                        <input className={`${styles.input} ${val?styles.inputRouted:''}`} placeholder="Provider ID" value={val} onChange={e=>{const updated=[...techSlots];updated[ti]=e.target.value;setSites(p=>p.map((s,idx)=>idx===realIdx?{...s,routeToTechs:updated}:s))}}/>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
            <div className={styles.panelFooter}><button className={styles.primaryBtn} onClick={()=>setShowRoute(false)}>Done</button></div>
          </div>
        </div>
      )}

      {/* Custom WO Type Modal */}
      {showCustomModal&&(
        <div className={styles.modalOverlay} onClick={e=>e.target===e.currentTarget&&setShowCustomModal(false)}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}><h3>{editingKey?'Edit WO Type':'New Custom WO Type'}</h3><button onClick={()=>setShowCustomModal(false)}><X size={15}/></button></div>
            <div className={styles.modalBody}>
              {[{k:'key',l:'Type Code',ph:'SRV',ro:!!editingKey},{k:'label',l:'Description',ph:'SRV — Service Visit'},{k:'siteIdSuffix',l:'Site ID Suffix',ph:'SRV'},{k:'numTechs',l:'# Techs',ph:'1'},{k:'numDays',l:'# Days',ph:'1'}].map(({k,l,ph,ro})=>(
                <div key={k} className={styles.field}><label>{l}</label><input className={styles.input} placeholder={ph} value={customForm[k]||''} readOnly={ro} onChange={e=>!ro&&setCustomForm(p=>({...p,[k]:k==='key'?e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6):e.target.value}))}/></div>
              ))}
              <label className={styles.checkLabel}><input type="checkbox" checked={customForm.useBundle} onChange={e=>setCustomForm(p=>({...p,useBundle:e.target.checked}))}/> Bundle work orders</label>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.ghostBtn} onClick={()=>setShowCustomModal(false)}>Cancel</button>
              <button className={styles.primaryBtn} disabled={!editingKey&&!customForm.key.trim()} onClick={()=>{const k=editingKey||customForm.key.trim();if(!k)return;const entry={label:customForm.label||k,siteIdSuffix:customForm.siteIdSuffix||k,numTechs:Number(customForm.numTechs)||1,numDays:Number(customForm.numDays)||1,useBundle:!!customForm.useBundle};if(WO_TYPES[k]){const nextOv={...overriddenBuiltins,[k]:entry};setOverriddenBuiltins(nextOv);persistWoTypes(customTypes,deletedBuiltins,nextOv)}else{const next={...customTypes,[k]:entry};setCustomTypes(next);persistWoTypes(next,deletedBuiltins,overriddenBuiltins)};setWoType(k);setShowCustomModal(false)}}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Pending TID Label */}
      {pendingTidLabel&&(
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}><h3>New Template ID</h3></div>
            <div className={styles.modalBody}>
              <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:12}}><b>{pendingTidLabel.id}</b> is new. Add a label so you can recognize it later.</p>
              <div className={styles.field}><label>Label (optional)</label><input className={styles.input} autoFocus placeholder="e.g. PNC Conversion Lead" value={tidLabelInput} onChange={e=>setTidLabelInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&confirmTidLabel()}/></div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.ghostBtn} onClick={()=>confirmTidLabel(true)}>Skip</button>
              <button className={styles.primaryBtn} onClick={()=>confirmTidLabel()}>Save & Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* Admin unlock */}
      {showAdminPw&&(
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}><h3>🔓 Admin Unlock</h3><button onClick={()=>setShowAdminPw(false)}><X size={15}/></button></div>
            <div className={styles.modalBody}><div className={styles.field}><label>Admin Password</label><input className={styles.input} type="password" autoFocus value={adminPwInput} onChange={e=>setAdminPwInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){setAdminUnlocked(true);setShowAdminPw(false);setAdminPwInput('')}}}/></div></div>
            <div className={styles.modalFooter}><button className={styles.ghostBtn} onClick={()=>setShowAdminPw(false)}>Cancel</button><button className={styles.primaryBtn} onClick={()=>{setAdminUnlocked(true);setShowAdminPw(false);setAdminPwInput('')}}>Unlock</button></div>
          </div>
        </div>
      )}

      {/* Clear confirm */}
      {clearConfirm&&(
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}><h3>Clear All Sites?</h3></div>
            <div className={styles.modalBody}><p style={{fontSize:13,color:'var(--text-secondary)'}}>Delete all <b>{sites.length} rows</b>? This cannot be undone.</p></div>
            <div className={styles.modalFooter}><button className={styles.ghostBtn} onClick={()=>setClearConfirm(false)}>Cancel</button><button className={styles.dangerBtn} onClick={()=>{setSites([{...EMPTY_SITE(),date:woConfig.defaultDate||'',numTechs:woConfig.numTechs||'1',numDays:woConfig.numDays||'1'}]);setClearConfirm(false)}}>Clear All</button></div>
          </div>
        </div>
      )}

      {/* Start over */}
      {startOverConfirm&&(
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}><h3>Start Over?</h3></div>
            <div className={styles.modalFooter} style={{flexDirection:'column',gap:8}}>
              <button className={styles.primaryBtn} style={{width:'100%'}} onClick={()=>{setStep(0);setStartOverConfirm(false)}}>Keep data & start over</button>
              <button className={styles.dangerBtn} style={{width:'100%'}} onClick={()=>{setStep(0);setProjectId('');setDisplayName('');setWoType('LVL');setWoConfig({...WO_DEFAULTS.LVL});setSites([EMPTY_SITE()]);setStartOverConfirm(false)}}>Clear all & start over</button>
              <button className={styles.ghostBtn} style={{width:'100%'}} onClick={()=>setStartOverConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ProjectStats ──────────────────────────────────────────────
function ProjectStats({ styles }) {
  const [loading, setLoading] = useState(false)
  const [stats,   setStats]   = useState(null)
  const [error,   setError]   = useState('')
  const [sortBy,  setSortBy]  = useState('total_cost')
  const [sortDir, setSortDir] = useState('desc')
  const [search,  setSearch]  = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      // 1. Get PNC projects
      const { data: projects, error: pe } = await supabase
        .from('projects').select('id, name, client').ilike('client', '%PNC%')
      if (pe) throw new Error(pe.message)

      if (!projects?.length) { setStats([]); setLoading(false); return }

      const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]))

      // 2. Get all site codes for PNC projects
      const { data: sites, error: se } = await supabase
        .from('sites').select('id, code, project_id').in('project_id', projects.map(p => p.id))
      if (se) throw new Error(se.message)

      if (!sites?.length) { setStats([]); setLoading(false); return }

      const codeToProject = {}
      sites.forEach(s => { codeToProject[s.code.toUpperCase()] = projectMap[s.project_id] ?? '—' })
      const siteCodes = sites.map(s => s.code)

      // 3. Get fn_work_history rows for those site codes
      const { data: history, error: he } = await supabase
        .from('fn_work_history')
        .select('fn_wo_id, provider_name, wo_type, status, site_code, site_name, total_pay, work_date')
        .in('site_code', siteCodes)
      if (he) throw new Error(he.message)

      // 4. Aggregate per site
      const bySite = {}
      for (const row of history ?? []) {
        const code = (row.site_code ?? '').toUpperCase()
        if (!bySite[code]) bySite[code] = {
          site_code:   code,
          project:     codeToProject[code] ?? '—',
          total_cost:  0,
          trip_count:  0,
          dates:       new Set(),
          techs:       new Set(),
        }
        bySite[code].total_cost  += parseFloat(row.total_pay ?? 0)
        bySite[code].trip_count  += 1
        if (row.work_date)    bySite[code].dates.add(row.work_date)
        if (row.provider_name) bySite[code].techs.add(row.provider_name)
      }

      setStats(Object.values(bySite).map(s => ({
        ...s, dates: [...s.dates].sort(), techs: [...s.techs].sort(),
      })))
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const filtered = (stats ?? []).filter(s =>
    !search.trim() || s.site_code.includes(search.toUpperCase()) || s.project.toLowerCase().includes(search.toLowerCase())
  )
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortBy], bv = b[sortBy]
    const mult = sortDir === 'desc' ? -1 : 1
    if (typeof av === 'number') return mult * (av - bv)
    return mult * String(av ?? '').localeCompare(String(bv ?? ''))
  })

  const totalCost  = filtered.reduce((s, r) => s + r.total_cost,  0)
  const totalTrips = filtered.reduce((s, r) => s + r.trip_count, 0)

  const arrow = (col) => sortBy !== col ? '' : sortDir === 'desc' ? ' ↓' : ' ↑'

  const fmtDate = (d) => {
    try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
    catch { return d }
  }

  return (
    <div className={styles.statsPanel}>
      <div className={styles.statsToolbar}>
        <input className={styles.input} style={{maxWidth:220}} placeholder="Search site or project…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <button className={styles.ghostBtn} onClick={load} disabled={loading}>
          <RefreshCw size={12} className={loading ? styles.spinning : undefined}/> Refresh
        </button>
      </div>

      {error && <p className={styles.statsError}>{error}</p>}

      {stats !== null && (
        <div className={styles.statsSummary}>
          <div className={styles.statCard}><div className={styles.statCardLabel}>Total Actual Spend</div><div className={styles.statCardValue}>${totalCost.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</div></div>
          <div className={styles.statCard}><div className={styles.statCardLabel}>Total Trips</div><div className={styles.statCardValue}>{totalTrips.toLocaleString()}</div></div>
          <div className={styles.statCard}><div className={styles.statCardLabel}>Sites</div><div className={styles.statCardValue}>{filtered.length.toLocaleString()}</div></div>
        </div>
      )}

      {loading && <div className={styles.statsLoading}><Loader size={16} className={styles.spinning}/> Loading PNC stats…</div>}

      {!loading && stats !== null && sorted.length === 0 && (
        <div className={styles.statsEmpty}>{search ? 'No sites match your search.' : 'No PNC work order history found. Upload an FN export in the FN Export Analyzer to populate this view.'}</div>
      )}

      {!loading && sorted.length > 0 && (
        <div className={styles.statsTableWrap}>
          <table className={styles.statsTable}>
            <thead>
              <tr>
                <th onClick={()=>toggle('site_code')}>Site{arrow('site_code')}</th>
                <th onClick={()=>toggle('project')}>Project{arrow('project')}</th>
                <th onClick={()=>toggle('total_cost')}>Actual Spend{arrow('total_cost')}</th>
                <th onClick={()=>toggle('trip_count')}>Trips{arrow('trip_count')}</th>
                <th>Work Dates</th>
                <th>Techs</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => (
                <tr key={row.site_code}>
                  <td className={styles.statsCode}>{row.site_code}</td>
                  <td className={styles.statsProject}>{row.project}</td>
                  <td className={styles.statsCost}>${row.total_cost.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                  <td className={styles.statsTrips}>{row.trip_count}</td>
                  <td className={styles.statsDates}>
                    {row.dates.length === 0 ? '—' : row.dates.length <= 3
                      ? row.dates.map(fmtDate).join(', ')
                      : `${row.dates.slice(0,2).map(fmtDate).join(', ')} +${row.dates.length - 2} more`}
                  </td>
                  <td className={styles.statsTechs}>
                    {row.techs.length === 0 ? '—' : row.techs.length <= 2
                      ? row.techs.join(', ')
                      : `${row.techs.slice(0,2).join(', ')} +${row.techs.length - 2}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CompanionToggle({label,enabled,onToggle,config,setConfig,type,tidHistory,showTidDD,setShowTidDD,showDateField,styles}) {
  return(
    <div style={{marginTop:12}}>
      <div className={`${styles.companionToggle} ${enabled?styles.companionToggleOn:''}`} onClick={onToggle}>
        <div className={`${styles.companionCheck} ${enabled?styles.companionCheckOn:''}`}>{enabled&&<Check size={10}/>}</div>
        <span>{label}</span>
      </div>
      {enabled&&(
        <div className={styles.companionConfig}>
          <div className={styles.configGrid}>
            <div className={styles.field} style={{position:'relative'}}>
              <label>Template ID</label>
              <div className={styles.inputRow}>
                <input className={styles.input} value={config.templateId||''} onChange={e=>setConfig(p=>({...p,templateId:e.target.value}))} placeholder={type==='DEL'?'102221':'102222'}/>
                {(tidHistory[type]?.length>0)&&<button className={styles.ddBtn} onClick={()=>setShowTidDD(v=>!v)}><ChevronDown size={12}/></button>}
              </div>
              {showTidDD&&tidHistory[type]?.length>0&&<div className={styles.dropdown}>{tidHistory[type].map(entry=>{const tid=typeof entry==='string'?entry:entry.id,lbl=typeof entry==='string'?'':entry.label;return<div key={tid} className={styles.ddItem} onClick={()=>{setConfig(p=>({...p,templateId:tid}));setShowTidDD(false)}}><b>{tid}</b>{lbl&&<span className={styles.ddItemSub}>{lbl}</span>}</div>})}</div>}
            </div>
            {[{k:'startTime',l:'Start Time',ph:'13:00:00'},{k:'techType',l:'Tech Type',ph:'Tech 1'},{k:'budgetTech',l:'Budget $',ph:'200'},{k:'payRate',l:'Pay Rate $',ph:'150'},{k:'approxHours',l:'Est Hours',ph:'3'},{k:'country',l:'Country',ph:''},...(showDateField?[{k:'date',l:'Override Date',type:'date'}]:[])].map(({k,l,ph,type:t})=>(
              <div key={k} className={styles.field}><label>{l}</label><input className={styles.input} type={t||'text'} placeholder={ph||''} value={config[k]||''} onChange={e=>setConfig(p=>({...p,[k]:e.target.value}))}/></div>
            ))}
            <div className={styles.field} style={{gridColumn:'span 2'}}><label>Pay Type</label><div className={styles.payTypeRow}>{['Fixed','Hourly'].map(pt=><button key={pt} className={`${styles.payTypeBtn} ${(config.payType||'Fixed')===pt?styles.payTypeBtnActive:''}`} onClick={()=>setConfig(p=>({...p,payType:pt}))}>{pt}</button>)}</div></div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── FNPushPanel ───────────────────────────────────────────────
function FNPushPanel({ rows, fnResults, setFnResults, fnPushing, onPushAll, onClear, styles }) {
  const total      = rows.length
  const pushed     = Object.values(fnResults).filter(r => r.status === 'success').length
  const errors     = Object.values(fnResults).filter(r => r.status === 'error').length
  const hasResults = Object.keys(fnResults).length > 0

  const deleteWO = async (key, woId) => {
    setFnResults(prev => ({...prev, [key]: {...prev[key], deleting: true}}))
    try {
      await deleteWorkOrderDirect(woId)
      setFnResults(prev => ({...prev, [key]: {...prev[key], status: 'deleted', deleting: false}}))
    } catch(err) {
      setFnResults(prev => ({...prev, [key]: {...prev[key], deleting: false, deleteError: err.message}}))
    }
  }

  return (
    <div className={styles.fnPushPanel}>
      <div className={styles.fnPanelHeader}>
        <div className={styles.fnPanelTitle}>
          <Send size={14} />
          <span>Push to FieldNation Sandbox</span>
          {pushed > 0 && <span className={styles.fnSuccessBadge}>{pushed} pushed</span>}
          {errors > 0 && <span className={styles.fnErrorBadge}>{errors} failed</span>}
        </div>
        <div style={{display:'flex', gap:6}}>
          {hasResults && <button className={styles.ghostBtn} onClick={onClear} disabled={fnPushing}>Clear</button>}
          <button
            className={styles.primaryBtn}
            onClick={onPushAll}
            disabled={fnPushing || total === 0}
          >
            {fnPushing
              ? <><Loader size={12} className={styles.spinning}/> Pushing…</>
              : <><Send size={12}/> Push {total} WO{total !== 1 ? 's' : ''} to FN</>}
          </button>
        </div>
      </div>

      {!hasResults && !fnPushing && (
        <p className={styles.fnPanelHint}>
          Creates {total} work order{total !== 1 ? 's' : ''} directly in FieldNation sandbox — one per row in the CSV above.
        </p>
      )}

      {hasResults && (
        <div className={styles.fnResultList}>
          {rows.map((row, i) => {
            const key    = String(i)
            const result = fnResults[key]
            if (!result) return null
            const isDeleted = result.status === 'deleted'
            return (
              <div key={i} className={`${styles.fnResultRow} ${result.status === 'success' ? styles.fnResultRowOk : result.status === 'deleted' ? styles.fnResultRowDeleted : result.status === 'error' ? styles.fnResultRowErr : ''}`}>
                <span className={styles.fnResultCode} style={isDeleted ? {textDecoration:'line-through', opacity:0.5} : {}}>{result.title}</span>
                <span className={styles.fnResultDate}>{result.date || '—'}</span>
                {result.status === 'pushing' && <Loader size={11} className={styles.spinning} style={{color:'var(--amber)', flexShrink:0}}/>}
                {result.status === 'success' && (
                  <>
                    <Check size={11} style={{color:'var(--green)', flexShrink:0}}/>
                    <span className={styles.fnResultId}>WO {result.wo_id}</span>
                    <a href={result.url} target="_blank" rel="noreferrer" className={styles.fnResultLink}><ExternalLink size={10}/> View</a>
                    <button
                      className={styles.fnDeleteBtn}
                      onClick={() => deleteWO(key, result.wo_id)}
                      disabled={result.deleting}
                      title="Delete from FieldNation"
                    >
                      {result.deleting ? <Loader size={10} className={styles.spinning}/> : <Trash2 size={10}/>}
                    </button>
                  </>
                )}
                {result.status === 'deleted' && (
                  <span className={styles.fnResultDeleted}>deleted</span>
                )}
                {result.status === 'error' && (
                  <span className={styles.fnResultError} title={result.error}>{result.error}</span>
                )}
                {result.deleteError && (
                  <span className={styles.fnResultError} title={result.deleteError}>delete failed</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── DupeCheckPanel ────────────────────────────────────────────
function DupeCheckPanel({ sites, dupeResults, checking, onCheck, onClear, styles }) {
  const dupeCount = dupeResults ? Object.values(dupeResults).filter(r => r.exists).length : 0
  const checked   = !!dupeResults

  return (
    <div className={styles.dupePanel}>
      <div className={styles.dupePanelHeader}>
        <div className={styles.dupePanelTitle}>
          <ShieldAlert size={14} />
          <span>Duplicate Check</span>
          {checked && (
            <span className={dupeCount > 0 ? styles.dupeWarnBadge : styles.dupeOkBadge}>
              {dupeCount > 0 ? `${dupeCount} existing WO${dupeCount !== 1 ? 's' : ''} found` : 'No duplicates'}
            </span>
          )}
        </div>
        <div style={{display:'flex',gap:6}}>
          {checked && <button className={styles.ghostBtn} onClick={onClear}>Clear</button>}
          <button
            className={styles.ghostBtn}
            onClick={onCheck}
            disabled={checking || !sites.length}
          >
            {checking
              ? <><Loader size={12} className={styles.spinning} /> Checking FN…</>
              : checked ? 'Re-check' : 'Check FieldNation for existing WOs'}
          </button>
        </div>
      </div>

      {!checked && !checking && (
        <p className={styles.dupePanelHint}>
          Scans FieldNation for existing work orders matching your site codes before generating. Prevents duplicates.
          {!import.meta.env.VITE_FN_CLIENT_ID && <span className={styles.mockNote}> (mock mode — configure FN credentials in Settings → API to go live)</span>}
        </p>
      )}

      {dupeResults && dupeCount > 0 && (
        <div className={styles.dupeList}>
          {Object.entries(dupeResults).filter(([,r]) => r.exists).map(([code, result]) => (
            <div key={code} className={styles.dupeItem}>
              <ShieldAlert size={12} style={{color:'var(--amber)',flexShrink:0}} />
              <span className={styles.dupeCode}>{code}</span>
              <span className={styles.dupeMeta}>
                WO {result.wo_id} · {result.status}
              </span>
              {result.title && <span className={styles.dupeTitle}>{result.title}</span>}
              {result.url && result.url !== '#' && (
                <a href={result.url} target="_blank" rel="noreferrer" className={styles.dupeLink}>
                  <ExternalLink size={11} /> View in FN
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
