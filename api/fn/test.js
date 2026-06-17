import { fnFetch, getFNToken } from './auth.js'
import { query } from '../_lib/db.js'
import { parseCreds } from '../_lib/credentials.js'

async function getCredentials() {
  if (process.env.FN_CLIENT_ID) return { clientId: process.env.FN_CLIENT_ID, clientSecret: process.env.FN_CLIENT_SECRET, baseUrl: process.env.FN_BASE_URL || 'https://api.fndev.net' }
  const { rows } = await query("SELECT encrypted_data FROM credentials WHERE service = 'fieldnation' LIMIT 1")
  if (!rows[0]?.encrypted_data) throw new Error('FN credentials not configured in Settings → API')
  const parsed = parseCreds(rows[0].encrypted_data)
  if (!parsed) throw new Error('Failed to read FN credentials')
  const isSandbox = parsed.environment === 'sandbox'
  return { clientId: parsed.client_id, clientSecret: parsed.client_secret, baseUrl: isSandbox ? 'https://api.fndev.net' : 'https://api.fieldnation.com' }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  const { action, params = {} } = req.body ?? {}
  if (!action) return res.status(400).json({ message: 'action required' })
  let creds
  try { creds = await getCredentials() } catch(e) { return res.status(400).json({ ok:false, action, error:e.message }) }
  const start = Date.now()
  try {
    let result, endpoint
    switch(action) {
      case 'auth': {
        const token = await getFNToken(creds.clientId, creds.clientSecret, creds.baseUrl)
        result = { token_preview: token?.slice(0,20)+'…', token_length: token?.length, base_url: creds.baseUrl }
        break
      }
      case 'company': { endpoint='/v2/companies/self'; const r=await fnFetch(endpoint,{},creds); const d=await r.json(); result={id:d.id,name:d.name,status:d.status}; break }
      case 'list_wos': {
        endpoint=`/v2/workorders?per_page=${params.per_page??10}&page=${params.page??1}${params.status?`&status_name=${params.status}`:''}`
        const r=await fnFetch(endpoint,{},creds); const d=await r.json()
        result={total:d.total,count:d.results?.length,results:d.results?.slice(0,5).map(w=>({id:w.id,title:w.title,status:w.status?.name??w.status}))}
        break
      }
      case 'get_wo': {
        if (!params.wo_id) throw new Error('wo_id required')
        endpoint=`/v2/workorders/${params.wo_id}`; const r=await fnFetch(endpoint,{},creds); const d=await r.json()
        result={id:d.id,title:d.title,status:d.status?.name,location:d.location?.name,scheduling:d.scheduling}; break
      }
      case 'list_providers': {
        endpoint=`/v2/providers?per_page=5${params.state?`&location_state=${params.state}`:''}`
        const r=await fnFetch(endpoint,{},creds); const d=await r.json()
        result={total:d.total,providers:d.results?.slice(0,5).map(p=>({id:p.id,name:`${p.first_name} ${p.last_name}`,rating:p.rating?.overall,location:`${p.location?.city},${p.location?.state}`}))}
        break
      }
      case 'create_wo': {
        endpoint='/v2/workorders'
        const payload={
          title: params.title??'TEST-WO-001-LVL(1)',
          description:'Test WO from Ops Manager sandbox',
          location:{ mode:'custom', address1:params.address??'123 Main St', city:params.city??'Columbus', state:params.state??'OH', zip:params.zip??'43215', country:'US' },
          scheduling:{ requested:{ start:{local_time:`${new Date().toISOString().split('T')[0]}T08:00:00`}, end:{local_time:`${new Date().toISOString().split('T')[0]}T17:00:00`}}},
          pay:{ type:'fixed', fixed:{ amount: params.budget??150 }},
          ...(params.project_id?{project:{id:Number(params.project_id)}}:{}),
        }
        const r=await fnFetch(endpoint,{method:'POST',body:JSON.stringify(payload)},creds); const d=await r.json()
        result={id:d.id,title:d.title,status:d.status?.name??d.status,url:`https://ui-sandbox.fndev.net/workorders/${d.id}`}; break
      }
      default: return res.status(400).json({ok:false,error:`Unknown action: ${action}`})
    }
    return res.json({ ok:true, action, endpoint:endpoint??'auth', base_url:creds.baseUrl, ms:Date.now()-start, result })
  } catch(err) {
    return res.status(500).json({ ok:false, action, error:err.message, ms:Date.now()-start })
  }
}
