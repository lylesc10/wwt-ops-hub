/**
 * Smartsheet API client
 *
 * All calls are proxied through Vercel serverless functions at /api/smartsheet/*
 * so the access token never hits the frontend.
 */

const BASE = '/api/smartsheet'

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || `Smartsheet API error: ${res.status}`)
  }
  return res.json()
}

/**
 * Fetch all rows from a Smartsheet sheet.
 *
 * @param {string} sheetId - Smartsheet sheet ID
 * @returns {Promise<{ rows: Array, columns: Array }>}
 */
export async function fetchSheet(sheetId) {
  return apiFetch(`/sheets/${sheetId}`)
}

/**
 * Trigger a manual sync for a project.
 * Calls the api/sync/smartsheet handler.
 *
 * @param {string} projectId - our internal project UUID
 * @returns {Promise<{ synced: number, changes: number }>}
 */
export async function triggerSync(projectId) {
  const res = await fetch('/api/sync/smartsheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId }),
  })
  if (!res.ok) throw new Error(`Sync failed: ${res.statusText}`)
  return res.json()
}
