import { describe, it, expect } from 'vitest'
import { runParser, detectHeaders, getSampleRows } from './parserEngine.js'

describe('detectHeaders', () => {
  it('picks the header row using the auto-detected delimiter', () => {
    const input = 'code,city,state\nFB1A,Denver,CO\nFB1B,Austin,TX'
    expect(detectHeaders(input)).toEqual(['code', 'city', 'state'])
  })

  it('auto-detects tab delimiter when it dominates', () => {
    const input = 'code\tcity\tstate\nFB1A\tDenver\tCO'
    expect(detectHeaders(input)).toEqual(['code', 'city', 'state'])
  })

  it('returns [] for empty input', () => {
    expect(detectHeaders('')).toEqual([])
  })
})

describe('getSampleRows', () => {
  it('skips the header row by default and returns the requested count', () => {
    const input = 'code,city\nFB1A,Denver\nFB1B,Austin\nFB1C,Phoenix'
    expect(getSampleRows(input, {}, 2)).toEqual([
      ['FB1A', 'Denver'],
      ['FB1B', 'Austin'],
    ])
  })
})

describe('runParser', () => {
  const baseConfig = {
    has_header: true,
    mappings: [
      { source_col: 'code', target_field: 'code', required: true },
      { source_col: 'city', target_field: 'city' },
    ],
  }

  it('maps columns by header name', () => {
    const input = 'code,city\nFB1A,Denver'
    const { rows, errors, skipped, total } = runParser(input, baseConfig)
    expect(rows).toEqual([{ code: 'FB1A', city: 'Denver' }])
    expect(errors).toEqual([])
    expect(skipped).toBe(0)
    expect(total).toBe(1)
  })

  it('supports mapping by column index (no header)', () => {
    const config = {
      has_header: false,
      mappings: [
        { source_col: 0, target_field: 'code', required: true },
        { source_col: 1, target_field: 'city' },
      ],
    }
    const { rows } = runParser('FB1A,Denver\nFB1B,Austin', config)
    expect(rows).toEqual([
      { code: 'FB1A', city: 'Denver' },
      { code: 'FB1B', city: 'Austin' },
    ])
  })

  it('flags a missing required field as a row error and drops the value', () => {
    const input = 'code,city\n,Denver'
    const { rows, errors } = runParser(input, baseConfig)
    expect(errors).toEqual(['Row 1: required field "code" is empty'])
    // The row is still emitted (with whatever mapped fields succeeded)
    expect(rows).toEqual([{ city: 'Denver' }])
  })

  it('applies default_value when a required field is empty', () => {
    const config = {
      has_header: true,
      mappings: [{ source_col: 'code', target_field: 'code', required: true, default_value: 'UNKNOWN' }],
    }
    // Blank lines are dropped before mapping ever runs, so exercise the empty-value
    // path via a row that has *some* content (city) but an empty 'code' cell.
    const { rows, errors } = runParser('code,city\n,Denver', config)
    expect(errors).toEqual([])
    expect(rows).toEqual([{ code: 'UNKNOWN' }])
  })

  it('skips rows matching skip_if.is_empty', () => {
    const config = {
      has_header: true,
      skip_if: [{ col: 'code', is_empty: true }],
      mappings: [
        { source_col: 'code', target_field: 'code' },
        { source_col: 'city', target_field: 'city' },
      ],
    }
    // Fully blank lines are dropped before skip_if ever runs, so exercise the rule
    // via a row whose 'code' cell is empty but the line itself has content.
    const { rows, skipped, total } = runParser('code,city\nFB1A,Denver\n,Austin', config)
    expect(skipped).toBe(1)
    expect(rows).toEqual([{ code: 'FB1A', city: 'Denver' }])
    expect(total).toBe(2)
  })

  it('applies the phone transform', () => {
    const config = {
      has_header: true,
      mappings: [{ source_col: 'phone', target_field: 'phone', transform: 'phone' }],
    }
    const { rows } = runParser('phone\n5551234567', config)
    expect(rows).toEqual([{ phone: '+15551234567' }])
  })

  it('applies the currency transform', () => {
    const config = {
      has_header: true,
      mappings: [{ source_col: 'budget', target_field: 'budget', transform: 'currency' }],
    }
    const { rows } = runParser('budget\n"$1,250.50"', config)
    expect(rows).toEqual([{ budget: 1250.5 }])
  })

  it('applies value_maps to translate a raw value', () => {
    const config = {
      has_header: true,
      mappings: [{ source_col: 'status', target_field: 'status' }],
      value_maps: { status: { active: 'ACTIVE', done: 'COMPLETE' } },
    }
    const { rows } = runParser('status\nActive', config)
    expect(rows).toEqual([{ status: 'ACTIVE' }])
  })

  it('extracts via regex_extract before applying transforms', () => {
    const config = {
      has_header: true,
      mappings: [{ source_col: 'raw', target_field: 'code', regex_extract: '^(\\w+)-' }],
    }
    const { rows } = runParser('raw\nFB1A-suffix', config)
    expect(rows).toEqual([{ code: 'FB1A' }])
  })

  it('respects previewRows to limit processed rows', () => {
    const config = {
      has_header: true,
      mappings: [{ source_col: 'code', target_field: 'code' }],
    }
    const { rows, total } = runParser('code\nA\nB\nC', config, { previewRows: 1 })
    expect(rows).toEqual([{ code: 'A' }])
    expect(total).toBe(3) // total reflects the full parsed input, not the preview slice
  })
})
