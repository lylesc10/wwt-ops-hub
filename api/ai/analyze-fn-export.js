import { createHash }   from 'crypto'
import { supa as supabase } from '../../_lib/db.js'
import { logError } from '../_lib/log.js'


const FN_KNOWN_HEADERS = ['ID','Title','Provider','Status','Service Date']

function isFNFormat(headers) {
  return FN_KNOWN_HEADERS.every(h => headers.includes(h))
}

function parseJobType(template, title) {
  if (template) {
    const m = template.match(/-\s*([A-Z]{2,5})$/i)
    if (m) return m[1].toUpperCase()
  }
  if (title) {
    const b = title.match(/\(([A-Z]{2,5}(?:\s+Lead)?)\)/i)
    if (b) return b[1].replace(/\s+Lead/i,'L').toUpperCase()
    const kw = [
      [/delivery/i,'DEL'],[/backer.?board|backboard/i,'BKR'],
      [/security.?walk/i,'SEC'],[/site.?survey/i,'SRV'],
      [/low.?voltage.?lead/i,'LVL'],[/low.?voltage/i,'LVT'],
      [/install.?lead/i,'INL'],[/installation/i,'INT'],
      [/workstation/i,'WRK'],[/uxi/i,'UXI'],
    ]
    for (const [re,t] of kw) if (re.test(title)) return t
  }
  return 'OTHER'
}

function jobCat(type) {
  if (['LVL','LVT','LVV'].includes(type))  return 'LV'
  if (['INL','INT','INS'].includes(type))  return 'INSTALL'
  if (['DEL','BKR'].includes(type))        return 'DELIVERY'
  return 'OTHER'
}

function parsePay(raw) {
  const m = String(raw||'').match(/\$([\d,]+\.?\d*)/)
  return m ? parseFloat(m[1].replace(/,/g,'')) : null
}

function parseDate(raw) {
  const s = String(raw||'').trim()
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  return null
}

function parseLoc(raw) {
  const m = String(raw||'').match(/,\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})/)
  if (m) return { city:m[1].trim(), state:m[2], zip:m[3] }
  const st = String(raw||'').match(/\b([A-Z]{2})\s+\d{5}/)
  return st ? { state:st[1] } : {}
}

function normStatus(raw) {
  const map = {
    'approved':'Completed','paid':'Completed','work done':'Completed','completed':'Completed',
    'assigned':'Assigned','confirmed':'Confirmed',
    'cancelled':'Cancelled','canceled':'Cancelled','expired':'Cancelled',
    'draft':'Draft','published':'Published','routed':'Routed',
  }
  return map[(raw||'').toLowerCase().trim()] ?? (raw||'Unknown')
}

function dedupKey(woId, name, title, date) {
  if (woId) return String(woId)
  const src = `${name||''}|${title||''}|${date||''}`.toLowerCase().replace(/\s+/g,'')
  return 'hash-'+createHash('sha1').update(src).digest('hex').slice(0,16)
}

function g(row, col) {
  if (!col) return null
  const v = row[col]
  return (v==null||String(v).trim()==='') ? null : String(v).trim()
}

