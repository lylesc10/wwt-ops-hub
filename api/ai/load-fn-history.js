/**
 * POST /api/ai/load-fn-history
 * Aggregates tech stats from the fn_work_history table without needing a file upload.
 */

import { query } from '../_lib/db.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { rows, error: dbErr } = await query(
    'SELECT provider_name,provider_id,provider_phone,wo_type,wo_category,status,site_code,site_name,site_city,site_state,pay_rate,total_pay,work_date,wo_title,fn_wo_id FROM fn_work_history'
  ).catch(e => ({ rows: null, error: e }))

  if (dbErr) return res.status(500).json({ message: dbErr.message })
  if (!rows?.length) return res.json({ ok:true, techs:[], summary:{ unique_techs:0, total_jobs:0, total_completed:0, total_cancelled:0, total_assigned:0, total_draft:0, total_pay:0, total_lv:0, total_ins:0, total_del:0, statuses:[], job_types:[] } })

  const techMap = new Map()

  for (const row of rows) {
    const name = row.provider_name
    if (!name) continue
    if (!techMap.has(name)) {
      techMap.set(name, { name, provider_id:row.provider_id, phone:row.provider_phone, jobs:[], job_types:{}, statuses:{}, states:new Set(), total_pay:0, lv_count:0, ins_count:0, del_count:0, other_count:0 })
    }
    const t = techMap.get(name)
    if (!t.provider_id && row.provider_id) t.provider_id = row.provider_id
    if (!t.phone && row.provider_phone)    t.phone       = row.provider_phone

    const cat = row.wo_category ?? 'OTHER'
    if      (cat==='LV')       t.lv_count++
    else if (cat==='INSTALL')  t.ins_count++
    else if (cat==='DELIVERY') t.del_count++
    else                       t.other_count++

    t.job_types[row.wo_type] = (t.job_types[row.wo_type]??0)+1
    t.statuses[row.status]   = (t.statuses[row.status]??0)+1
    if (row.site_state) t.states.add(row.site_state)
    if (row.total_pay)  t.total_pay += row.total_pay
    t.jobs.push({ fn_wo_id:row.fn_wo_id, title:row.wo_title?.slice(0,80), site_code:row.site_code, site_name:row.site_name, city:row.site_city, state:row.site_state, date:row.work_date, job_type:row.wo_type, status:row.status, pay:row.total_pay, rate:row.pay_rate })
  }

  const techs = Array.from(techMap.values()).sort((a,b)=>b.jobs.length-a.jobs.length).map(t=>{
    const completed=t.statuses['Completed']??0, cancelled=t.statuses['Cancelled']??0
    const assigned=(t.statuses['Assigned']??0)+(t.statuses['Confirmed']??0)
    const draft=(t.statuses['Draft']??0)+(t.statuses['Published']??0)+(t.statuses['Routed']??0)
    const total=t.jobs.length
    return { name:t.name, provider_id:t.provider_id, phone:t.phone, total, completed, cancelled, assigned, draft,
      completion_rate:total>0?Math.round((completed/total)*100):0,
      lv_count:t.lv_count, ins_count:t.ins_count, del_count:t.del_count, other_count:t.other_count,
      job_types:t.job_types, statuses:t.statuses, states:Array.from(t.states).sort(),
      total_pay:Math.round(t.total_pay*100)/100,
      job_type_summary:Object.entries(t.job_types).sort(([,a],[,b])=>b-a).map(([k,v])=>`${k}×${v}`).join(', '),
      jobs:t.jobs.sort((a,b)=>(b.date??'')>(a.date??'')?1:-1),
    }
  })

  const globalJT={}, globalST={}
  for (const t of techs) {
    for (const [k,v] of Object.entries(t.job_types)) globalJT[k]=(globalJT[k]??0)+v
    for (const [k,v] of Object.entries(t.statuses))  globalST[k]=(globalST[k]??0)+v
  }

  return res.json({ ok:true, techs, summary:{
    unique_techs:techs.length, total_jobs:rows.length,
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
  }})
}
