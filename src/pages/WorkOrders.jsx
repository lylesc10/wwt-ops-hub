import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import {
  WO_TYPES, WO_DEFAULTS, WO_HEADERS, SITE_COLS, EMPTY_SITE, SDT_DEFAULTS,
  buildRows, toCSV, compressString, decompressString,
  rowComplete, isPastDate, triggerDownload,
} from '@/cpwog/engine'
import { parsePaste, parseCSVImport } from '@/cpwog/parsers'
import { pushWorkOrder } from '@/lib/fieldnation'
import { WorkOrderListView } from '@/components/fnwo/WorkOrderListView'
import {
  Download, History, Route, Plus, X, Trash2, Check, ChevronDown, AlertTriangle,
  Loader, ExternalLink, ShieldAlert, UploadCloud, BookTemplate, Library, Calendar, Sparkles,
} from 'lucide-react'
import { useFNSync } from '@/hooks/useFNSync'
import styles from './WorkOrders.module.css'

const JOKES = [
  "Why did the field technician bring a ladder? Because the job was on another level.",
  "Why don't work orders ever get lonely? Because they always come in bundles.",
  "How many FieldNation techs does it take to change a lightbulb? One, but you have to submit a work order first.",
  "Why did the CSV file go to therapy? It had too many unresolved columns.",
  "The FieldNation upload failed. Turns out it was a CSV trauma response.",
]
const STEP_LABELS = ['Project Info', 'Add Sites', 'Review & Export']

// "Mon 3/30" label for per-day time inputs (Day N when no default date is set)
function dayLabel(defaultDate, i) {
  if (!defaultDate) return `Day ${i + 1}`
  const d = new Date(defaultDate + 'T12:00:00')
  if (isNaN(d.getTime())) return `Day ${i + 1}`
  d.setDate(d.getDate() + i)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
}

