import { describe, it, expect } from 'vitest'
import { WO_TYPES, WO_TYPE_CODES } from './woTypes.js'

describe('WO_TYPES', () => {
  it('exposes the six known WO type codes', () => {
    expect(WO_TYPE_CODES.sort()).toEqual(['BRK', 'DEL', 'INL', 'INT', 'LVL', 'LVT'].sort())
  })

  it('marks BRK as a companion type and everything else as not', () => {
    expect(WO_TYPES.BRK.isCompanion).toBe(true)
    for (const code of WO_TYPE_CODES.filter((c) => c !== 'BRK')) {
      expect(WO_TYPES[code].isCompanion).toBeUndefined()
    }
  })

  it('only INL is hourly pay — the rest are fixed', () => {
    expect(WO_TYPES.INL.payType).toBe('hourly')
    for (const code of WO_TYPE_CODES.filter((c) => c !== 'INL')) {
      expect(WO_TYPES[code].payType).toBe('fixed')
    }
  })

  it('defaultTitle interpolates the site name for every type', () => {
    for (const code of WO_TYPE_CODES) {
      expect(WO_TYPES[code].defaultTitle('Denver Branch (FB1A)')).toContain('Denver Branch (FB1A)')
    }
  })
})
