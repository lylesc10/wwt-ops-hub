/**
 * POST /api/fn/sync-status
 * Body: { project_id?: string }
 *
 * Pulls work order statuses from FieldNation and writes them
 * back to the sites table.
 */

import { fnFetch } from './auth.js'
import { withSecurity, requireAuth } from '../_lib/middleware.js'
import { query } from '../_lib/db.js'
import { getFNCredentials } from '../_lib/credentials.js'

const FN_STATUS_MAP = {
  draft:      'scheduled',
  published:  'scheduled',
  routed:     'staffed',
  assigned:   'staffed',
  work_done:  'in_progress',
  approved:   'completed',
  paid:       'completed',
  cancelled:  'cancelled',
  expired:    'cancelled',
  closed:     'completed',
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { project_id } = req.body ?? {}
  try {
    const creds = await getFNCredentials()

    const sql = project_id
      ? 'SELECT id, code, fn_wo_id, status, project_id, onsite_tech FROM sites WHERE fn_wo_id IS NOT NULL AND project_id = $1'
      : 'SELECT id, code, fn_wo_id, status, project_id, onsite_tech FROM sites WHERE fn_wo_id IS NOT NULL'
    const { rows: sites } = await query(sql, project_id ? [project_id] : [])

    if (!sites.length) {
      return res.json({ ok: true, synced: 0, message: 'No sites with FN work order IDs found.' })
    }

    let synced = 0, changes = 0
    const errors = []

    for (let i = 0; i < sites.length; i += 20) {
      const batch = sites.slice(i, i + 20)

      await Promise.all(batch.map(async (site) => {
        try {
          const fnRes = await fnFetch(`/workorders/${site.fn_wo_id}`, {}, creds)
          if (!fnRes.ok) {
            if (fnRes.status === 404) {
              await query('UPDATE sites SET fn_wo_id = NULL WHERE id = $1', [site.id])
            }
            return
          }

          const wo           = await fnRes.json()
          const fnStatusRaw  = wo.status?.name ?? wo.status ?? ''
          const newStatus    = FN_STATUS_MAP[fnStatusRaw.toLowerCase()] ?? site.status
          const assignedTech = wo.routing?.assigned?.provider?.name ?? null

          const updates = {}
          if (newStatus !== site.status) { updates.status = newStatus; changes++ }
          if (assignedTech && assignedTech !== site.onsite_tech) updates.onsite_tech = assignedTech

          if (Object.keys(updates).length) {
            const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`)
            const vals = [...Object.values(updates), new Date().toISOString(), site.id]
            await query(
              `UPDATE sites SET ${setClauses.join(', ')}, updated_at = $${vals.length - 1} WHERE id = $${vals.length}`,
              vals
            )

            await query(
              'INSERT INTO sync_log (project_id, site_id, field_name, old_value, new_value) VALUES ($1, $2, $3, $4, $5)',
              [site.project_id, site.id, 'fn_status_sync', site.status, newStatus]
            )

            if (newStatus === 'completed' && site.status !== 'completed') {
              await query(
                "INSERT INTO alert_log (alert_type, site_id, title, detail) VALUES ('site_completed', $1, $2, $3)",
                [site.id, `Site completed: ${site.code}`, `FN WO ${site.fn_wo_id} marked as ${fnStatusRaw}`]
              )
            }
          }

          synced++
        } catch (e) {
          errors.push({ site_id: site.id, code: site.code, error: e.message })
        }
      }))
    }

    return res.json({
      ok:      true,
      mock:    false,
      synced,
      changes,
      errors:  errors.length ? errors : undefined,
      message: `Synced ${synced} WO statuses from FieldNation. ${changes} status change${changes !== 1 ? 's' : ''} applied.`,
    })

  } catch (err) {
    console.error('[FN sync-status]', err)
    return res.status(500).json({ ok: false, message: err.message })
  }
}

export default withSecurity(requireAuth(handler, 'pm'))
