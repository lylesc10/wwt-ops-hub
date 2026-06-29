/**
 * POST /api/fn/check-dupes
 * Body: { site_codes: string[], fn_project_id?: string }
 * Returns: { results: { [code]: { exists, wo_id?, status?, title?, url? } } }
 */
import { fnFetch } from './auth.js'
import { withSecurity, requireAuth } from '../_lib/middleware.js'
import { getFNCredentials } from '../_lib/credentials.js'

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  const { site_codes = [], fn_project_id } = req.body ?? {}
  if (!site_codes.length) return res.json({ results: {} })

  let creds
  try { creds = await getFNCredentials() }
  catch { return res.status(400).json({ message: 'FieldNation credentials not configured. Add them in Settings → API & Webhooks.' }) }

  const results = {}
  for (let i = 0; i < site_codes.length; i += 10) {
    const batch = site_codes.slice(i, i + 10)
    await Promise.all(batch.map(async (code) => {
      try {
        const params = new URLSearchParams({ search: code, ...(fn_project_id ? { project: fn_project_id } : {}), page: 1, per_page: 5 })
        const fnRes = await fnFetch(`/workorders?${params}`, {}, creds)
        if (!fnRes.ok) { results[code] = { exists: false, error: `FN ${fnRes.status}` }; return }
        const data = await fnRes.json()
        const match = (data?.results ?? []).find(wo => (wo.site_id ?? '').includes(code) || (wo.title ?? '').includes(code))
        results[code] = match
          ? { exists: true, wo_id: match.id, status: match.status?.name ?? match.status, title: match.title, url: `https://app.fieldnation.com/workorders/${match.id}` }
          : { exists: false }
      } catch (e) { results[code] = { exists: false, error: e.message } }
    }))
  }
  return res.json({ results })
}


export default withSecurity(requireAuth(handler, 'pm'))
