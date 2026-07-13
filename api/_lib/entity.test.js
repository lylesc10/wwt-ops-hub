import { describe, it, expect } from 'vitest'
import { parseFilter, parseSelect, parseOrderBy } from './entity.js'

// These three functions are pure (no DB access) — they parse the OData dialect
// that src/lib/dab.js emits into a parameterized SQL WHERE/SELECT/ORDER BY
// fragment. Locking down their behavior protects the identifier-validation
// logic that keeps the generic /api/{table} entity API from being SQL-injectable.

const COLS = new Set(['id', 'code', 'status', 'created_at'])

describe('parseFilter', () => {
  it('parses a simple eq comparison into a parameterized clause', () => {
    const { clause, params } = parseFilter("code eq 'FB1A'", COLS)
    expect(clause).toBe('WHERE code = $1')
    expect(params).toEqual(['FB1A'])
  })

  it('parses multiple AND-joined conditions', () => {
    const { clause, params } = parseFilter("code eq 'FB1A' and status ne 'closed'", COLS)
    expect(clause).toBe('WHERE code = $1 AND status != $2')
    expect(params).toEqual(['FB1A', 'closed'])
  })

  it('parses null comparisons without a bind parameter', () => {
    const { clause, params } = parseFilter('status eq null', COLS)
    expect(clause).toBe('WHERE status IS NULL')
    expect(params).toEqual([])
  })

  it('parses contains(...) into an ILIKE with wildcards', () => {
    const { clause, params } = parseFilter("contains(code, 'FB1')", COLS)
    expect(clause).toBe('WHERE code ILIKE $1')
    expect(params).toEqual(['%FB1%'])
  })

  it('parses an in(...) list into = ANY($n)', () => {
    const { clause, params } = parseFilter("status in ('open','closed')", COLS)
    expect(clause).toBe('WHERE status = ANY($1)')
    expect(params).toEqual([['open', 'closed']])
  })

  it('rejects an unknown column instead of building unsafe SQL', () => {
    expect(() => parseFilter("dropped_table eq 'x'", COLS)).toThrow(/Unknown column/)
  })

  it('rejects syntax outside the supported grammar', () => {
    expect(() => parseFilter('1=1; DROP TABLE users;--', COLS)).toThrow()
  })

  it('unescapes doubled single-quotes inside string literals', () => {
    const { params } = parseFilter("code eq 'O''Brien'", COLS)
    expect(params).toEqual(["O'Brien"])
  })
})

describe('parseSelect', () => {
  it('returns * when no $select is given', () => {
    expect(parseSelect(undefined, COLS)).toBe('*')
  })

  it('whitelists requested columns against the live schema', () => {
    expect(parseSelect('id,code', COLS)).toBe('id, code')
  })

  it('throws on a column that does not exist', () => {
    expect(() => parseSelect('id,secret_column', COLS)).toThrow(/Unknown column/)
  })
})

describe('parseOrderBy', () => {
  it('returns empty string when no $orderby is given', () => {
    expect(parseOrderBy(undefined, COLS)).toBe('')
  })

  it('defaults to ASC when no direction is specified', () => {
    expect(parseOrderBy('code', COLS)).toBe('ORDER BY code ASC')
  })

  it('honors an explicit DESC direction', () => {
    expect(parseOrderBy('created_at desc', COLS)).toBe('ORDER BY created_at DESC')
  })

  it('rejects an unknown column', () => {
    expect(() => parseOrderBy('secret_column', COLS)).toThrow(/Invalid \$orderby/)
  })
})