export default function WorkOrders() {
  const { user } = useAuth()
  const [view,         setView]         = useState('generator') // 'generator' | 'list'
  const [step,         setStep]         = useState(0)
  const [joke,         setJoke]         = useState(() => JOKES[0])
  const [projectId,    setProjectId]    = useState('')
  const [displayName,  setDisplayName]  = useState('')
  const [woType,       setWoType]       = useState('LVL')
  const [woConfig,     setWoConfig]     = useState({ ...WO_DEFAULTS.LVL })
  const [sdtConfig,    setSdtConfig]    = useState(() => [...SDT_DEFAULTS])
  const [sites,        setSites]        = useState([EMPTY_SITE()])
  const [generating,   setGenerating]   = useState(false)
  const [includeDEL,   setIncludeDEL]   = useState(false)
  const [delConfig,    setDelConfig]    = useState({ ...WO_DEFAULTS.DEL })
  const [includeBRK,   setIncludeBRK]   = useState(false)
  const [brkConfig,    setBrkConfig]    = useState({ ...WO_DEFAULTS.BRK })
  const [includeWRK,   setIncludeWRK]   = useState(false)
  const [wrkConfig,    setWrkConfig]    = useState({ ...WO_DEFAULTS.WRK })
  const [pasteMode,    setPasteMode]    = useState(true)
  const [importMode,   setImportMode]   = useState(false)
  const [pasteText,    setPasteText]    = useState('')
  const [pasteError,   setPasteError]   = useState('')
  const [activeCell,   setActiveCell]   = useState({ row: 0, col: 0 })
  const [showHistory,  setShowHistory]  = useState(false)
  const [showRoute,    setShowRoute]    = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showLibrary,  setShowLibrary]  = useState(false)
  const [histSearch,   setHistSearch]   = useState('')
  const [libSearch,    setLibSearch]    = useState('')
  const [jobHistory,   setJobHistory]   = useState([])
  const [woTemplates,  setWoTemplates]  = useState([])
  const [siteLibrary,  setSiteLibrary]  = useState([])
  const [tplName,      setTplName]      = useState('')
  const [showSaveTpl,  setShowSaveTpl]  = useState(false)
  const [tidHistory,   setTidHistory]   = useState({})
  const [showTidDD,    setShowTidDD]    = useState(false)
  const [showDelTidDD, setShowDelTidDD] = useState(false)
  const [showBrkTidDD, setShowBrkTidDD] = useState(false)
  const [showWrkTidDD, setShowWrkTidDD] = useState(false)
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
  const [bulkDateOpen, setBulkDateOpen] = useState(false)
  const [bulkDateVal,  setBulkDateVal]  = useState('')
  const [exporter,     setExporter]     = useState(() => { try { return localStorage.getItem('opshub_wo_exporter') || '' } catch { return '' } })
  const [showExporterModal, setShowExporterModal] = useState(false)
  const [exporterInput, setExporterInput] = useState('')
  const [pendingExport, setPendingExport] = useState(null) // 'download' | 'push'
  const [addonExpanded, setAddonExpanded] = useState(false)
  const [addonWoType,  setAddonWoType]  = useState('DEL')
  const [addonConfig,  setAddonConfig]  = useState({ ...WO_DEFAULTS.DEL })
  const [addonGenerating, setAddonGenerating] = useState(false)
  const [pushing,      setPushing]      = useState(false)
  const [pushProgress, setPushProgress] = useState({ done: 0, total: 0 })
  const [pushResults,  setPushResults]  = useState(null)
  const { checking, dupeResults, checkDupes, clearDupes } = useFNSync()
  const fileInputRef = useRef(null)
  const inputRefs = useRef({})
  const prevConfigRef = useRef(woConfig)

  const ALL_WO_TYPES = Object.fromEntries(
    Object.entries({ ...WO_TYPES, ...customTypes })
      .filter(([k]) => !deletedBuiltins[k])
      .map(([k, v]) => [k, overriddenBuiltins[k] ? { ...v, ...overriddenBuiltins[k] } : v])
  )
  const isSDT = woType === 'SDT' || ALL_WO_TYPES[woType]?.customBuild === 'SDT'
  const sdtWosPerSite = sdtConfig.reduce((n, s) => n + (Number(s.numTechs) || 1), 0)
  const cfgDays = Math.min(Number(woConfig.numDays) || 1, 7)

  useEffect(() => {
    supabase.from('job_history').select('*').order('created_at',{ascending:false}).limit(100).then(({data})=>{if(data)setJobHistory(data)})
    supabase.from('wo_templates').select('*').order('created_at',{ascending:false}).limit(50).then(({data})=>{if(data)setWoTemplates(data)})
    supabase.from('site_library').select('*').order('created_at',{ascending:false}).limit(100).then(({data})=>{if(data)setSiteLibrary(data)})
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
    const job = {project_id:projectId,display_name:displayName,wo_type:woType,wo_config:woConfig,del_config:includeDEL?delConfig:null,include_del:includeDEL,brk_config:includeBRK?brkConfig:null,include_brk:includeBRK,wrk_config:includeWRK?wrkConfig:null,include_wrk:includeWRK,sdt_config:isSDT?sdtConfig:null,sites:sites.filter(s=>s.code||s.address),site_count:sites.filter(rowComplete).length,created_at:new Date().toISOString(),...extra}
    const {data} = await supabase.from('job_history').insert(job).select()
    if(data?.[0])setJobHistory(prev=>[data[0],...prev].slice(0,100))
  }

  // ── Templates ─────────────────────────────────────────────

  const applyTemplate = (tpl) => {
    const d = tpl.data || {}
    if (d.woType) setWoType(d.woType)
    if (d.woConfig) setWoConfig(d.woConfig)
    setIncludeDEL(!!d.includeDEL); if (d.delConfig) setDelConfig(d.delConfig)
    setIncludeBRK(!!d.includeBRK); if (d.brkConfig) setBrkConfig(d.brkConfig)
    setIncludeWRK(!!d.includeWRK); if (d.wrkConfig) setWrkConfig(d.wrkConfig)
    if (Array.isArray(d.sdtConfig) && d.sdtConfig.length) setSdtConfig(d.sdtConfig)
    setShowTemplates(false)
  }

  const saveTemplate = async () => {
    if (!tplName.trim()) return
    const data = { woType, woConfig, includeDEL, delConfig, includeBRK, brkConfig, includeWRK, wrkConfig, sdtConfig: isSDT ? sdtConfig : null }
    const { data: rows } = await supabase.from('wo_templates').insert({ name: tplName.trim(), data, created_at: new Date().toISOString() }).select()
    if (rows?.[0]) setWoTemplates(prev => [rows[0], ...prev])
    setTplName(''); setShowSaveTpl(false)
  }

  const deleteTemplate = async (id) => {
    await supabase.from('wo_templates').delete().eq('id', id)
    setWoTemplates(prev => prev.filter(t => t.id !== id))
  }

  // ── Site Library ──────────────────────────────────────────

  const saveToLibrary = async () => {
    const rows = sites.filter(s => s.code || s.address)
    if (!rows.length) return
    const entry = {
      project_name: displayName.trim() || projectId.trim() || 'Untitled',
      project_id: projectId,
      sites: rows,
      site_count: sites.filter(rowComplete).length,
      source_format: 'manual',
      created_at: new Date().toISOString(),
    }
    const { data } = await supabase.from('site_library').insert(entry).select()
    if (data?.[0]) setSiteLibrary(prev => [data[0], ...prev])
  }

  const loadFromLibrary = (entry) => {
    const loaded = (entry.sites || []).map(s => ({ ...EMPTY_SITE(), ...s }))
    if (!loaded.length) return
    setSites(prev => {
      const existing = prev.filter(s => s.code || s.address || s.branchName)
      return existing.length ? [...existing, ...loaded] : loaded
    })
    setShowLibrary(false)
    setPasteMode(false); setImportMode(false)
    if (step === 0) setStep(1)
  }

  const deleteLibraryEntry = async (id) => {
    await supabase.from('site_library').delete().eq('id', id)
    setSiteLibrary(prev => prev.filter(e => e.id !== id))
  }

  // ── Sites table ───────────────────────────────────────────

  const updateSite = (i,field,val) => setSites(prev=>prev.map((s,idx)=>{
    if(idx!==i)return s
    const addrFields=['address','city','state','zip']
    return {...s,[field]:val,verified:addrFields.includes(field)?null:s.verified,verifyError:'',...(field==='date'?{dateOverridden:true}:{})}
  }))

  const addRows = (n) => setSites(prev=>[...prev,...Array(n).fill(null).map(()=>({...EMPTY_SITE(),date:woConfig.defaultDate||'',numTechs:woConfig.numTechs||'1',numDays:woConfig.numDays||'1'}))])
  const removeSite = (i) => setSites(prev=>prev.length>1?prev.filter((_,idx)=>idx!==i):prev)

  const applyBulkDate = (clear=false) => {
    setSites(prev=>prev.map(s=>({...s,date:clear?'':bulkDateVal,dateOverridden:!clear})))
    setBulkDateOpen(false); setBulkDateVal('')
  }

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
    if(includeWRK&&wrkConfig.templateId?.trim())saveTidHistory('WRK',wrkConfig.templateId.trim())
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

  // ── Row building (shared by CSV download + FN push) ───────

  const buildAllFiles = useCallback(() => {
    const files = []
    const rows = []
    for (const site of sites) rows.push(...buildRows(site, projectId, displayName, woType, woConfig, ALL_WO_TYPES, sdtConfig))
    if (rows.length && rows[rows.length-1].length === 0) rows.pop()
    files.push({ type: woType, rows })

    const companions = [
      includeDEL && { type: 'DEL', cfg: delConfig },
      includeBRK && { type: 'BRK', cfg: brkConfig },
      includeWRK && { type: 'WRK', cfg: wrkConfig },
    ].filter(Boolean)

    for (const { type, cfg } of companions) {
      const cRows = []
      for (const site of sites) {
        if (!site.address && !site.code) continue
        const s1 = { ...site, numTechs: '1', numDays: '1', budgetTech: '', payRate: '', ...(cfg.date ? { date: cfg.date } : {}) }
        cRows.push(...buildRows(s1, projectId, displayName, type, cfg, ALL_WO_TYPES, sdtConfig))
      }
      if (cRows.length && cRows[cRows.length-1].length === 0) cRows.pop()
      if (cRows.length) files.push({ type, rows: cRows })
    }
    return files
  }, [sites, projectId, displayName, woType, woConfig, sdtConfig, includeDEL, delConfig, includeBRK, brkConfig, includeWRK, wrkConfig, ALL_WO_TYPES])

  // Gate an export action behind having an exporter name (CPWOG "WHO'S EXPORTING?")
  const ensureExporter = (action) => {
    if (exporter.trim()) { action === 'download' ? downloadCSV(exporter) : pushToFN() ; return }
    setExporterInput(''); setPendingExport(action); setShowExporterModal(true)
  }

  const confirmExporter = () => {
    const name = exporterInput.trim()
    if (!name) return
    setExporter(name)
    try { localStorage.setItem('opshub_wo_exporter', name) } catch { /* ignore */ }
    setShowExporterModal(false)
    if (pendingExport === 'download') downloadCSV(name)
    else if (pendingExport === 'push') pushToFN()
    setPendingExport(null)
  }

  const downloadCSV = useCallback(async (exporterName = exporter) => {
    setGenerating(true)
    try {
      const now=new Date(),datePart=now.toISOString().split('T')[0]
      const safeProj=projectId.replace(/[^a-zA-Z0-9]/g,'_').slice(0,40)
      const safeExp=(exporterName||'').replace(/[^a-zA-Z0-9]/g,'_').slice(0,24)
      const files = buildAllFiles()
      const csvFiles=[]
      files.forEach((f, i) => {
        const filename = `FieldNation_${f.type}_${safeProj}_${datePart}${safeExp?`_${safeExp}`:''}.csv`
        const content = toCSV(WO_HEADERS, f.rows)
        csvFiles.push({ filename, content })
        if (i === 0) triggerDownload(content, filename)
        else setTimeout(() => triggerDownload(content, filename), i * 500)
      })
      const MAX=400_000
      const compressed=await Promise.all(csvFiles.filter(f=>f.content.length<=MAX).map(async f=>({filename:f.filename,content:await compressString(f.content),compressed:true})))
      await saveJob({csv_files:compressed})
    } catch(err){alert('Error: '+err.message)}
    setGenerating(false)
  }, [buildAllFiles, projectId, exporter])

  // ── FieldNation push (the final step) ─────────────────────

  const pushToFN = useCallback(async () => {
    setPushing(true)
    setPushResults(null)
    try {
      const files = buildAllFiles()
      const allRows = files.flatMap(f => f.rows.filter(r => r.length > 0))
      setPushProgress({ done: 0, total: allRows.length })
      const results = []
      for (const row of allRows) {
        const siteId = row[2]
        try {
          const r = await pushWorkOrder(row, projectId)
          results.push({ site_id: siteId, ok: !!r.ok, mock: !!r.mock, wo_id: r.wo_id, status: r.status, url: r.url })
        } catch (e) {
          results.push({ site_id: siteId, ok: false, error: e.message })
        }
        setPushProgress(p => ({ ...p, done: p.done + 1 }))
        setPushResults([...results])
      }
      setPushResults(results)
      const pushed = results.filter(r => r.ok).length
      await saveJob({ fn_results: results, csv_files: [] })
      setJoke(pushed === results.length
        ? `All ${pushed} work orders uploaded to FieldNation 🎉`
        : `${pushed}/${results.length} uploaded — review failures below`)
    } catch (err) {
      alert('Push error: ' + err.message)
    }
    setPushing(false)
  }, [buildAllFiles, projectId])

  const downloadAddon = async () => {
    setAddonGenerating(true)
    try {
      const now=new Date(),datePart=now.toISOString().split('T')[0]
      const safeProj=projectId.replace(/[^a-zA-Z0-9]/g,'_').slice(0,40)
      const safeExp=(exporter||'').replace(/[^a-zA-Z0-9]/g,'_').slice(0,24)
      const meta=ALL_WO_TYPES[addonWoType]||{}
      const rows=[]
      for(const site of sites){
        if(!site.address&&!site.code)continue
        const s={...site,numTechs:addonConfig.numTechs||String(meta.numTechs||1),numDays:addonConfig.numDays||String(meta.numDays||1),budgetTech:'',payRate:'',...(addonConfig.date?{date:addonConfig.date}:{})}
        rows.push(...buildRows(s,projectId,displayName,addonWoType,addonConfig,ALL_WO_TYPES,sdtConfig))
      }
      if(rows.length&&rows[rows.length-1].length===0)rows.pop()
      if(rows.length)triggerDownload(toCSV(WO_HEADERS,rows),`FieldNation_${addonWoType}_${safeProj}_${datePart}${safeExp?`_${safeExp}`:''}_ADDON.csv`)
    } catch(err){alert('Error: '+err.message)}
    setAddonGenerating(false)
  }

  // ── SDT schedule editing ──────────────────────────────────

  const updateSlot = (id, field, val) => setSdtConfig(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s))
  const addSlot = (day) => setSdtConfig(prev => [...prev, { id: `s${Date.now()}`, type: 'BH', day, time: '11:00am', hours: 8, budget: 450, numTechs: 1 }])
  const removeSlot = (id) => setSdtConfig(prev => prev.filter(s => s.id !== id))

  const totalRows=sites.filter(rowComplete).reduce((sum,s)=>sum+buildRows(s,projectId,displayName,woType,woConfig,ALL_WO_TYPES,sdtConfig).filter(r=>r.length>0).length,0)
  const companionCount = sites.filter(rowComplete).length
  const canProceed=[projectId.trim().length>0&&!!woType,sites.every(rowComplete),true]
  const anyUnverified=sites.some(s=>s.address&&s.verified!==true)
  const totalPushRows = totalRows + (includeDEL?companionCount:0) + (includeBRK?companionCount:0) + (includeWRK?companionCount:0)

  return (
    <div className={styles.page}>
      <PageHeader title="Work Orders" subtitle="FieldNation work order generator"
        actions={
          <div className={styles.headerActions}>
            <button className={styles.ghostBtn} onClick={()=>setShowTemplates(true)}><BookTemplate size={13}/> Templates{woTemplates.length>0&&<span className={styles.badge}>{woTemplates.length}</span>}</button>
            <button className={styles.ghostBtn} onClick={()=>setShowLibrary(true)}><Library size={13}/> Library{siteLibrary.length>0&&<span className={styles.badge}>{siteLibrary.length}</span>}</button>
            <button className={styles.ghostBtn} onClick={()=>setShowHistory(true)}><History size={13}/> History{jobHistory.length>0&&<span className={styles.badge}>{jobHistory.length}</span>}</button>
            {!adminUnlocked?<button className={styles.ghostBtn} onClick={()=>setShowAdminPw(true)}>🔒</button>:<button className={`${styles.ghostBtn} ${styles.adminActive}`} onClick={()=>setAdminUnlocked(false)}>🔓</button>}
          </div>
        }
      />

      <div className={styles.body}>
        {/* View tabs */}
        <div className={styles.viewTabs}>
          <button className={`${styles.viewTab} ${view==='generator'?styles.viewTabActive:''}`} onClick={()=>setView('generator')}>Generator</button>
          <button className={`${styles.viewTab} ${view==='list'?styles.viewTabActive:''}`} onClick={()=>setView('list')}>Work Order List</button>
        </div>

        {view==='generator'&&(<>
        {/* Step bar */}
        <div className={styles.stepBar}>
          {STEP_LABELS.map((label,i)=>(
            <div key={i} className={styles.stepItem}>
              <div className={`${styles.stepNum} ${i<step?styles.stepDone:i===step?styles.stepActive:styles.stepPending}`}>{i<step?<Check size={11}/>:i+1}</div>
              <span className={`${styles.stepLabel} ${i===step?styles.stepLabelActive:''}`}>{label}</span>
              {i<STEP_LABELS.length-1&&<div className={`${styles.stepLine} ${i<step?styles.stepLineDone:''}`}/>}
            </div>
          ))}
        </div>

        <div className={styles.content}>
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
              </div>

              <div className={styles.card}>
                <div className={styles.cardTitle}>Work Order Type</div>
                <div className={styles.woTypeList}>
                  {Object.entries(ALL_WO_TYPES).map(([key,wot])=>(
                    <div key={key} className={`${styles.woCard} ${woType===key?styles.woCardActive:''}`} onClick={()=>{setWoType(key);setWoConfig(WO_DEFAULTS[key]?{...WO_DEFAULTS[key]}:{templateId:'',startTime:'',defaultDate:'',techType:'Tech',numTechs:String(wot.numTechs||1),numDays:String(wot.numDays||1),budgetTech:'',payRate:'',approxHours:'',country:'US',payType:'Fixed'})}}>
                      <div className={styles.woCardRadio}>{woType===key&&<div className={styles.woCardRadioDot}/>}</div>
                      <div className={styles.woCardInfo}><span className={styles.woCardKey}>{key}</span><span className={styles.woCardLabel}>{wot.label||key}</span></div>
                      <div className={styles.woCardMeta}>{wot.customBuild==='SDT'?`${sdtWosPerSite} WOs/site`:`${wot.numTechs}t × ${wot.numDays}d`}{wot.useBundle?' · bundled':''}</div>
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
                    {[{k:'startTime',l:'Start Time',ph:'4:30pm'},{k:'defaultDate',l:'Default Date',type:'date'},{k:'techType',l:'Tech Type',ph:'Tech 1'},{k:'numTechs',l:'# Techs',ph:'1'},{k:'numDays',l:'# Days',ph:'3'},{k:'budgetTech',l:'Budget $',ph:'700'},{k:'payRate',l:'Pay Rate $',ph:'700'},{k:'approxHours',l:'Est Hours',ph:'10'},{k:'country',l:'Country',ph:'US'}].map(({k,l,ph,type:t})=>{
                      const sdtControlled=isSDT&&['startTime','numTechs','numDays','budgetTech','payRate','approxHours'].includes(k)
                      return (
                        <div key={k} className={`${styles.field} ${sdtControlled?styles.fieldDimmed:''}`}>
                          <label>{l}{sdtControlled&&<span className={styles.sdtNote}> · SDT schedule</span>}</label>
                          <input className={`${styles.input}${k==='defaultDate'&&isPastDate(woConfig[k])?` ${styles.inputWarn}`:''}`} type={t||'text'} placeholder={ph||''} value={woConfig[k]||''} disabled={sdtControlled} onChange={e=>setWoConfig(p=>({...p,[k]:e.target.value}))}/>
                        </div>
                      )
                    })}
                    <div className={styles.field} style={{gridColumn:'span 2'}}>
                      <label>Pay Type</label>
                      <div className={styles.payTypeRow}>
                        {['Fixed','Hourly'].map(pt=><button key={pt} className={`${styles.payTypeBtn} ${(woConfig.payType||'Fixed')===pt?styles.payTypeBtnActive:''}`} onClick={()=>setWoConfig(p=>({...p,payType:pt}))}>{pt}</button>)}
                      </div>
                    </div>
                  </div>

                  {/* Schedule options — per-day start times + check-in window */}
                  {!isSDT&&(
                    <div className={styles.schedSection}>
                      <label className={styles.checkLabel}>
                        <input type="checkbox" checked={!!woConfig.perDayTimes} onChange={()=>setWoConfig(p=>({...p,perDayTimes:!p.perDayTimes}))}/>
                        Use a different start time for each day
                      </label>
                      {woConfig.perDayTimes&&(
                        <div className={styles.dayTimeGrid} style={{gridTemplateColumns:`repeat(${cfgDays},1fr)`}}>
                          {Array.from({length:cfgDays},(_,i)=>(
                            <div key={i} className={styles.field}>
                              <label>{dayLabel(woConfig.defaultDate,i)}</label>
                              <input className={styles.input} placeholder={woConfig.startTime||'8:00am'} value={(woConfig.startTimes||[])[i]||''} onChange={e=>setWoConfig(p=>{const a=[...(p.startTimes||['','','','','','',''])];a[i]=e.target.value;return{...p,startTimes:a}})}/>
                            </div>
                          ))}
                        </div>
                      )}

                      <label className={styles.checkLabel}>
                        <input type="checkbox" checked={!!woConfig.checkInWindow} onChange={()=>setWoConfig(p=>({...p,checkInWindow:!p.checkInWindow}))}/>
                        Check-in window (start + end time) instead of a hard start
                      </label>
                      {woConfig.checkInWindow&&!woConfig.perDayTimes&&(
                        <div className={styles.dayTimeGrid} style={{gridTemplateColumns:'1fr 1fr'}}>
                          <div className={styles.field}>
                            <label>Window Start</label>
                            <input className={styles.input} placeholder="8:00am" value={woConfig.startTime||''} onChange={e=>setWoConfig(p=>({...p,startTime:e.target.value}))}/>
                          </div>
                          <div className={styles.field}>
                            <label>Window End</label>
                            <input className={styles.input} placeholder="10:00am" value={woConfig.endTime||''} onChange={e=>setWoConfig(p=>({...p,endTime:e.target.value}))}/>
                          </div>
                        </div>
                      )}
                      {woConfig.checkInWindow&&woConfig.perDayTimes&&(
                        <div className={styles.dayTimeGrid} style={{gridTemplateColumns:`repeat(${cfgDays},1fr)`}}>
                          {Array.from({length:cfgDays},(_,i)=>(
                            <div key={i} className={styles.field}>
                              <label>{dayLabel(woConfig.defaultDate,i)} end</label>
                              <input className={styles.input} placeholder={woConfig.endTime||'10:00am'} value={(woConfig.endTimes||[])[i]||''} onChange={e=>setWoConfig(p=>{const a=[...(p.endTimes||['','','','','','',''])];a[i]=e.target.value;return{...p,endTimes:a}})}/>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className={styles.schedHint}>
                        {woConfig.checkInWindow?'Rows use a start AND end time (check-in window).':'Rows use a single hard start time.'}
                        {woConfig.perDayTimes?' Per-day times override the Start Time field above.':''}
                        {woConfig.perDayTimes&&!woConfig.defaultDate?' Set a Default Date above to see real day-of-week dates here.':''}
                      </p>
                    </div>
                  )}

                  {/* SDT Work Order Schedule */}
                  {isSDT&&(
                    <div className={styles.sdtPanel}>
                      <div className={styles.sdtPanelHeader}>
                        <span className={styles.sdtPanelTitle}>SDT Work Order Schedule · {sdtWosPerSite} WOs per site</span>
                        <button className={styles.microBtn} onClick={()=>setSdtConfig([...SDT_DEFAULTS])}>↩ Reset</button>
                      </div>
                      {[1,2,3].map(day=>(
                        <div key={day} className={styles.sdtDay}>
                          <div className={styles.sdtDayLabel}>Day {day}</div>
                          {sdtConfig.filter(s=>s.day===day).map(slot=>(
                            <div key={slot.id} className={styles.sdtSlot}>
                              <select className={styles.sdtSelect} value={slot.type} onChange={e=>updateSlot(slot.id,'type',e.target.value)}>
                                <option value="BH">BH</option>
                                <option value="AH">AH</option>
                              </select>
                              <input className={styles.sdtInput} value={slot.time} onChange={e=>updateSlot(slot.id,'time',e.target.value)} placeholder="2:00pm"/>
                              <div className={styles.sdtNum}><label>hrs</label><input className={styles.sdtInput} type="number" min={1} value={slot.hours} onChange={e=>updateSlot(slot.id,'hours',e.target.value)}/></div>
                              <div className={styles.sdtNum}><label>$</label><input className={styles.sdtInput} type="number" min={0} value={slot.budget} onChange={e=>updateSlot(slot.id,'budget',e.target.value)}/></div>
                              <div className={styles.sdtNum}><label>techs</label><input className={styles.sdtInput} type="number" min={1} max={9} value={slot.numTechs} onChange={e=>updateSlot(slot.id,'numTechs',e.target.value)}/></div>
                              <button className={styles.removeBtn} onClick={()=>removeSlot(slot.id)}>×</button>
                            </div>
                          ))}
                          <button className={styles.sdtAddBtn} onClick={()=>addSlot(day)}><Plus size={11}/> Add slot</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <CompanionToggle label="Also generate WRK (Walk In Ready Kit) on Day 1" enabled={includeWRK} onToggle={()=>setIncludeWRK(v=>!v)} config={wrkConfig} setConfig={setWrkConfig} type="WRK" tidHistory={tidHistory} showTidDD={showWrkTidDD} setShowTidDD={setShowWrkTidDD} styles={styles}/>
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
                      <button className={styles.ghostBtn} onClick={()=>{setBulkDateVal(woConfig.defaultDate||'');setBulkDateOpen(true)}}><Calendar size={12}/> Bulk Date</button>
                      <button className={styles.ghostBtn} onClick={saveToLibrary} disabled={!sites.some(s=>s.code||s.address)} title="Save this site list to the Library">🏗 Save to Library</button>
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
                <div className={styles.reviewCard}><div className={styles.reviewCardLabel}>Project ID</div><div className={styles.reviewCardValue}>{projectId}</div>{displayName&&displayName!==projectId&&<div className={styles.reviewCardSub}>Prefix: {displayName}</div>}</div>
                <div className={styles.reviewCard}><div className={styles.reviewCardLabel}>WO Type</div><div className={styles.reviewCardValue} style={{color:'var(--amber)',fontFamily:'var(--font-head)',fontSize:20}}>{woType}{includeDEL?' + DEL':''}{includeBRK?' + BRK':''}{includeWRK?' + WRK':''}</div><div className={styles.reviewCardSub}>{ALL_WO_TYPES[woType]?.label}</div></div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardTitle}>Summary</div>
                {[['Sites',sites.filter(rowComplete).length],['Pattern',isSDT?`${sdtWosPerSite} WOs/site · bundled BH/AH over 3 days`:`${woConfig.numTechs}t × ${woConfig.numDays}d`],['Template ID',woConfig.templateId],['Start Time',isSDT?'per SDT schedule':woConfig.perDayTimes?`per-day${woConfig.checkInWindow?' windows':' times'}`:woConfig.checkInWindow?`${woConfig.startTime||'—'} – ${woConfig.endTime||'—'} window`:woConfig.startTime||'—'],['Budget / Pay',isSDT?'per SDT schedule':`$${woConfig.budgetTech} / $${woConfig.payRate}`],['Pay Type',woConfig.payType||'Fixed'],['Total rows',`${totalRows}${includeDEL?` + ${companionCount} DEL`:''}${includeBRK?` + ${companionCount} BRK`:''}${includeWRK?` + ${companionCount} WRK`:''}`,true]].map(([l,v,bold])=>(
                  <div key={l} className={styles.summaryRow}><span className={styles.summaryLabel}>{l}</span><span className={`${styles.summaryValue} ${bold?styles.summaryValueBold:''}`}>{v}</span></div>
                ))}
              </div>
              <div className={styles.card}>
                <div className={styles.cardTitle}>Sites ({sites.filter(rowComplete).length}){sites.filter(s=>rowComplete(s)&&(s.routeToTechs||[]).some(Boolean)).length>0&&<span className={styles.routedBadge}> · {sites.filter(s=>rowComplete(s)&&(s.routeToTechs||[]).some(Boolean)).length} pre-routed 🎯</span>}</div>
                <div className={styles.siteCards}>
                  {sites.filter(rowComplete).map((s)=>{
                    const realIdx=sites.indexOf(s)
                    return (
                      <div key={realIdx} className={styles.siteCard} style={{borderLeftColor:s.womId?'var(--amber)':s.verified===true?'var(--green)':'var(--border-strong)'}}>
                        <div className={styles.siteCardCode}>{s.code}{s.branchName?` — ${s.branchName}`:''}</div>
                        <div className={styles.siteCardAddr}>{s.address}{s.address2?`, ${s.address2}`:''}<br/>{s.city}, {s.state} {s.zip}</div>
                        <input type="date" className={styles.siteCardInput} value={s.date} onChange={e=>updateSite(realIdx,'date',e.target.value)}/>
                        <input className={`${styles.siteCardInput} ${s.womId?styles.siteCardInputSet:''}`} value={s.womId||''} onChange={e=>updateSite(realIdx,'womId',e.target.value)} placeholder="Work Order Manager ID"/>
                        {(s.budgetTech||s.payRate)&&<div className={styles.siteCardOverride}>⚡ ${s.budgetTech||woConfig.budgetTech} / ${s.payRate||woConfig.payRate}</div>}
                      </div>
                    )
                  })}
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

              {/* Exported by strip */}
              <div className={styles.exporterStrip}>
                <span>📋 Exported by:</span>
                {exporter
                  ? <><b>{exporter}</b><button className={styles.exporterChange} onClick={()=>{setExporterInput(exporter);setPendingExport(null);setShowExporterModal(true)}}>change</button></>
                  : <button className={styles.exporterChange} onClick={()=>{setExporterInput('');setPendingExport(null);setShowExporterModal(true)}}>set name</button>}
              </div>

              {/* Final actions: FieldNation API upload + CSV download */}
              <button className={styles.pushBtn} onClick={()=>ensureExporter('push')} disabled={pushing||generating||totalPushRows===0}>
                {pushing
                  ? <><Loader size={16} className={styles.spinning}/> Uploading {pushProgress.done}/{pushProgress.total} to FieldNation…</>
                  : <><UploadCloud size={16}/> Upload {totalPushRows} WO{totalPushRows!==1?'s':''} to FieldNation</>}
              </button>
              <button className={styles.downloadBtn} onClick={()=>ensureExporter('download')} disabled={generating||pushing}><Download size={16}/>{generating?'Building CSV…':`Download ${woType}${includeDEL?' + DEL':''}${includeBRK?' + BRK':''}${includeWRK?' + WRK':''} CSV${(includeDEL||includeBRK||includeWRK)?'s':''}`}</button>

              {/* Push results */}
              {pushResults&&(
                <div className={styles.pushResults}>
                  <div className={styles.pushResultsHeader}>
                    <span className={styles.pushResultsTitle}>
                      FieldNation upload — {pushResults.filter(r=>r.ok).length}/{pushResults.length} succeeded
                      {pushResults.some(r=>r.mock)&&<span className={styles.mockNote}> (mock mode — configure FN credentials in Settings → API to go live)</span>}
                    </span>
                    <button className={styles.ghostBtn} onClick={()=>setPushResults(null)}>Clear</button>
                  </div>
                  <div className={styles.pushResultsList}>
                    {pushResults.map((r,i)=>(
                      <div key={i} className={`${styles.pushResultItem} ${r.ok?'':styles.pushResultFail}`}>
                        {r.ok?<Check size={12} style={{color:'var(--green)',flexShrink:0}}/>:<X size={12} style={{color:'var(--red)',flexShrink:0}}/>}
                        <span className={styles.pushResultSite}>{r.site_id}</span>
                        {r.ok
                          ? <span className={styles.pushResultMeta}>WO {r.wo_id}{r.status?` · ${r.status}`:''}{r.mock?' · mock':''}</span>
                          : <span className={styles.pushResultErr}>{r.error}</span>}
                        {r.ok&&r.url&&r.url!=='#'&&<a href={r.url} target="_blank" rel="noreferrer" className={styles.dupeLink}><ExternalLink size={11}/> View in FN</a>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add-on generator */}
              <div className={styles.addonCard}>
                <button className={styles.addonToggle} onClick={()=>setAddonExpanded(v=>!v)}>
                  <span><Sparkles size={13}/> Generate additional WOs for these sites</span>
                  <span>{addonExpanded?'▲':'▼'}</span>
                </button>
                {addonExpanded&&(
                  <div className={styles.addonBody}>
                    <div className={styles.configGrid}>
                      <div className={styles.field}>
                        <label>WO Type</label>
                        <select className={styles.input} value={addonWoType} onChange={e=>{const k=e.target.value;setAddonWoType(k);setAddonConfig(WO_DEFAULTS[k]?{...WO_DEFAULTS[k]}:{...WO_DEFAULTS.LVL,templateId:'',numTechs:String(ALL_WO_TYPES[k]?.numTechs||1),numDays:String(ALL_WO_TYPES[k]?.numDays||1)})}}>
                          {Object.entries(ALL_WO_TYPES).map(([k,v])=><option key={k} value={k}>{v.label||k}</option>)}
                        </select>
                      </div>
                      {[{k:'templateId',l:'Template ID',ph:'102221'},{k:'startTime',l:'Start Time',ph:'1:00pm'},{k:'date',l:'Override Date',type:'date'},{k:'techType',l:'Tech Type',ph:'Tech'},{k:'numTechs',l:'# Techs',ph:'1'},{k:'numDays',l:'# Days',ph:'1'},{k:'budgetTech',l:'Budget $',ph:'200'},{k:'payRate',l:'Pay Rate $',ph:'150'},{k:'approxHours',l:'Est Hours',ph:'3'}].map(({k,l,ph,type:t})=>(
                        <div key={k} className={styles.field}><label>{l}</label><input className={styles.input} type={t||'text'} placeholder={ph||''} value={addonConfig[k]||''} onChange={e=>setAddonConfig(p=>({...p,[k]:e.target.value}))}/></div>
                      ))}
                    </div>
                    <button className={styles.addonBtn} onClick={downloadAddon} disabled={addonGenerating}><Download size={13}/>{addonGenerating?'Building…':`Download ${addonWoType} add-on CSV`}</button>
                  </div>
                )}
              </div>

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
        </>)}

        {view==='list'&&<WorkOrderListView/>}
      </div>

      {/* Templates Panel */}
      {showTemplates&&(
        <div className={styles.panelOverlay} onClick={()=>setShowTemplates(false)}>
          <div className={styles.panel} onClick={e=>e.stopPropagation()}>
            <div className={styles.panelHeader}><h3>📋 WO Templates</h3><button onClick={()=>setShowTemplates(false)}><X size={16}/></button></div>
            <div className={styles.panelSearch}>
              {showSaveTpl?(
                <div className={styles.inputRow}>
                  <input className={styles.input} autoFocus placeholder="Template name…" value={tplName} onChange={e=>setTplName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveTemplate()}/>
                  <button className={styles.applyBtn} onClick={saveTemplate} disabled={!tplName.trim()}>Save</button>
                  <button className={styles.ghostBtn} onClick={()=>setShowSaveTpl(false)}>×</button>
                </div>
              ):(
                <button className={styles.primaryBtn} style={{width:'100%'}} onClick={()=>setShowSaveTpl(true)}><Plus size={13}/> Save current config as template</button>
              )}
            </div>
            <div className={styles.panelBody}>
              {woTemplates.length===0&&<p className={styles.panelEmpty}>No templates saved yet. Configure a WO type + companions, then save it here for one-click reuse.</p>}
              {woTemplates.map(tpl=>(
                <div key={tpl.id} className={styles.historyCard}>
                  <div className={styles.historyCardTop}>
                    <div><div className={styles.historyCardTitle}>{tpl.name}</div><div className={styles.historyCardSub}>{tpl.data?.woType}{tpl.data?.includeDEL?' + DEL':''}{tpl.data?.includeBRK?' + BRK':''}{tpl.data?.includeWRK?' + WRK':''}{tpl.data?.woConfig?.templateId?` · ${tpl.data.woConfig.templateId}`:''}</div></div>
                    <div className={styles.historyCardDate}>{new Date(tpl.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className={styles.historyCardActions}>
                    <button className={styles.restoreBtn} onClick={()=>applyTemplate(tpl)}>Apply</button>
                    <button className={`${styles.ghostBtn} ${styles.dangerGhost}`} onClick={()=>deleteTemplate(tpl.id)}><Trash2 size={11}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Site Library Panel */}
      {showLibrary&&(
        <div className={styles.panelOverlay} onClick={()=>setShowLibrary(false)}>
          <div className={styles.panel} onClick={e=>e.stopPropagation()}>
            <div className={styles.panelHeader}><h3>🏗 Site Library</h3><button onClick={()=>setShowLibrary(false)}><X size={16}/></button></div>
            <div className={styles.panelSearch}><input className={styles.input} placeholder="Search…" value={libSearch} onChange={e=>setLibSearch(e.target.value)}/></div>
            <div className={styles.panelBody}>
              {siteLibrary.length===0&&<p className={styles.panelEmpty}>No site lists saved yet. Use &quot;Save to Library&quot; in the site table to store a list for reuse.</p>}
              {siteLibrary.filter(e=>{if(!libSearch.trim())return true;const q=libSearch.toLowerCase();return(e.project_name||'').toLowerCase().includes(q)||(e.project_id||'').toLowerCase().includes(q)}).map(entry=>(
                <div key={entry.id} className={styles.historyCard}>
                  <div className={styles.historyCardTop}>
                    <div><div className={styles.historyCardTitle}>{entry.project_name}</div>{entry.project_id&&entry.project_id!==entry.project_name&&<div className={styles.historyCardSub}>{entry.project_id}</div>}</div>
                    <div className={styles.historyCardDate}>{new Date(entry.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className={styles.historyCardMeta}>{(entry.sites||[]).length} sites ({entry.site_count} complete)</div>
                  <div className={styles.historyCardActions}>
                    <button className={styles.restoreBtn} onClick={()=>loadFromLibrary(entry)}>Load sites</button>
                    <button className={`${styles.ghostBtn} ${styles.dangerGhost}`} onClick={()=>deleteLibraryEntry(entry.id)}><Trash2 size={11}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
                  <div className={styles.historyCardMeta}>{job.site_count} sites{job.wo_config?.templateId&&` · ${job.wo_config.templateId}`}{job.include_del&&' · +DEL'}{job.include_brk&&' · +BRK'}{job.include_wrk&&' · +WRK'}{Array.isArray(job.fn_results)&&job.fn_results.length>0&&` · ⬆ ${job.fn_results.filter(r=>r.ok).length} pushed to FN`}</div>
                  {Array.isArray(job.csv_files)&&job.csv_files.length>0&&(
                    <div className={styles.historyCardFiles}>
                      {job.csv_files.map((f,fi)=>(
                        <button key={fi} className={styles.redownloadBtn} onClick={async()=>{const content=f.compressed?await decompressString(f.content):f.content;triggerDownload(content,f.filename)}}><Download size={10}/> {f.filename.replace(/^FieldNation_/,'').replace(/_\d{4}-\d{2}-\d{2}.*$/,'')}</button>
                      ))}
                    </div>
                  )}
                  <div className={styles.historyCardActions}>
                    <button className={styles.restoreBtn} onClick={()=>{setProjectId(job.project_id||'');setDisplayName(job.display_name||'');setWoType(job.wo_type||'LVL');setWoConfig(job.wo_config||WO_DEFAULTS.LVL);if(job.include_del&&job.del_config){setIncludeDEL(true);setDelConfig(job.del_config)}else setIncludeDEL(false);if(job.include_brk&&job.brk_config){setIncludeBRK(true);setBrkConfig(job.brk_config)}else setIncludeBRK(false);if(job.include_wrk&&job.wrk_config){setIncludeWRK(true);setWrkConfig(job.wrk_config)}else setIncludeWRK(false);if(Array.isArray(job.sdt_config)&&job.sdt_config.length)setSdtConfig(job.sdt_config);if(Array.isArray(job.sites)&&job.sites.length)setSites(job.sites.map(s=>({...EMPTY_SITE(),...s})));setStep(0);setShowHistory(false)}}>↩ Restore</button>
                    <button className={styles.ghostBtn} onClick={()=>{setProjectId(job.project_id||'');setDisplayName(job.display_name||'');setWoType(job.wo_type||'LVL');setWoConfig(job.wo_config||WO_DEFAULTS.LVL);if(job.include_del&&job.del_config){setIncludeDEL(true);setDelConfig(job.del_config)}else setIncludeDEL(false);if(job.include_brk&&job.brk_config){setIncludeBRK(true);setBrkConfig(job.brk_config)}else setIncludeBRK(false);if(job.include_wrk&&job.wrk_config){setIncludeWRK(true);setWrkConfig(job.wrk_config)}else setIncludeWRK(false);if(Array.isArray(job.sdt_config)&&job.sdt_config.length)setSdtConfig(job.sdt_config);setSites([{...EMPTY_SITE(),date:(job.wo_config||{}).defaultDate||'',numTechs:(job.wo_config||{}).numTechs||'1',numDays:(job.wo_config||{}).numDays||'1'}]);setStep(0);setShowHistory(false)}}>Config only</button>
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
              <button className={styles.primaryBtn} disabled={!editingKey&&!customForm.key.trim()} onClick={()=>{const k=editingKey||customForm.key.trim();if(!k)return;const entry={label:customForm.label||k,siteIdSuffix:customForm.siteIdSuffix||k,numTechs:Number(customForm.numTechs)||1,numDays:Number(customForm.numDays)||1,useBundle:!!customForm.useBundle};if(WO_TYPES[k]){const nextOv={...overriddenBuiltins,[k]:entry};setOverriddenBuiltins(nextOv);persistWoTypes(customTypes,deletedBuiltins,nextOv)}else{const next={...customTypes,[k]:entry};setCustomTypes(next);persistWoTypes(next,deletedBuiltins,overriddenBuiltins)}setWoType(k);setShowCustomModal(false)}}>Save</button>

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

      {/* WHO'S EXPORTING modal */}
      {showExporterModal&&(
        <div className={styles.modalOverlay} onClick={e=>e.target===e.currentTarget&&setShowExporterModal(false)}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}><h3>Who&apos;s exporting?</h3><button onClick={()=>setShowExporterModal(false)}><X size={15}/></button></div>
            <div className={styles.modalBody}>
              <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:12}}>Your name is stamped on the export filename and job history.</p>
              <div className={styles.field}><label>Name</label><input className={styles.input} autoFocus placeholder="e.g. Chris" value={exporterInput} onChange={e=>setExporterInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&confirmExporter()}/></div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.ghostBtn} onClick={()=>setShowExporterModal(false)}>Cancel</button>
              <button className={styles.primaryBtn} disabled={!exporterInput.trim()} onClick={confirmExporter}>{pendingExport?'Save & Continue':'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk date modal */}
      {bulkDateOpen&&(
        <div className={styles.modalOverlay} onClick={e=>e.target===e.currentTarget&&setBulkDateOpen(false)}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}><h3>📅 Bulk Date</h3><button onClick={()=>setBulkDateOpen(false)}><X size={15}/></button></div>
            <div className={styles.modalBody}>
              <div className={styles.field}><label>Set start date on all {sites.length} rows</label><input className={styles.input} type="date" autoFocus value={bulkDateVal} onChange={e=>setBulkDateVal(e.target.value)}/></div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.ghostBtn} onClick={()=>applyBulkDate(true)}>Clear all dates</button>
              <button className={styles.primaryBtn} disabled={!bulkDateVal} onClick={()=>applyBulkDate(false)}>Apply to all</button>
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
              <button className={styles.primaryBtn} style={{width:'100%'}} onClick={()=>{setStep(0);setPushResults(null);setStartOverConfirm(false)}}>Keep data & start over</button>
              <button className={styles.dangerBtn} style={{width:'100%'}} onClick={()=>{setStep(0);setProjectId('');setDisplayName('');setWoType('LVL');setWoConfig({...WO_DEFAULTS.LVL});setSdtConfig([...SDT_DEFAULTS]);setIncludeDEL(false);setIncludeBRK(false);setIncludeWRK(false);setSites([EMPTY_SITE()]);setPushResults(null);setStartOverConfirm(false)}}>Clear all & start over</button>
              <button className={styles.ghostBtn} style={{width:'100%'}} onClick={()=>setStartOverConfirm(false)}>Cancel</button>
            </div>
          </div>
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
                <input className={styles.input} value={config.templateId||''} onChange={e=>setConfig(p=>({...p,templateId:e.target.value}))} placeholder={type==='DEL'?'102221':type==='BRK'?'102222':''}/>
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
