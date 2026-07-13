import { describe, it, expect } from 'vitest'
import { addDays, pyWeekday, nextWorkday } from './scheduler.js'

describe('addDays', () => {
  it('adds calendar days to a YYYY-MM-DD string', () => {
    expect(addDays('2026-08-01', 5)).toBe('2026-08-06')
  })

  it('rolls over month/year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('supports negative offsets', () => {
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31')
  })
})

describe('pyWeekday', () => {
  it('uses the Python convention: Monday=0 .. Sunday=6', () => {
    expect(pyWeekday('2026-08-03')).toBe(0) // Monday
    expect(pyWeekday('2026-08-01')).toBe(5) // Saturday
  })
})

describe('nextWorkday', () => {
  it('advances from a weekend to the next allowed weekday', () => {
    const monToFri = new Set([0, 1, 2, 3, 4])
    expect(nextWorkday('2026-08-01', monToFri)).toBe('2026-08-03') // Sat -> Mon
  })

  it('returns the same date if it is already allowed', () => {
    const monToFri = new Set([0, 1, 2, 3, 4])
    expect(nextWorkday('2026-08-03', monToFri)).toBe('2026-08-03')
  })
})
