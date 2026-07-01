/**
 * DAB (Data API Builder) REST client with a Supabase-shaped chainable API.
 *
 * Usage:
 *   import { dab } from '@/lib/dab'
 *   const { data, error } = await dab.from('sites').select('*').eq('id', id).single()
 *
 * The DAB base URL is read from VITE_DAB_BASE at build time.
 * Every request carries the JWT from localStorage as a Bearer token.
 */

import { getToken } from './auth.js'

const DAB_BASE = (import.meta.env.VITE_DAB_BASE ?? '').replace(/\/$/, '')

function dabHeaders() {
  const token = getToken()
  const h = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

// ── OData filter builder ──────────────────────────────────────────────────────

function oVal(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'boolean')        return String(v)
  if (typeof v === 'number')         return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

function buildFilter(filters) {
  if (!filters.length) return ''
  return filters.map(f => {
    const { op, col, val } = f
    switch (op) {
      case 'eq':     return `${col} eq ${oVal(val)}`
      case 'ne':     return `${col} ne ${oVal(val)}`
      case 'gt':     return `${col} gt ${oVal(val)}`
      case 'ge':     return `${col} ge ${oVal(val)}`
      case 'lt':     return `${col} lt ${oVal(val)}`
      case 'le':     return `${col} le ${oVal(val)}`
      case 'ilike':  return `contains(${col}, ${oVal(val)})`
      case 'in': {
        const vals = (Array.isArray(val) ? val : [val]).map(oVal).join(',')
        return `${col} in (${vals})`
      }
      case 'not.is': return val === null ? `${col} ne null` : `${col} ne ${oVal(val)}`
      default:       return `${col} eq ${oVal(val)}`
    }
  }).join(' and ')
}

// Strip Supabase PostgREST join syntax, keep only simple column names.
// E.g. "*, project:projects(id, name)" → "*"
function stripJoins(selectStr) {
  if (!selectStr || selectStr.trim() === '*') return null
  const cleaned = selectStr
    .replace(/,?\s*\w+:\w+\([^)]*\)/g, '')   // alias:table(cols)
    .replace(/,?\s*\w+\([^)]*\)/g, '')        // table(cols)
    .trim().replace(/^,|,$/g, '').trim()
  return cleaned || null
}

// ── QueryBuilder ──────────────────────────────────────────────────────────────

class QueryBuilder {
  constructor(table) {
    this._table    = table
    this._select   = null
    this._filters  = []
    this._order    = null
    this._limit    = null
    this._offset   = 0
    this._single   = false
    this._mutation = null  // { type, data }
    this._pk       = null  // primary key value (from eq filters on 'id')
    this._count    = null
  }

  select(cols = '*') {
    if (this._mutation) { this._mutation.returning = true }
    else { this._select = cols === '*' ? null : stripJoins(cols) }
    return this
  }

  eq(col, val)              { this._filters.push({ op: 'eq', col, val }); if (col === 'id') this._pk = val; return this }
  neq(col, val)             { this._filters.push({ op: 'ne', col, val }); return this }
  in(col, vals)             { this._filters.push({ op: 'in', col, val: vals }); return this }
  is(col, val)              { this._filters.push({ op: 'eq', col, val: val ?? null }); return this }
  not(col, op, val)         { this._filters.push({ op: `not.${op}`, col, val }); return this }
  gt(col, val)              { this._filters.push({ op: 'gt', col, val }); return this }
  lt(col, val)              { this._filters.push({ op: 'lt', col, val }); return this }
  gte(col, val)             { this._filters.push({ op: 'ge', col, val }); return this }
  lte(col, val)             { this._filters.push({ op: 'le', col, val }); return this }
  ilike(col, val)           { this._filters.push({ op: 'ilike', col, val }); return this }
  order(col, { ascending = true } = {}) { this._order = { col, ascending }; return this }
  range(from, to)           { this._offset = from; this._limit = to - from + 1; return this }
  limit(n)                  { this._limit = n; return this }
  single()                  { this._single = true; return this }

  insert(data) { this._mutation = { type: 'insert', data }; return this }
  update(data) { this._mutation = { type: 'update', data }; return this }
  upsert(data) { this._mutation = { type: 'upsert', data }; return this }
  delete()     { this._mutation = { type: 'delete' }; return this }

  // Thenable — makes `await queryBuilder` work
  then(resolve, reject) { return this._execute().then(resolve, reject) }

  async _execute() {
    const base = `${DAB_BASE}/api/${this._table}`

    try {
      // ── Mutations ─────────────────────────────────────────────────────────
      if (this._mutation) {
        const { type, data } = this._mutation
        const pkFilter = this._filters.find(f => f.col === 'id')

        if (type === 'delete') {
          if (!pkFilter) return { data: null, error: { message: 'delete() requires .eq("id", ...)' } }
          await fetch(`${base}/id/${pkFilter.val}`, { method: 'DELETE', headers: dabHeaders() })
          return { data: null, error: null }
        }

        if (type === 'insert' || type === 'upsert') {
          const r = await fetch(base, {
            method: 'POST', headers: dabHeaders(), body: JSON.stringify(data),
          })
          if (!r.ok) return { data: null, error: { message: await r.text() } }
          const json = await r.json()
          const row  = json?.value?.[0] ?? json
          return { data: this._single ? row : (json?.value ?? [row]), error: null }
        }

        if (type === 'update') {
          if (!pkFilter) return { data: null, error: { message: 'update() requires .eq("id", ...)' } }
          const r = await fetch(`${base}/id/${pkFilter.val}`, {
            method: 'PATCH', headers: dabHeaders(), body: JSON.stringify(data),
          })
          if (!r.ok) return { data: null, error: { message: await r.text() } }
          const json = await r.json()
          const row  = json?.value?.[0] ?? json
          return { data: this._single ? row : (json?.value ?? [row]), error: null }
        }
      }

      // ── SELECT ────────────────────────────────────────────────────────────
      const params = new URLSearchParams()
      const filter = buildFilter(this._filters)
      if (filter)          params.set('$filter',  filter)
      if (this._select)    params.set('$select',  this._select)
      if (this._order)     params.set('$orderby', `${this._order.col} ${this._order.ascending ? 'asc' : 'desc'}`)
      if (this._limit)     params.set('$first',   String(this._limit))

      const url  = params.toString() ? `${base}?${params}` : base
      const r    = await fetch(url, { headers: dabHeaders() })
      if (!r.ok) return { data: null, error: { message: await r.text() } }

      const json = await r.json()
      const rows = json?.value ?? []

      if (this._single) return { data: rows[0] ?? null, error: null }
      return { data: rows, error: null }

    } catch (e) {
      return { data: null, error: { message: e.message } }
    }
  }
}

export const dab = {
  from: (table) => new QueryBuilder(table),
}
