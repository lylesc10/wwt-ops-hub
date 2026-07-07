/**
 * DAB-compatible generic entity layer.
 *
 * src/lib/dab.js speaks Data API Builder's REST dialect:
 *   GET    /api/{table}?$filter=...&$select=...&$orderby=col asc&$first=N  → { value: [...] }
 *   POST   /api/{table}                                                     → { value: [row] }
 *   PATCH  /api/{table}/id/{pk}                                             → { value: [row] }
 *   DELETE /api/{table}/id/{pk}
 *
 * This module implements that dialect directly against DATABASE_URL so no
 * separate DAB deployment is required. Table/column names are validated as
 * identifiers and checked against the live schema; values are parameterized.
 */

import { query } from './db.js'

// Tables that must never be reachable through the generic entity API
const BLOCKED_TABLES = new Set(['users', 'credentials'])

const IDENT_RE = /^[a-z_][a-z0-9_]*$/

function isSafeIdent(name) {
  return typeof name === 'string' && IDENT_RE.test(name)
}

async function tableColumns(table) {
  const { rows } = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  )
  return new Set(rows.map(r => r.column_name))
}

export async function resolveTable(rawTable) {
  const table = String(rawTable ?? '').toLowerCase()
  if (!isSafeIdent(table) || BLOCKED_TABLES.has(table)) return null
  const cols = await tableColumns(table)
  return cols.size ? { table, cols } : null
}

// ── OData $filter parser ──────────────────────────────────────────────────────
// Grammar (what dab.js emits): conditions joined by ` and `, where a condition is
//   col eq|ne|gt|ge|lt|le LITERAL
//   contains(col, LITERAL)
//   col in (LITERAL, ...)
// LITERAL := null | true | false | number | 'string with '' escapes'

const LITERAL = String.raw`(null|true|false|-?\d+(?:\.\d+)?|'(?:[^']|'')*')`
const COND_CMP = new RegExp(String.raw`^(\w+)\s+(eq|ne|gt|ge|lt|le)\s+${LITERAL}`)
const COND_CONTAINS = new RegExp(String.raw`^contains\((\w+),\s*${LITERAL}\)`)
const COND_IN = new RegExp(String.raw`^(\w+)\s+in\s+\(([^)]*)\)`)

function parseLiteral(raw) {
  if (raw === 'null') return null
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw.startsWith("'")) return raw.slice(1, -1).replace(/''/g, "'")
  return Number(raw)
}

const CMP_SQL = { eq: '=', ne: '!=', gt: '>', ge: '>=', lt: '<', le: '<=' }

/**
 * Parse an OData $filter string into { clause, params }. Throws on anything
 * outside the supported grammar or on unknown columns.
 */
export function parseFilter(filter, cols, paramOffset = 0) {
  const parts = []
  const params = []
  let rest = filter.trim()

  while (rest.length) {
    let m
    if ((m = COND_CONTAINS.exec(rest))) {
      const [, col, lit] = m
      if (!cols.has(col)) throw new Error(`Unknown column: ${col}`)
      const val = String(parseLiteral(lit)).replace(/^%+|%+$/g, '')
      params.push(`%${val}%`)
      parts.push(`${col} ILIKE $${paramOffset + params.length}`)
    } else if ((m = COND_IN.exec(rest))) {
      const [, col, inner] = m
      if (!cols.has(col)) throw new Error(`Unknown column: ${col}`)
      const litRe = new RegExp(LITERAL, 'g')
      const vals = [...inner.matchAll(litRe)].map(mm => parseLiteral(mm[1]))
      params.push(vals)
      parts.push(`${col} = ANY($${paramOffset + params.length})`)
    } else if ((m = COND_CMP.exec(rest))) {
      const [, col, op, lit] = m
      if (!cols.has(col)) throw new Error(`Unknown column: ${col}`)
      const val = parseLiteral(lit)
      if (val === null) {
        parts.push(op === 'ne' ? `${col} IS NOT NULL` : `${col} IS NULL`)
      } else {
        params.push(val)
        parts.push(`${col} ${CMP_SQL[op]} $${paramOffset + params.length}`)
      }
    } else {
      throw new Error(`Unsupported $filter syntax near: ${rest.slice(0, 40)}`)
    }

    rest = rest.slice(m[0].length).trimStart()
    if (rest.toLowerCase().startsWith('and ')) rest = rest.slice(4)
    else if (rest.length) throw new Error(`Unsupported $filter conjunction near: ${rest.slice(0, 40)}`)
  }

  return { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params }
}

// ── Query pieces ──────────────────────────────────────────────────────────────

export function parseSelect(select, cols) {
  if (!select) return '*'
  const requested = select.split(',').map(c => c.trim()).filter(Boolean)
  for (const c of requested) {
    if (!isSafeIdent(c) || !cols.has(c)) throw new Error(`Unknown column: ${c}`)
  }
  return requested.length ? requested.join(', ') : '*'
}

export function parseOrderBy(orderby, cols) {
  if (!orderby) return ''
  const m = /^(\w+)\s*(asc|desc)?$/i.exec(orderby.trim())
  if (!m || !cols.has(m[1])) throw new Error(`Invalid $orderby: ${orderby}`)
  return `ORDER BY ${m[1]} ${(m[2] ?? 'asc').toUpperCase()}`
}

// ── Operations ────────────────────────────────────────────────────────────────

export async function entitySelect({ table, cols }, { $filter, $select, $orderby, $first }) {
  const selectSql = parseSelect($select, cols)
  const { clause, params } = $filter ? parseFilter($filter, cols) : { clause: '', params: [] }
  const orderSql = parseOrderBy($orderby, cols)
  const limit = $first && Number.isFinite(Number($first)) ? `LIMIT ${Math.max(1, Number($first))}` : ''

  const sql = [`SELECT ${selectSql} FROM ${table}`, clause, orderSql, limit].filter(Boolean).join(' ')
  const { rows } = await query(sql, params)
  return rows
}

function pickColumns(body, cols) {
  const entries = Object.entries(body ?? {}).filter(([k]) => isSafeIdent(k) && cols.has(k))
  if (!entries.length) throw new Error('No valid columns in body')
  return entries
}

export async function entityInsert({ table, cols }, body) {
  const entries = pickColumns(body, cols)
  const names = entries.map(([k]) => k).join(', ')
  const placeholders = entries.map((_, i) => `$${i + 1}`).join(', ')
  const values = entries.map(([, v]) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v))
  const { rows } = await query(
    `INSERT INTO ${table} (${names}) VALUES (${placeholders}) RETURNING *`, values,
  )
  return rows[0]
}

export async function entityUpdate({ table, cols }, id, body) {
  const entries = pickColumns(body, cols)
  const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ')
  const values = entries.map(([, v]) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v))
  const { rows } = await query(
    `UPDATE ${table} SET ${sets} WHERE id = $${entries.length + 1} RETURNING *`, [...values, id],
  )
  return rows[0] ?? null
}

export async function entityDelete({ table }, id) {
  const { rowCount } = await query(`DELETE FROM ${table} WHERE id = $1`, [id])
  return rowCount > 0
}
