/**
 * GET /api/fn/provider/[id]
 *
 * Pulls provider profile, work history, and current assignments from FN.
 * Stores results back into technicians table.
 */

import { fnFetch } from '../auth.js'
import { query } from '../../_lib/db.js'
import { getFNCredentials } from '../../_lib/credentials.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })

  const providerId = req.query.id
  if (!providerId) return res.status(400).json({ message: 'Provider ID required' })

  let creds
  try { creds = await getFNCredentials() }
  catch { return res.status(400).json({ message: 'FieldNation credentials not configured' }) }

  try {
    const [profileRes, workOrderRes, currentRes] = await Promise.all([
      fnFetch(`/v2/providers/${providerId}`, {}, creds),
      fnFetch(`/v2/workorders?provider=${providerId}&per_page=100&page=1`, {}, creds),
      fnFetch(`/v2/workorders?provider=${providerId}&status=assigned,work_done&per_page=25`, {}, creds),
    ])

    let profile = {}
    if (profileRes.ok) {
      const p = await profileRes.json()
      profile = {
        fn_full_name:    [p.first_name, p.last_name].filter(Boolean).join(' '),
        fn_rating:       p.rating?.overall ?? p.score ?? null,
        fn_rating_count: p.rating?.count ?? null,
        fn_location:     [p.location?.city, p.location?.state].filter(Boolean).join(', '),
        fn_bio:          p.about ?? null,
        fn_verified:     p.background_check?.status === 'pass',
        fn_skills:       (p.skills ?? []).map(s => s.name).join(', ') || null,
      }
    }

    let history = { total: 0, completed: 0, cancelled: 0, types: {}, last_wo_date: null, total_earned: 0 }
    if (workOrderRes.ok) {
      const data = await workOrderRes.json()
      const wos  = data?.results ?? []
      history.total = data?.total ?? wos.length
      for (const wo of wos) {
        const status = (wo.status?.name ?? wo.status ?? '').toLowerCase()
        const type   = wo.title?.match(/-(LVL|LVT|DEL|BRK|INL|INT)/)?.[1] ?? 'OTHER'
        const date   = wo.time_log?.work_done_at ?? wo.scheduling?.start_time?.utc
        if (['approved','paid','work_done'].includes(status)) history.completed++
        if (['cancelled','expired'].includes(status)) history.cancelled++
        history.types[type] = (history.types[type] ?? 0) + 1
        if (date) { const d = date.split('T')[0]; if (!history.last_wo_date || d > history.last_wo_date) history.last_wo_date = d }
        if (wo.pay?.total) history.total_earned += parseFloat(wo.pay.total) || 0
      }
    }

    let current = []
    if (currentRes.ok) {
      const data = await currentRes.json()
      current = (data?.results ?? []).slice(0, 10).map(wo => ({
        wo_id:     wo.id,
        title:     wo.title,
        status:    wo.status?.name ?? wo.status,
        site_code: wo.title?.match(/^[A-Z][A-Z0-9]{2,5}/)?.[0] ?? null,
        start_date: wo.scheduling?.start_time?.local_time?.split('T')[0] ?? null,
        url:       `https://app.fieldnation.com/workorders/${wo.id}`,
      }))
    }

    let ourRating = null
    const ratingRes = await fnFetch(`/v2/providers/${providerId}/ratings?per_page=100`, {}, creds).catch(() => null)
    if (ratingRes?.ok) {
      const rData = await ratingRes.json()
      const ratings = rData?.results ?? []
      if (ratings.length) ourRating = Math.round((ratings.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratings.length) * 10) / 10
    }

    const fnData = {
      ...profile,
      fn_our_rating:   ourRating,
      fn_wo_count:     history.total,
      fn_wo_completed: history.completed,
      fn_wo_cancelled: history.cancelled,
      fn_wo_types:     Object.entries(history.types).map(([t,n])=>`${t}×${n}`).join(', ') || null,
      fn_last_wo_date: history.last_wo_date,
      fn_total_earned: history.total_earned > 0 ? Math.round(history.total_earned) : null,
      fn_current_jobs: current,
      fn_synced_at:    new Date().toISOString(),
    }

    const keys = Object.keys(fnData)
    const vals = [...Object.values(fnData), String(providerId)]
    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`)
    await query(
      `UPDATE technicians SET ${setClauses.join(', ')} WHERE fn_provider_id = $${vals.length}`,
      vals
    )

    return res.json({ ok: true, provider_id: providerId, profile, history, current, ourRating })

  } catch (err) {
    console.error('[FN Provider]', err)
    return res.status(500).json({ message: err.message })
  }
}
