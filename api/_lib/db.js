/**
 * PostgreSQL query layer with a Supabase-shaped chainable API.
 *
 * Usage in API handlers — drop-in for the old Supabase client:
 *
 *   import { supa } from '../_lib/db.js'
 *   const { data, error } = await supa.from('sites').select('*').eq('id', x).single()
 *   const { data, error } = await supa.from('t').insert({...}).select().single()
 *   const { error }       = await supa.from('t').update({...}).eq('id', x)
 */

import pg from 'pg'
import { logError } from './log.js'

let _pool = null
function pool() {
  if (!_pool) {
    _pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : false,
    })
  }
  return _pool
}

// Raw SQL helper — returns { rows, rowCount } or throws
export async function query(sql, params = []) {
  return pool().query(sql, params)
}

// ── SQL filter builder ────────────────────────────────────────────────────────

function buildWhere(filters, paramOffset = 0) {
  if (!filters.length) return { clause: '', params: [] }
  const params = []
  const parts  = filters.map(({ op, col, val }) => {
    const n = params.length + 1 + paramOffset
    switch (op) {
      case 'eq':
        if (val === null) { return `${col} IS NULL` }
        params.push(val); return `${col} = $${n}`
      case 'ne':
        if (val === null) { return `${col} IS NOT NULL` }
        params.push(val); return `${col} != $${n}`
      case 'gt': params.push(val); return `${col} > $${n}`
      case 'ge': params.push(val); return `${col} >= $${n}`
      case 'lt': params.push(val); return `${col} < $${n}`
      case 'le': params.push(val); return `${col} <= $${n}`
      case 'ilike': params.push(val); return `${col} ILIKE $${n}`
      case 'in': {
        const placeholders = (Array.isArray(val) ? val : [val]).map((v, i) => {
          params.push(v); return `$${n + i}`
        })
        return `${col} = ANY(ARRAY[${placeholders.join(',')}])`
      }
      case 'not.is':
        if (val === null) return `${col} IS NOT NULL`
        params.push(val); return `${col} != $${n}`
      default: params.push(val); return `${col} = $${n}`
    }
  })
  return { clause: `WHERE ${parts.join(' AND ')}`, params }
}

// Strip Supabase PostgREST join syntax for column lists
function stripJoins(selectStr) {
  if (!selectStr || selectStr.trim() === '*') return '*'
  const cleaned = selectStr
    .replace(/,?\s*\w+:\w+\([^)]*\)/g, '')
    .replace(/,?\s*\w+\([^)]*\)/g, '')
    .trim().replace(/^,|,$/g, '').trim()
  return cleaned || '*'
}

// ── QueryBuilder ──────────────────────────────────────────────────────────────

class QueryBuilder {
  constructor(table) {
    this._table    = table
    this._cols     = '*'
    this._filters  = []
    this._order    = null
    this._limit    = null
    this._offset   = null
    this._single   = false
    this._mutation = null
  }

  select(cols = '*') {
    if (this._mutation) { this._mutation.returning = true }
    else { this._cols = stripJoins(cols) }
    return this
  }

  eq(col, val)      { this._filters.push({ op: 'eq',    col, val }); return this }
  neq(col, val)     { this._filters.push({ op: 'ne',    col, val }); return this }
  in(col, vals)     { this._filters.push({ op: 'in',    col, val: vals }); return this }
  is(col, val)      { this._filters.push({ op: 'eq',    col, val: val ?? null }); return this }
  not(col, op, val) { this._filters.push({ op: `not.${op}`, col, val }); return this }
  gt(col, val)      { this._filters.push({ op: 'gt',    col, val }); return this }
  lt(col, val)      { this._filters.push({ op: 'lt',    col, val }); return this }
  gte(col, val)     { this._filters.push({ op: 'ge',    col, val }); return this }
  lte(col, val)     { this._filters.push({ op: 'le',    col, val }); return this }
  ilike(col, val)   { this._filters.push({ op: 'ilike', col, val }); return this }

