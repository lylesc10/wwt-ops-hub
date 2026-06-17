/**
 * DAB client — supabase-shaped query builder over the Express→DAB proxy.
 *
 * Drop-in API surface for migrating from supabase-js:
 *
 *   // before
 *   const { data, error } = await supabase.from('sites').select('*').eq('state','PA').order('code')
 *
 *   // after
 *   const { data, error } = await dab.from('sites').select('*').eq('state','PA').order('code')
 *
 * All requests go to VITE_API_BASE/api/data/<entity> (the Express proxy).
 * The proxy adds the JWT-derived X-MS-CLIENT-PRINCIPAL header before forwarding to DAB.
 *
 * Token management: reads the JWT from localStorage('ops_access_token').
 * Swap with an in-memory store or Context if you prefer.
 */

const DAB_PROXY = `${import.meta.env.VITE_API_BASE ?? ''}/api/data`

// ── Token helpers ─────────────────────────────────────────────
export function getToken()           { return localStorage.getItem('ops_access_token') }
export function setToken(t)          { localStorage.setItem('ops_access_token', t) }
export function clearToken()         { localStorage.removeItem('ops_access_token') }
export function setRefreshToken(t)   { localStorage.setItem('ops_refresh_token', t) }
export function getRefreshToken()    { return localStorage.getItem('ops_refresh_token') }
export function clearRefreshToken()  { localStorage.removeItem('ops_refresh_token') }

// ── OData helpers ─────────────────────────────────────────────

function encodeFilter(filters) {
  // filters: [{ field, op, value }]
  return filters.map(({ field, op, value }) => {
    if (op === 'eq')  return `${field} eq '${value}'`
    if (op === 'neq') return `${field} ne '${value}'`
    if (op === 'gt')  return `${field} gt '${value}'`
    if (op === 'gte') return `${field} ge '${value}'`
    if (op === 'lt')  return `${field} lt '${value}'`
    if (op === 'lte') return `${field} le '${value}'`
    if (op === 'is')  return value === null ? `${field} eq null` : `${field} eq '${value}'`
    if (op === 'in')  return `(${value.map(v => `${field} eq '${v}'`).join(' or ')})`
    if (op === 'ilike')    return `contains(tolower(${field}),'${value.toLowerCase()}')`
    if (op === 'not_null') return `${field} ne null`
    return `${field} eq '${value}'`
  }).join(' and ')
}

// ── QueryBuilder ──────────────────────────────────────────────

class QueryBuilder {
  constructor(entity) {
    this._entity  = entity
    this._select  = null
    this._filters = []
    this._order   = []
    this._from    = null   // pagination start
    this._first   = null   // page size
    this._single  = false
    this._method  = 'GET'
    this._body    = null
    this._id      = null   // for PATCH/DELETE by id
  }

  // ── Select ────────────────────────────────────────────────
  select(cols = '*') {
    this._select = cols === '*' ? null : cols
    return this
  }

  // ── Filters ───────────────────────────────────────────────
  eq(field, value)      { this._filters.push({ field, op: 'eq',  value }); return this }
  neq(field, value)     { this._filters.push({ field, op: 'neq', value }); return this }
  gt(field, value)      { this._filters.push({ field, op: 'gt',  value }); return this }
  gte(field, value)     { this._filters.push({ field, op: 'gte', value }); return this }
  lt(field, value)      { this._filters.push({ field, op: 'lt',  value }); return this }
  lte(field, value)     { this._filters.push({ field, op: 'lte', value }); return this }
  is(field, value)      { this._filters.push({ field, op: 'is',  value }); return this }
  in(field, values)     { this._filters.push({ field, op: 'in',  value: values }); return this }
  ilike(field, pattern) { this._filters.push({ field, op: 'ilike', value: pattern }); return this }
  not(field, op, value) {
    // Only 'is null' negation is used in this codebase: .not(field, 'is', null) → field ne null
    if (op === 'is' && value === null) {
      this._filters.push({ field, op: 'not_null' })
    } else {
      this._filters.push({ field, op: `not_${op}`, value })
    }
    return this
  }

  // ── Ordering ──────────────────────────────────────────────
  order(field, { ascending = true } = {}) {
    this._order.push(`${field} ${ascending ? 'asc' : 'desc'}`)
    return this
  }

  // ── Pagination ────────────────────────────────────────────
  /**
   * range(from, to) — mirrors supabase-js .range(from, to)
   * Maps to OData $first (page size) + cursor-based paging
   */
  range(from, to) {
    this._from  = from
    this._first = to - from + 1
    return this
  }

  limit(n) {
    this._first = n
    return this
  }

  single() {
    this._single = true
    this._first  = 1
    return this
  }

  // ── Mutations ─────────────────────────────────────────────
  insert(row) {
    this._method = 'POST'
    this._body   = row
    return this
  }

