import { describe, it, expect } from 'vitest'
import { generateWO, generateBulk } from './generateWO.js'

const site = {
  id: 'site-1', code: 'FB1A', branch_name: 'Denver Branch',
  address: '123 Main St', city: 'Denver', state: 'CO', zip: '80202',
  scheduled_start: '2026-08-01', scheduled_end: '2026-08-03',
}

describe('generateWO', () => {
  it('throws on an unknown WO type', () => {
    expect(() => generateWO(site, 'NOPE')).toThrow('Unknown WO type: NOPE')
  })

  it('builds a fixed-pay WO with the type default title/description', () => {
    const wo = generateWO(site, 'LVL')
    expect(wo.site_id).toBe('site-1')
    expect(wo.site_code).toBe('FB1A')
    expect(wo.wo_type).toBe('LVL')
    expect(wo.title).toBe('Denver Branch (FB1A) – Level')
    expect(wo.pay_type).toBe('fixed')
    expect(wo.hourly_rate).toBeNull()
    expect(wo.location).toEqual({ address: '123 Main St', city: 'Denver', state: 'CO', zip: '80202' })
    expect(wo.scheduled_start).toBe('2026-08-01')
    expect(wo.scheduled_end).toBe('2026-08-03')
  })

  it('builds an hourly-pay WO for INL using the hourly rate override', () => {
    const wo = generateWO(site, 'INL', { hourlyRate: 45 })
    expect(wo.pay_type).toBe('hourly')
    expect(wo.hourly_rate).toBe(45)
    expect(wo.budget).toBeNull()
  })

  it('overrides win over type defaults, which win over global config', () => {
    const wo = generateWO(site, 'LVL', { title: 'Custom Title', budget: 500 }, { defaultBudget: 100 })
    expect(wo.title).toBe('Custom Title')
    expect(wo.budget).toBe(500)
  })

  it('falls back to globalConfig.defaultBudget when no override is given', () => {
    const wo = generateWO(site, 'LVL', {}, { defaultBudget: 250 })
    expect(wo.budget).toBe(250)
  })

  it('fills in blanks for missing location fields rather than throwing', () => {
    const bareSite = { id: 's2', code: 'X', branch_name: 'Bare' }
    const wo = generateWO(bareSite, 'DEL')
    expect(wo.location).toEqual({ address: '', city: '', state: '', zip: '' })
    expect(wo.scheduled_start).toBeNull()
  })
})

describe('generateBulk', () => {
  it('generates one WO per site, applying per-site overrides by id', () => {
    const siteB = { ...site, id: 'site-2', code: 'FB1B', branch_name: 'Austin Branch' }
    const wos = generateBulk([site, siteB], 'LVL', {}, { 'site-2': { title: 'Special Title' } })
    expect(wos).toHaveLength(2)
    expect(wos[0].title).toBe('Denver Branch (FB1A) – Level')
    expect(wos[1].title).toBe('Special Title')
  })
})
