/**
 * Shared work-order push core — used by api/fn/push-wo.js (single) and
 * api/fn/push-wos.js (batch).
 *
 * Owns: CSV row → FN v2 POST /workorders payload mapping, the actual FN
 * call with 429-aware retry/backoff, and the mock-mode result shape.
 */

import { fnFetch } from '../auth.js'
import { normalizeTime } from './wo-payloads.js'
import { logError } from '../../_lib/log.js'

const MAX_RETRIES     = 2      // retries on FN 429 / 5xx (per row)
const BASE_BACKOFF_MS = 1_000  // doubled per attempt; Retry-After wins when present

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function mockResult() {
  return {
    ok:      true,
    mock:    true,
    wo_id:   `mock-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    status:  'draft',
    url:     '#',
    message: 'Mock push — configure FN credentials in Settings → API to go live.',
  }
}

/**
 * Maps a CPWOG CSV row (positional array — see src/cpwog/generateWO.js
 * WO_HEADERS) to the FN v2 work-order create payload.
 */
export function buildCreatePayload(csv_row) {
  // CSV columns: templateId(0), projectId(1), siteId(2), bundle(3),
  //   address(4), addr2(5), city(6), state(7), zip(8), country(9),
  //   type(10), startDate(11), endDate(12), startTime(13), endTime(14),
  //   techType(15), techName(16), routeTo(17), budget(18), budgetTravel(19),
  //   maxBudget(20), payRate(21), ..., approxHours(26), estDuration(27), payType(28),
  //   locDisplay(29), locName(30)
  const [
    templateId, fnProjectId, siteId, bundle,
    address, addr2, city, state, zip, country,
    , startDate, , startTime, endTime,
    , , routeTo,
    budget, , maxBudget, payRate,
    , , , , approxHours, , payType,
    locDisplay,
  ] = csv_row

  const payload = {
    title:       siteId,
    template_id: Number(templateId),
    project:     { id: Number(fnProjectId) || undefined },

    location: {
      mode:         'custom',
      address1:     address,
      address2:     addr2 || undefined,
      city,
      state,
      zip,
      country:      country || 'US',
      display_name: locDisplay || undefined,
    },

    // A populated Scheduled End Time means a check-in window (arrive between
    // start and end) rather than a hard/exact start.
    schedule: startDate ? {
      service_window: {
        mode: endTime ? 'between' : 'exact',
        exact: {
          start: `${startDate}T${normalizeTime(startTime, '08:00:00')}`,
          end:   `${startDate}T${normalizeTime(endTime, '17:00:00')}`,
        },
      },
    } : undefined,
    require_ontime: true,

    pay: payType === 'Hourly'
      ? { type: 'hourly', base: { rate: Number(payRate), max_units: Number(approxHours) || 8 } }
      : { type: 'fixed',  base: { amount: Number(budget || maxBudget) } },

    routing: routeTo ? { provider_id: Number(routeTo) } : undefined,

    custom_fields: bundle ? [{ label: 'Bundle', value: bundle }] : undefined,
  }

  // Remove undefined keys
  return JSON.parse(JSON.stringify(payload))
}

/**
 * Pushes one CSV row to FN. Retries on FN-side 429/5xx with exponential
 * backoff (honoring Retry-After). Never throws for FN errors — always
 * returns a result object so batch callers can keep going.
 *
 * @returns {{ ok: boolean, mock?: boolean, wo_id?: string|number, status?: string, url?: string, message?: string, fn_error?: object }}
 */
export async function pushOne(csv_row, creds) {
  if (!Array.isArray(csv_row) || csv_row.length === 0) {
    return { ok: false, message: 'Invalid csv_row — expected a non-empty array' }
  }
  if (!creds) return mockResult()

  let payload
  try {
    payload = buildCreatePayload(csv_row)
  } catch (err) {
    return { ok: false, message: `Payload build failed: ${err.message}` }
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let fnRes
    try {
      fnRes = await fnFetch('/workorders', { method: 'POST', body: JSON.stringify(payload) }, creds)
    } catch (err) {
      // Network/auth failure — auth errors won't heal by retrying
      logError('[FN push-core] fnFetch failed', err)
      return { ok: false, message: err.message }
    }

    if (fnRes.ok) {
      const wo = await fnRes.json()
      return {
        ok:     true,
        mock:   false,
        wo_id:  wo.id,
        status: wo.status?.name ?? wo.status,
        url:    `https://app.fieldnation.com/workorders/${wo.id}`,
      }
    }

    const retryable = fnRes.status === 429 || fnRes.status >= 500
    if (retryable && attempt < MAX_RETRIES) {
      const retryAfter = Number(fnRes.headers.get('retry-after'))
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : BASE_BACKOFF_MS * 2 ** attempt
      await sleep(delay)
      continue
    }

    const err = await fnRes.json().catch(() => ({}))
    return {
      ok:       false,
      message:  `FN API error ${fnRes.status}: ${err.message ?? fnRes.statusText}`,
      fn_error: err,
    }
  }
}
