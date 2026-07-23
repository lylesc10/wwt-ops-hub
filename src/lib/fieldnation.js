/**
 * FieldNation API client (frontend)
 * All calls proxy through /api/fn/* — credentials never hit the browser.
 */

import { getToken } from '@/lib/dab'

function getAuthHeader() {
  return { Authorization: `Bearer ${getToken() ?? ''}` }
}

async function call(path, opts = {}) {
  const authHeader = await getAuthHeader()
  const res = await fetch(`/api/fn${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...(opts.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const message = res.status === 429
      ? 'FieldNation rate limit reached — try again shortly.'
      : (err.message ?? `FN API error ${res.status}`)
    const error = new Error(message)
    error.status = res.status // additive — existing callers only read .message
    throw error
  }
  if (res.status === 204) return null
  return res.json()
}

export const listWorkOrders  = (params = {})          => call(`/work-orders?${new URLSearchParams(params)}`)
export const getWorkOrder    = (id)                    => call(`/work-orders/${id}`)
export const createWorkOrder = (payload)               => call('/work-orders',  { method: 'POST', body: JSON.stringify(payload) })
export const pushWorkOrder   = (csv_row, project_id)   => call('/push-wo',      { method: 'POST', body: JSON.stringify({ csv_row, project_id }) })
export const pushWorkOrders  = (csv_rows, project_id)  => call('/push-wos',     { method: 'POST', body: JSON.stringify({ csv_rows, project_id }) })
export const checkDupes      = (site_codes, fn_project_id) => call('/check-dupes', { method: 'POST', body: JSON.stringify({ site_codes, fn_project_id }) })
export const syncStatus      = (project_id)            => call('/sync-status',  { method: 'POST', body: JSON.stringify({ project_id }) })
export const updateWorkOrder = (id, initial, current)  => call(`/work-orders/${id}`, { method: 'PUT', body: JSON.stringify({ initial, current }) })
export const publishWorkOrder = (id)                   => call(`/work-orders/${id}/publish`, { method: 'POST' })
export const revertPublish    = (id)                   => call(`/work-orders/${id}/publish`, { method: 'DELETE' })
