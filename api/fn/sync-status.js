/**
 * POST /api/fn/sync-status
 * Body: { project_id?: string }
 *
 * Pulls work order statuses from FieldNation and writes them
 * back to the sites table in Supabase.
 *
 * Mapping:
 *   FN status       → our status
 *   draft           → scheduled
 *   published       → scheduled
 *   routed          → staffed
 *   assigned        → staffed
 *   work_done       → in_progress
 *   approved        → completed
 *   cancelled       → cancelled
 *   expired         → cancelled
 *   paid            → completed
 */

import { fnFetch } from './auth.js'
import { withSecurity, requireAuth } from '../_lib/middleware.js'
import { supa as supabase } from '../../_lib/db.js'


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

    // Load sites that have FN work order IDs
    let sitesQuery = supabase
      .from('sites')
      .select('id, code, fn_wo_id, status, project_id')
      .not('fn_wo_id', 'is', null)

    if (project_id) sitesQuery = sitesQuery.eq('project_id', project_id)

    const { data: sites } = await sitesQuery

    if (!sites?.length) {
      return res.json({ ok: true, synced: 0, message: 'No sites with FN work order IDs found.' })
    }

    let synced = 0, changes = 0
    const errors = []

    // Process in batches of 20
    for (let i = 0; i < sites.length; i += 20) {
      const batch = sites.slice(i, i + 20)

      await Promise.all(batch.map(async (site) => {
        try {
          const fnRes = await fnFetch(`/workorders/${site.fn_wo_id}`, {}, creds)
          if (!fnRes.ok) {
            if (fnRes.status === 404) {
              // WO was deleted from FN
              await supabase.from('sites').update({ fn_wo_id: null }).eq('id', site.id)
            }
            return
          }

          const wo = await fnRes.json()
          const fnStatusRaw = wo.status?.name ?? wo.status ?? ''
          const newStatus   = FN_STATUS_MAP[fnStatusRaw.toLowerCase()] ?? site.status

          // Get assigned provider name if any
          const assignedTech = wo.routing?.assigned?.provider?.name ?? null

          const updates = {}
          if (newStatus !== site.status) {
            updates.status = newStatus
            changes++
          }
          if (assignedTech && assignedTech !== site.onsite_tech) {
            updates.onsite_tech = assignedTech
          }

          if (Object.keys(updates).length) {
            await supabase.from('sites').update({
              ...updates,
              updated_at: new Date().toISOString(),
            }).eq('id', site.id)

            // Log the change
            await supabase.from('sync_log').insert({
              project_id: site.project_id,
              site_id:    site.id,
              field_name: 'fn_status_sync',
              old_value:  site.status,
              new_value:  newStatus,
            })

            // Fire alert if status changed to a notable state
            if (newStatus === 'completed' && site.status !== 'completed') {
              await supabase.from('alert_log').insert({
                alert_type: 'site_completed',
                site_id:    site.id,
                title:      `Site completed: ${site.code}`,
                detail:     `FN WO ${site.fn_wo_id} marked as ${fnStatusRaw}`,
              })
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


// Reads FN credentials from the `credentials` table (migration 003+)
async function getFNCredentials() {
  if (process.env.FN_CLIENT_ID) {
    return {
      clientId:     process.env.FN_CLIENT_ID,
      clientSecret: process.env.FN_CLIENT_SECRET,
      username:     process.env.FN_USERNAME,
      password:     process.env.FN_PASSWORD,
      baseUrl:      process.env.FN_BASE_URL || 'sandbox',
    }
  }
  const { data, error } = await supabase
    .from('credentials')
    .select('encrypted_data, is_active')
    .eq('service', 'fieldnation')
    .single()
  if (error || !data?.encrypted_data) throw new Error('FN credentials not configured. Add them in Settings → API & Webhooks.')
  const creds = parseFNCreds(data.encrypted_data)
  if (!creds?.client_id || !creds?.client_secret) throw new Error('Incomplete FN credentials stored.')
  if (!creds?.username || !creds?.password) throw new Error('FN username and password required. Re-save in Settings → API & Webhooks → FieldNation.')
  const isSandbox = !creds.environment || creds.environment === 'sandbox'
  return {
    clientId:     creds.client_id,
    clientSecret: creds.client_secret,
    username:     creds.username,
    password:     creds.password,
    baseUrl:      isSandbox ? 'sandbox' : 'prod',
  }
}

function parseFNCreds(encrypted_data) {
  try { return JSON.parse(Buffer.from(String(encrypted_data), 'base64').toString('utf-8')) } catch {}
  try { return JSON.parse(String(encrypted_data)) } catch {}
  return null
}

export default withSecurity(requireAuth(handler, 'pm'))
