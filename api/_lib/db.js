/**
 * Shared PostgreSQL connection pool for all api/ handlers.
 *
 * Connection string from DATABASE_URL environment variable.
 * Format: postgresql://user:password@host:5432/dbname?sslmode=require
 *
 * Azure Database for PostgreSQL requires SSL — the pool enforces it.
 */

import pg from 'pg'
const { Pool } = pg

// Module-level singleton pool — reused across requests in the Express
// long-lived container (unlike Vercel cold starts where each invocation
// is isolated). Idle connections are released after 10s.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : false,
  max: 10,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
})

pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message)
})

/**
 * Execute a single parameterised query.
 *
 * @param {string} text   - SQL with $1, $2… placeholders
 * @param {any[]}  params - Bound parameter values
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params) {
  const start = Date.now()
  const result = await pool.query(text, params)
  const duration = Date.now() - start
  if (process.env.NODE_ENV !== 'production' || duration > 500) {
    console.debug(`[db] query (${duration}ms):`, text.slice(0, 120))
  }
  return result
}

/**
 * Acquire a client for multi-statement transactions.
 * Remember to call client.release() in a finally block.
 *
 * @returns {Promise<pg.PoolClient>}
 */
export async function getClient() {
  return pool.connect()
}

/**
 * Insert multiple rows into a table in 50-row batches.
 * @param {string}   table    - Table name
 * @param {object[]} records  - Array of row objects (all must have same keys)
 * @param {string}   returning - Optional RETURNING clause (e.g. 'id')
 */
export async function insertRows(table, records, returning = '') {
  if (!records.length) return { rows: [] }
  const cols = Object.keys(records[0])
  let allRows = []
  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50)
    const values = [], params = []
    let pidx = 1
    for (const r of batch) {
      values.push(`(${cols.map(() => `$${pidx++}`).join(',')})`)
      for (const c of cols) params.push(r[c] ?? null)
    }
    const sql = `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(',')}) VALUES ${values.join(',')}${returning ? ` RETURNING ${returning}` : ''}`
    const res = await query(sql, params)
    if (returning) allRows = [...allRows, ...res.rows]
  }
  return { rows: allRows }
}

/**
 * Upsert multiple rows into a table in 50-row batches.
 * @param {string}   table        - Table name
 * @param {object[]} records      - Array of row objects
 * @param {string[]} conflictCols - Columns forming the conflict target
 */
export async function upsertRows(table, records, conflictCols = ['id']) {
  if (!records.length) return { count: 0 }
  const cols = Object.keys(records[0])
  let totalCount = 0
  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50)
    const values = [], params = []
    let pidx = 1
    for (const r of batch) {
      values.push(`(${cols.map(() => `$${pidx++}`).join(',')})`)
      for (const c of cols) params.push(r[c] ?? null)
    }
    const updateCols = cols.filter(c => !conflictCols.includes(c))
    const updateSet  = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')
    const sql = `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(',')}) VALUES ${values.join(',')} ON CONFLICT (${conflictCols.map(c => `"${c}"`).join(',')}) DO UPDATE SET ${updateSet}`
    const res = await query(sql, params)
    totalCount += res.rowCount ?? batch.length
  }
  return { count: totalCount }
}

export default pool
