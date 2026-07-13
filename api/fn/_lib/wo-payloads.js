/**
 * Pure payload builders for FieldNation work-order sub-resource PUTs.
 *
 * Ported from src/lib/fnDirect.js's proven shapes (updateWorkOrderDirect /
 * publishWorkOrderDirect) — that module calls FN directly from the browser
 * with credentials exposed via VITE_* env vars and must never be imported.
 * These run server-side instead, behind api/fn/work-orders/[id].js, so FN
 * credentials never reach the client.
 *
 * FN splits an update across separate sub-resources rather than one PUT on
 * the WO root: schedule, pay, and location each have their own endpoint.
 * diffToPatch() below decides which of those sub-resources actually changed
 * so the handler only issues the PUTs it needs to.
 */

// "4:30pm" / "16:30" / "16:30:00" → "HH:MM:SS" (24h). Same convention as
// api/fn/push-wo.js's to24h, generalized with an explicit fallback.
export function normalizeTime(raw, fallback = '08:00:00') {
  if (!raw || !String(raw).trim()) return fallback
  const s = String(raw).trim()
  const ampm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10) % 12
    if (ampm[3].toLowerCase() === 'pm') h += 12
    return `${String(h).padStart(2, '0')}:${ampm[2] ?? '00'}:00`
  }
  const mil = s.match(/^(\d{1,2}):(\d{2})(:\d{2})?$/)
  if (mil) return `${mil[1].padStart(2, '0')}:${mil[2]}${mil[3] ?? ':00'}`
  return fallback
}

// Adds `hrs` hours to an "HH:MM:SS" time. The hour is capped at 23 (no
// rollover into the next calendar day) — a shift that would cross midnight
// lands on 23:xx rather than wrapping to 00:xx the next day.
export function addHoursToTime(timeStr, hrs) {
  const [h, m, s] = timeStr.split(':').map(Number)
  const totalMin = h * 60 + m + Math.round((Number(hrs) || 0) * 60)
  const endH = Math.min(Math.floor(totalMin / 60), 23)
  const endM = totalMin % 60
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:${String(s ?? 0).padStart(2, '0')}`
}

/** PUT /workorders/{id}/schedule body. Returns null if no date is set. */
export function buildSchedulePayload({ date, startTime, endTime, approxHours }) {
  if (!date) return null
  const start = normalizeTime(startTime, '08:00:00')
  const end = endTime ? normalizeTime(endTime, '17:00:00') : addHoursToTime(start, Number(approxHours) || 8)
  return {
    service_window: {
      mode: 'exact',
      start: { local: { date, time: start } },
      end: { local: { date, time: end } },
    },
  }
}

/** PUT /workorders/{id}/pay body. `base` is always the nested key — never `fixed`/`hourly`. */
export function buildPayPayload({ type, amount, rate, maxUnits }) {
  if (type === 'hourly') {
    return { type: 'hourly', base: { rate: Number(rate) || 0, max_units: Number(maxUnits) || 8 } }
  }
  return { type: 'fixed', base: { amount: Number(amount) || 0 } }
}

/** PUT /workorders/{id}/location body — fields are flat, mode:'custom' is required. */
export function buildLocationPayload({ address1, address2, city, state, zip, country }) {
  return {
    mode: 'custom',
    address1: address1 ?? '',
    address2: address2 ?? '',
    city: city ?? '',
    state: (state ?? '').toUpperCase(),
    zip: zip ?? '',
    country: (country || 'US').toUpperCase(),
  }
}

/** PUT /workorders/{id} body — root fields (title/description). */
export function buildRootPatch({ title, description }) {
  const patch = {}
  if (title !== undefined) patch.title = title
  if (description !== undefined) patch.description = description
  return patch
}

const SCHEDULE_FIELDS = ['date', 'startTime', 'endTime', 'approxHours']
const PAY_FIELDS = ['payType', 'payAmount', 'payRate', 'payMaxUnits']
const LOCATION_FIELDS = ['address1', 'address2', 'city', 'state', 'zip', 'country']
const ROOT_FIELDS = ['title', 'description']

function groupChanged(initial, current, fields) {
  return fields.some((f) => (initial?.[f] ?? '') !== (current?.[f] ?? ''))
}

/**
 * Compares the modal's initial vs. current form snapshot and returns only
 * the FN sub-resource groups that actually changed, ready for the update
 * handler to PUT. Returns {} (no keys) when nothing changed.
 * @returns {{ schedule?: object, pay?: object, location?: object, title?: string, description?: string }}
 */
export function diffToPatch(initial, current) {
  const patch = {}

  if (groupChanged(initial, current, SCHEDULE_FIELDS)) {
    const schedule = buildSchedulePayload({
      date: current.date, startTime: current.startTime, endTime: current.endTime, approxHours: current.approxHours,
    })
    if (schedule) patch.schedule = schedule
  }

  if (groupChanged(initial, current, PAY_FIELDS)) {
    patch.pay = buildPayPayload({
      type: current.payType, amount: current.payAmount, rate: current.payRate, maxUnits: current.payMaxUnits,
    })
  }

  if (groupChanged(initial, current, LOCATION_FIELDS)) {
    patch.location = buildLocationPayload(current)
  }

  if (groupChanged(initial, current, ROOT_FIELDS)) {
    const root = buildRootPatch(current)
    if (root.title !== undefined) patch.title = root.title
    if (root.description !== undefined) patch.description = root.description
  }

  return patch
}

// Ordered list of {resource, path, method} the update handler issues, in a
// fixed sequence (schedule → pay → location → root) so partial-failure
// reporting is deterministic.
export function patchToSteps(id, patch) {
  const steps = []
  if (patch.schedule) steps.push({ resource: 'schedule', path: `/workorders/${id}/schedule`, method: 'PUT', body: patch.schedule })
  if (patch.pay) steps.push({ resource: 'pay', path: `/workorders/${id}/pay`, method: 'PUT', body: patch.pay })
  if (patch.location) steps.push({ resource: 'location', path: `/workorders/${id}/location`, method: 'PUT', body: patch.location })
  if (patch.title !== undefined || patch.description !== undefined) {
    const body = {}
    if (patch.title !== undefined) body.title = patch.title
    if (patch.description !== undefined) body.description = patch.description
    steps.push({ resource: 'root', path: `/workorders/${id}`, method: 'PUT', body })
  }
  return steps
}