  update(patch) {
    this._method = 'PATCH'
    this._body   = patch
    return this
  }

  upsert(row, { onConflict } = {}) {
    // DAB doesn't have native upsert — do a PUT which DAB maps to upsert on PK
    this._method = 'PUT'
    this._body   = row
    return this
  }

  delete() {
    this._method = 'DELETE'
    return this
  }

  /** Chain an id for PATCH/DELETE: dab.from('sites').update({...}).eq('id', id) */

  // ── Execute ───────────────────────────────────────────────
  async _execute() {
    const token = getToken()
    const headers = {
      'Content-Type':  'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    }

    if (this._method === 'GET') {
      const params = new URLSearchParams()
      if (this._select)         params.set('$select',  this._select)
      if (this._filters.length) params.set('$filter',  encodeFilter(this._filters))
      if (this._order.length)   params.set('$orderby', this._order.join(','))
      if (this._first != null)  params.set('$first',   String(this._first))

      const url = `${DAB_PROXY}/${this._entity}${params.size ? '?' + params : ''}`
      const res = await fetch(url, { method: 'GET', headers })
      return parseResponse(res, this._single)
    }

    // For mutations, filters become the path id if eq('id',…) is the only filter
    const idFilter = this._filters.find(f => f.field === 'id' && f.op === 'eq')
    const entityPath = idFilter
      ? `${this._entity}/${idFilter.value}`
      : this._entity

    const url = `${DAB_PROXY}/${entityPath}`
    const res = await fetch(url, {
      method:  this._method,
      headers,
      body:    this._body != null ? JSON.stringify(this._body) : undefined,
    })
    return parseResponse(res, false)
  }

  // Make the builder thenable so you can await it directly
  then(resolve, reject) {
    return this._execute().then(resolve, reject)
  }
}

// ── Response parser ───────────────────────────────────────────
async function parseResponse(res, single) {
  let json
  try { json = await res.json() } catch { json = {} }

  if (!res.ok) {
    const message = json?.title ?? json?.message ?? `HTTP ${res.status}`
    return { data: null, error: { message, status: res.status } }
  }

  // DAB wraps collections in { value: [...], nextLink: "..." }
  // Single-entity responses return the object directly
  if (single) {
    const row = json?.value?.[0] ?? json
    return { data: row ?? null, error: null }
  }

  const data = json?.value ?? json ?? []
  return { data: Array.isArray(data) ? data : [data], error: null, _nextLink: json?.nextLink }
}

// ── Paginator — mirrors useDashboard 1000-row pattern ─────────
/**
 * fetchAll(entity, builder) — follows DAB nextLink to collect all pages.
 * builder should be a QueryBuilder with filters/order set but no .range().
 */
export async function fetchAll(entity, configureFn) {
  const allRows = []
  let nextLink  = null

  // First page
  let qb = configureFn(dab.from(entity)).limit(1000)
  let result = await qb

  if (result.error) return result
  allRows.push(...(result.data ?? []))
  nextLink = result._nextLink

  // Follow pagination
  while (nextLink) {
    const token = getToken()
    const res   = await fetch(nextLink.replace(/^.*\/api\/data/, `${DAB_PROXY}`), {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
      },
    })
    const parsed = await parseResponse(res, false)
    if (parsed.error) break
    allRows.push(...(parsed.data ?? []))
    nextLink = parsed._nextLink
  }

  return { data: allRows, error: null }
}

// ── Public client ─────────────────────────────────────────────
export const dab = {
  from: (entity) => new QueryBuilder(entity),

  /** Convenience auth calls — talk to Express /api/auth/* directly */
  auth: {
    async signInWithPassword({ email, password }) {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      })
      const json = await res.json()
      if (!res.ok) return { data: null, error: { message: json.message } }
      setToken(json.access_token)
      setRefreshToken(json.refresh_token)
      return { data: { user: json.user, session: { access_token: json.access_token } }, error: null }
    },

    async getSession() {
      const token = getToken()
      if (!token) return { data: { session: null }, error: null }
      return { data: { session: { access_token: token } }, error: null }
    },

    async getUser() {
      const token = getToken()
      if (!token) return { data: { user: null }, error: null }
      const res  = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!res.ok) return { data: { user: null }, error: null }
      const json = await res.json()
      return { data: { user: json.user }, error: null }
    },

    async signOut() {
      clearToken()
      clearRefreshToken()
      return { error: null }
    },

    async refreshSession() {
      const refresh_token = getRefreshToken()
      if (!refresh_token) return { data: null, error: { message: 'No refresh token' } }
      const res  = await fetch('/api/auth/refresh', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh_token }),
      })
      const json = await res.json()
      if (!res.ok) return { data: null, error: { message: json.message } }
      setToken(json.access_token)
      setRefreshToken(json.refresh_token)
      return { data: { session: { access_token: json.access_token } }, error: null }
    },
  },
}

export default dab
