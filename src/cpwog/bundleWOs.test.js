import { describe, it, expect } from 'vitest'
import { bundleWOs, bundleAllSites } from './bundleWOs.js'

const site = {
  id: 'site-1', code: 'FB1A', branch_name: 'Denver Branch',
  address: '123 Main St', city: 'Denver', state: 'CO', zip: '80202',
}

describe('bundleWOs', () => {
  it('auto-injects BRK when DEL is requested without it', () => {
    const wos = bundleWOs(site, ['DEL'])
    expect(wos.map((w) => w.wo_type)).toEqual(['DEL', 'BRK'])
  })

  it('does not duplicate BRK if it was already requested', () => {
    const wos = bundleWOs(site, ['DEL', 'BRK'])
    expect(wos.map((w) => w.wo_type)).toEqual(['DEL', 'BRK'])
  })

  it('does not inject BRK for non-DEL types', () => {
    const wos = bundleWOs(site, ['LVL', 'INT'])
    expect(wos.map((w) => w.wo_type)).toEqual(['LVL', 'INT'])
  })

  it('de-duplicates repeated type codes', () => {
    const wos = bundleWOs(site, ['LVL', 'LVL', 'INT'])
    expect(wos.map((w) => w.wo_type)).toEqual(['LVL', 'INT'])
  })

  it('applies per-type overrides keyed by WO type code', () => {
    const wos = bundleWOs(site, ['LVL'], {}, { LVL: { title: 'Custom LVL Title' } })
    expect(wos[0].title).toBe('Custom LVL Title')
  })
})

describe('bundleAllSites', () => {
  it('flattens bundled WOs across every site', () => {
    const siteB = { ...site, id: 'site-2', code: 'FB1B' }
    const wos = bundleAllSites([site, siteB], ['DEL'])
    expect(wos).toHaveLength(4) // (DEL + BRK) x 2 sites
    expect(wos.map((w) => w.site_id)).toEqual(['site-1', 'site-1', 'site-2', 'site-2'])
  })

  it('applies per-site overrides keyed by site id', () => {
    const siteB = { ...site, id: 'site-2', code: 'FB1B' }
    const wos = bundleAllSites([site, siteB], ['LVL'], {}, { 'site-2': { LVL: { title: 'Site 2 Special' } } })
    expect(wos[0].title).not.toBe('Site 2 Special')
    expect(wos[1].title).toBe('Site 2 Special')
  })
})