  order(col, { ascending = true } = {}) { this._order = { col, ascending }; return this }
  range(from, to)   { this._offset = from; this._limit = to - from + 1; return this }
  limit(n)          { this._limit = n; return this }
  single()          { this._single = true; return this }

  insert(data) { this._mutation = { type: 'insert', data, returning: false }; return this }
  update(data) { this._mutation = { type: 'update', data, returning: false }; return this }
  upsert(data, opts = {}) { this._mutation = { type: 'upsert', data, opts, returning: false }; return this }
  delete()     { this._mutation = { type: 'delete', returning: false }; return this }

  then(resolve, reject) { return this._execute().then(resolve, reject) }

  async _execute() {
    try {
      if (this._mutation) return await this._runMutation()
      return await this._runSelect()
    } catch (e) {
      logError(`[db] ${this._table}:`, e.message)
      return { data: null, error: { message: e.message } }
    }
  }

  async _runSelect() {
    const { clause, params } = buildWhere(this._filters)
    const order  = this._order  ? `ORDER BY ${this._order.col} ${this._order.ascending ? 'ASC' : 'DESC'}` : ''
    const limit  = this._limit  ? `LIMIT ${this._limit}` : ''
    const offset = this._offset ? `OFFSET ${this._offset}` : ''
    const sql    = [`SELECT ${this._cols} FROM ${this._table}`, clause, order, limit, offset]
      .filter(Boolean).join(' ')

    const { rows } = await pool().query(sql, params)
    if (this._single) return { data: rows[0] ?? null, error: null }
    return { data: rows, error: null }
  }

  async _runMutation() {
    const { type, data, returning, opts } = this._mutation
    const ret = returning ? 'RETURNING *' : ''

    if (type === 'delete') {
      const { clause, params } = buildWhere(this._filters)
      const sql = `DELETE FROM ${this._table} ${clause} ${ret}`.trim()
      const { rows } = await pool().query(sql, params)
      return { data: ret ? rows : null, error: null }
    }

    if (type === 'update') {
      const keys     = Object.keys(data)
      const sets     = keys.map((k, i) => `${k} = $${i + 1}`)
      const { clause, params: wParams } = buildWhere(this._filters, keys.length)
      const sql      = `UPDATE ${this._table} SET ${sets.join(', ')} ${clause} ${ret}`.trim()
      const { rows } = await pool().query(sql, [...Object.values(data), ...wParams])
      if (this._single) return { data: rows[0] ?? null, error: null }
      return { data: ret ? rows : null, error: null }
    }

    if (type === 'insert') {
      const keys    = Object.keys(data)
      const cols    = keys.join(', ')
      const vals    = keys.map((_, i) => `$${i + 1}`).join(', ')
      const sql     = `INSERT INTO ${this._table} (${cols}) VALUES (${vals}) ${ret}`.trim()
      const { rows } = await pool().query(sql, Object.values(data))
      if (this._single) return { data: rows[0] ?? null, error: null }
      return { data: ret ? rows : [{ id: rows[0]?.id }], error: null }
    }

    if (type === 'upsert') {
      const conflict = opts?.onConflict ?? 'id'
      const keys     = Object.keys(data)
      const cols     = keys.join(', ')
      const vals     = keys.map((_, i) => `$${i + 1}`).join(', ')
      const updates  = keys.filter(k => k !== conflict).map((k, i) => `${k} = EXCLUDED.${k}`).join(', ')
      const sql      = `INSERT INTO ${this._table} (${cols}) VALUES (${vals}) ON CONFLICT (${conflict}) DO UPDATE SET ${updates} ${ret}`.trim()
      const { rows } = await pool().query(sql, Object.values(data))
      if (this._single) return { data: rows[0] ?? null, error: null }
      return { data: ret ? rows : null, error: null }
    }

    return { data: null, error: { message: `Unknown mutation type: ${type}` } }
  }
}

export const supa = { from: (table) => new QueryBuilder(table) }
export default { query, supa }
