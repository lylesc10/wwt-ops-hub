/**
 * Browser-side FieldNation sandbox client.
 * Calls are proxied through Vite (/fn-sandbox/*) to avoid CORS.
 * Only active in dev — credentials come from VITE_ env vars.
 */

const FN_AUTH_PATH = '/fn-sandbox/authentication/api/oauth/token'
const FN_API_BASE  = '/fn-sandbox/api/rest/v2'

let _tokenCache = null

async function getToken() {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt - 60_000) return _tokenCache.token

  const res = await fetch(FN_AUTH_PATH, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      grant_type:    'password',
      client_id:     import.meta.env.VITE_FN_CLIENT_ID,
      client_secret: import.meta.env.VITE_FN_CLIENT_SECRET,
      username:      import.meta.env.VITE_FN_USERNAME,
      password:      import.meta.env.VITE_FN_PASSWORD,
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`FN auth failed (${res.status}): ${err}`)
  }

  const data = await res.json()
  _tokenCache = {
    token:     data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
  return _tokenCache.token
}

function normalizeTime(t) {
  if (!t) return '08:00:00'
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t
  if (/^\d{1,2}:\d{2}$/.test(t)) return t.padStart(5, '0') + ':00'
  const m = t.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)$/i)
  if (m) {
    let h = parseInt(m[1])
    const min = m[2] ?? '00'
    if (m[3].toLowerCase() === 'pm' && h < 12) h += 12
    if (m[3].toLowerCase() === 'am' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${min}:00`
  }
  return '08:00:00'
}

function addHoursToTime(timeStr, hrs) {
  const [h, m, s] = timeStr.split(':').map(Number)
  const totalMin = h * 60 + m + Math.round(hrs * 60)
  const endH = Math.min(Math.floor(totalMin / 60), 23)
  const endM = totalMin % 60
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:${String(s ?? 0).padStart(2, '0')}`
}

// FN silently ignores scheduling on WO create — must be set via PUT after creation.
async function setSchedule(woId, token, startDate, startTime, endTime) {
  if (!startDate) return
  await fetch(`${FN_API_BASE}/workorders/${woId}/schedule?access_token=${token}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify({
      service_window: {
        mode:  'exact',
        start: { local: { date: startDate, time: startTime } },
        end:   { local: { date: startDate, time: endTime   } },
      },
    }),
  })
}

export async function listClients() {
  const token = await getToken()
  const res = await fetch(`${FN_API_BASE}/clients?access_token=${token}`, {
    headers: { Accept: 'application/json' },
  })
  const data = await res.json()
  // results may be sparse objects — fetch full detail for each to get name
  const sparse = data?.results ?? []
  const full = await Promise.all(sparse.map(async (c) => {
    if (c.name) return c
    const r = await fetch(`${FN_API_BASE}/clients/${c.id}?access_token=${token}`, { headers: { Accept: 'application/json' } })
    const d = await r.json()
    return { id: c.id, name: d.name ?? d.company_name ?? `Client ${c.id}` }
  }))
  return full
}

export async function listManagers() {
  try {
    const token = await getToken()
    const res = await fetch(`${FN_API_BASE}/managers?access_token=${token}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map(m => ({
      id:   m.id,
      name: m.name ?? (`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || `Manager ${m.id}`),
    }))
  } catch {
    return []
  }
}

export async function deleteWorkOrderDirect(woId, cancelReason = 'Deleted via WWT Ops Hub') {
  const token = await getToken()
  const res = await fetch(`${FN_API_BASE}/workorders/${woId}?access_token=${token}`, {
    method:  'DELETE',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify({ cancel_reason: cancelReason }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(`FN ${res.status}: ${data.message ?? res.statusText}`)
  }
}

export async function createWorkOrderDirect({
  title, address, address2, city, state, zip,
  startDate, startTime, budget, payType, payRate, approxHours,
  templateId, clientId, managerId,
}) {
  const token = await getToken()
  const start = normalizeTime(startTime)
  const hrs   = Number(approxHours) || 8
  const end   = addHoursToTime(start, hrs)

  const payload = {
    title,
    description: 'WWT Ops Hub — sandbox test',
    location: {
      mode:     'custom',
      address1: address,
      ...(address2 ? { address2 } : {}),
      city,
      state,
      zip,
      country:  'US',
    },
    pay: (payType ?? 'Fixed') === 'Hourly'
      ? { type: 'hourly', base: { rate: Number(payRate) || 50, max_units: hrs } }
      : { type: 'fixed',  base: { amount: Number(budget) || 150 } },
    ...(templateId ? { template_id: Number(templateId) } : {}),
    ...(clientId   ? { client:      { id: Number(clientId)  } } : {}),
    ...(managerId  ? { manager:     { id: Number(managerId) } } : {}),
  }

  const res = await fetch(`${FN_API_BASE}/workorders?access_token=${token}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(payload),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(`FN ${res.status}: ${data.message ?? res.statusText}`)

  // Schedule must be set after creation — FN silently ignores it on POST
  await setSchedule(data.id, token, startDate, start, end)

  return {
    id:     data.id,
    title:  data.title,
    status: data.status?.name ?? data.status,
    url:    `https://ui-sandbox.fndev.net/workorders/${data.id}`,
  }
}

export const isFNConfigured = () =>
  !!(import.meta.env.VITE_FN_CLIENT_ID && import.meta.env.VITE_FN_USERNAME)
