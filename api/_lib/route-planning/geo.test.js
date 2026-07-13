import { describe, it, expect } from 'vitest'
import { haversineMiles, siteLocationString, techLocationString } from './geo.js'

describe('haversineMiles', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineMiles(39.7392, -104.9903, 39.7392, -104.9903)).toBe(0)
  })

  it('computes a known approximate distance (Denver to Austin ≈ 780mi)', () => {
    const miles = haversineMiles(39.7392, -104.9903, 30.2672, -97.7431)
    expect(miles).toBeGreaterThan(750)
    expect(miles).toBeLessThan(820)
  })
})

describe('siteLocationString', () => {
  it('joins city and state', () => {
    expect(siteLocationString({ city: 'Denver', state: 'CO' })).toBe('Denver, CO')
  })

  it('drops a missing city or state instead of leaving a stray comma', () => {
    expect(siteLocationString({ city: 'Denver', state: null })).toBe('Denver')
    expect(siteLocationString({ city: null, state: 'CO' })).toBe('CO')
  })
})

describe('techLocationString', () => {
  it('uses the first covered state alongside the tech city', () => {
    expect(techLocationString({ city: 'Austin', states: ['TX', 'OK'] })).toBe('Austin, TX')
  })

  it('handles a tech with no covered states', () => {
    expect(techLocationString({ city: 'Austin', states: [] })).toBe('Austin')
  })
})
