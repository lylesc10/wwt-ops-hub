import { describe, it, expect } from 'vitest'
import { assembleTeams } from './teamAssembler.js'

describe('assembleTeams', () => {
  it('warns and returns empty when there are no technicians', () => {
    const result = assembleTeams({ techs: [], sites: [{ id: 's1' }], techsPerSite: 1 })
    expect(result).toEqual({
      teams: [], unassigned_techs: [],
      warnings: ['No technicians available for team assembly.'],
    })
  })

  it('warns and returns empty when there are no sites', () => {
    const result = assembleTeams({ techs: [{ id: 't1' }], sites: [], techsPerSite: 1 })
    expect(result).toEqual({
      teams: [], unassigned_techs: [],
      warnings: ['No sites available for team assembly.'],
    })
  })

  it('reports every tech as unassigned when there are not enough for one full team', () => {
    const techs = [{ id: 't1', name: 'Tech 1' }, { id: 't2', name: 'Tech 2' }]
    const sites = [{ id: 's1', lat: 39.7, lng: -104.9, state: 'CO' }]
    const result = assembleTeams({ techs, sites, techsPerSite: 3 })
    expect(result.teams).toEqual([])
    expect(result.unassigned_techs).toHaveLength(2)
    expect(result.warnings).toContain('Not enough technicians to form a full team of 3 (have 2).')
  })

  it('assigns geographically-clustered techs to their nearest site cluster', () => {
    const denver = { id: 's-denver', name: 'Denver Site', city: 'Denver', state: 'CO', lat: 39.7, lng: -104.9 }
    const austin = { id: 's-austin', name: 'Austin Site', city: 'Austin', state: 'TX', lat: 30.2, lng: -97.7 }

    const techs = [
      { id: 'a1', name: 'Denver Tech 1', lat: 39.7, lng: -104.9 },
      { id: 'a2', name: 'Denver Tech 2', lat: 39.8, lng: -105.0 },
      { id: 'b1', name: 'Austin Tech 1', lat: 30.2, lng: -97.7 },
      { id: 'b2', name: 'Austin Tech 2', lat: 30.3, lng: -97.8 },
    ]

    const result = assembleTeams({
      techs, sites: [denver, austin], techsPerSite: 2,
      startDate: '2026-08-01', endDate: '2026-08-03',
    })

    expect(result.teams).toHaveLength(2)
    expect(result.unassigned_techs).toEqual([])

    const denverTeam = result.teams.find((t) => t.site_ids.includes('s-denver'))
    const austinTeam = result.teams.find((t) => t.site_ids.includes('s-austin'))
    expect(new Set(denverTeam.members.map((m) => m.tech_id))).toEqual(new Set(['a1', 'a2']))
    expect(new Set(austinTeam.members.map((m) => m.tech_id))).toEqual(new Set(['b1', 'b2']))
    // Exactly one lead per team
    expect(denverTeam.members.filter((m) => m.role === 'lead')).toHaveLength(1)
  })

  it('flags a technician with no location instead of throwing', () => {
    const site = { id: 's1', lat: 39.7, lng: -104.9, state: 'CO' }
    const tech = { id: 't1', name: 'No Location Tech' }
    const result = assembleTeams({ techs: [tech], sites: [site], techsPerSite: 1 })
    expect(result.teams).toHaveLength(1)
    const cautionTypes = result.teams[0].members[0].cautions.map((c) => c.type)
    expect(cautionTypes).toContain('no_location')
  })
})