export default async function handler(req, res) {
  try {
  if (req.method !== 'POST') return res.status(405).json({ message:'Method not allowed' })

  const { rows, fileName='fn_export' } = req.body ?? {}
  if (!rows?.length) return res.status(400).json({ message:'No rows received' })

  const headers = Object.keys(rows[0])
  let cm, knownFormat = false

  if (!process.env.ANTHROPIC_API_KEY) {
    // No AI key — but if it's known format we don't need it
    if (!isFNFormat(headers)) {
      return res.status(500).json({ message: 'ANTHROPIC_API_KEY not configured in Vercel environment variables' })
    }
  }

  if (isFNFormat(headers)) {
    knownFormat = true
    cm = {
      wo_id:'ID', provider_name:'Provider', provider_id:'Provider ID',
      provider_phone:'Provider Cell', wo_title:'Title', wo_type:'Template',
      status:'Status', work_date:'Service Date', total_pay:'Pay',
      location:'Location', site_city:null, site_state:null,
    }
  } else {
    // AI detection for unknown formats
    const prompt = `FieldNation export. Headers: ${JSON.stringify(headers)}
Sample: ${JSON.stringify(rows.slice(0,5),null,2)}
Return ONLY JSON:
{"wo_id":null,"provider_name":null,"provider_id":null,"provider_phone":null,"wo_title":null,"wo_type":null,"status":null,"work_date":null,"total_pay":null,"pay_rate":null,"site_name":null,"site_code":null,"site_city":null,"site_state":null}`
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
        body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:600,messages:[{role:'user',content:prompt}]}),
      })
      const txt=(await r.json()).content?.[0]?.text??''
      cm=JSON.parse(txt.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim())
    } catch(e) {
      return res.status(500).json({message:`AI detection failed: ${e.message}`})
    }
  }

  // Parse ALL rows — including unassigned (Draft/Cancelled with no provider)
  const batchId = createHash('sha1').update(Date.now().toString() + Math.random().toString()).digest('hex').slice(0,32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
  const parsed  = []

  for (const row of rows) {
    const woId   = g(row, cm.wo_id)
    const name   = g(row, cm.provider_name)   // may be null for Draft WOs
    const title  = g(row, cm.wo_title) ?? ''
    const tmpl   = g(row, cm.wo_type)  ?? ''
    const date   = parseDate(g(row, cm.work_date))
    const status = normStatus(g(row, cm.status))
    const woType = parseJobType(tmpl, title)

    let city = g(row, cm.site_city), state = g(row, cm.site_state)

    if (knownFormat && row['Location']) {
      const loc = parseLoc(row['Location'])
      city  = loc.city  ?? city
      state = loc.state ?? state
    }

    parsed.push({
      fn_wo_id:      dedupKey(woId, name, title, date),
      provider_name: name,       // null = unassigned WO — still stored
      provider_id:   g(row, cm.provider_id),
      provider_phone:g(row, cm.provider_phone),
      wo_title:      title.slice(0,200),
      wo_type:       woType,
      wo_category:   jobCat(woType),
      status,
      site_code:     null,
      site_name:     knownFormat ? (g(row,'Location')?.slice(0,200)) : g(row, cm.site_name),
      site_city:     city,
      site_state:    state,
      pay_rate:      g(row, cm.pay_rate) ? parsePay(g(row, cm.pay_rate)) : null,
      total_pay:     parsePay(g(row, cm.total_pay)),
      work_date:     date,
      upload_batch:  batchId,
      source_file:   fileName,
      raw_row:       row,
    })
  }

  // Insert new / update existing in batches of 100
  let newRows=0, updatedRows=0
  const errors=[]

  for (let i=0; i<parsed.length; i+=100) {
    const batch = parsed.slice(i,i+100)
    const keys  = batch.map(r=>r.fn_wo_id)

    const {data:existing} = await supabase
      .from('fn_work_history').select('fn_wo_id').in('fn_wo_id',keys)

    const existSet = new Set((existing??[]).map(r=>r.fn_wo_id))
    const toInsert = batch.filter(r=>!existSet.has(r.fn_wo_id))
    const toUpdate = batch.filter(r=> existSet.has(r.fn_wo_id))

    if (toInsert.length) {
      const {error} = await supabase.from('fn_work_history').insert(toInsert)
      if (error) errors.push(`Batch ${i}: ${error.message}`)
      else newRows += toInsert.length
    }

    for (const row of toUpdate) {
      const {error} = await supabase.from('fn_work_history')
        .update({status:row.status,total_pay:row.total_pay,work_date:row.work_date,provider_name:row.provider_name,provider_id:row.provider_id,provider_phone:row.provider_phone,upload_batch:row.upload_batch,source_file:row.source_file})
        .eq('fn_wo_id',row.fn_wo_id)
      if (!error) updatedRows++
    }
  }

  try { await supabase.from('fn_upload_batches').insert({ id:batchId,file_name:fileName,row_count:parsed.length,new_rows:newRows,skipped_rows:0 }) } catch(e) {}

  // Aggregate from full DB (only assigned rows for tech stats)
  const {data:allHistory} = await supabase
    .from('fn_work_history')
    .select('provider_name,provider_id,provider_phone,wo_type,wo_category,status,site_code,site_name,site_city,site_state,pay_rate,total_pay,work_date,wo_title,fn_wo_id')
    .not('provider_name','is',null)

  const techMap=new Map()
  for (const row of allHistory??[]) {
    const name=row.provider_name
    if (!techMap.has(name)) techMap.set(name,{name,provider_id:row.provider_id,phone:row.provider_phone,jobs:[],job_types:{},statuses:{},states:new Set(),total_pay:0,lv_count:0,ins_count:0,del_count:0,other_count:0})
    const t=techMap.get(name)
    if (!t.provider_id&&row.provider_id) t.provider_id=row.provider_id
    if (!t.phone&&row.provider_phone)    t.phone=row.provider_phone
    const cat=row.wo_category??'OTHER'
    if(cat==='LV')t.lv_count++;else if(cat==='INSTALL')t.ins_count++;else if(cat==='DELIVERY')t.del_count++;else t.other_count++
    t.job_types[row.wo_type]=(t.job_types[row.wo_type]??0)+1
    t.statuses[row.status]=(t.statuses[row.status]??0)+1
    if(row.site_state)t.states.add(row.site_state)
    if(row.total_pay)t.total_pay+=row.total_pay
    t.jobs.push({fn_wo_id:row.fn_wo_id,title:row.wo_title?.slice(0,80),site_code:row.site_code,site_name:row.site_name,city:row.site_city,state:row.site_state,date:row.work_date,job_type:row.wo_type,status:row.status,pay:row.total_pay,rate:row.pay_rate})
  }

  const techs=Array.from(techMap.values()).sort((a,b)=>b.jobs.length-a.jobs.length).map(t=>{
    const completed=t.statuses['Completed']??0,cancelled=t.statuses['Cancelled']??0,total=t.jobs.length
    return{name:t.name,provider_id:t.provider_id,phone:t.phone,total,completed,cancelled,
      assigned:(t.statuses['Assigned']??0)+(t.statuses['Confirmed']??0),
      draft:(t.statuses['Draft']??0)+(t.statuses['Published']??0)+(t.statuses['Routed']??0),
      completion_rate:total>0?Math.round((completed/total)*100):0,
      lv_count:t.lv_count,ins_count:t.ins_count,del_count:t.del_count,other_count:t.other_count,
      job_types:t.job_types,statuses:t.statuses,states:Array.from(t.states).sort(),
      total_pay:Math.round(t.total_pay*100)/100,
      job_type_summary:Object.entries(t.job_types).sort(([,a],[,b])=>b-a).map(([k,v])=>`${k}×${v}`).join(', '),
      jobs:t.jobs.sort((a,b)=>(b.date??'')>(a.date??'')?1:-1),
    }
  })

  const globalJT={},globalST={}
  for(const t of techs){
    for(const[k,v]of Object.entries(t.job_types))globalJT[k]=(globalJT[k]??0)+v
    for(const[k,v]of Object.entries(t.statuses))globalST[k]=(globalST[k]??0)+v
  }

  // Unassigned WO counts from this upload
  const unassigned = parsed.filter(r=>!r.provider_name).length

  return res.json({ok:true,fileName,
    format:knownFormat?'FN_STANDARD':'AI_DETECTED',
    upload:{new_rows:newRows,updated_rows:updatedRows,total_in_file:rows.length,total_stored:parsed.length,unassigned_wos:unassigned,batch_id:batchId},
    errors:errors.length?errors:undefined,
    column_map:cm,
    techs,
    summary:{
      unique_techs:techs.length,
      total_jobs:(allHistory??[]).length,
      total_completed:techs.reduce((s,t)=>s+t.completed,0),
      total_cancelled:techs.reduce((s,t)=>s+t.cancelled,0),
      total_assigned:techs.reduce((s,t)=>s+t.assigned,0),
      total_draft:techs.reduce((s,t)=>s+t.draft,0),
      total_pay:Math.round(techs.reduce((s,t)=>s+t.total_pay,0)),
      total_lv:techs.reduce((s,t)=>s+t.lv_count,0),
      total_ins:techs.reduce((s,t)=>s+t.ins_count,0),
      total_del:techs.reduce((s,t)=>s+t.del_count,0),
      statuses:Object.entries(globalST).sort(([,a],[,b])=>b-a).map(([s,c])=>({status:s,count:c})),
      job_types:Object.entries(globalJT).sort(([,a],[,b])=>b-a).map(([t,c])=>({type:t,count:c})),
    },
  })

  } catch(err) {
    logError('[analyze-fn-export] Unhandled error:', err)
    return res.status(500).json({ message: err.message ?? 'Internal server error', stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined })
  }
}