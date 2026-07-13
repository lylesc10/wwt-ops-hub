import { describe, it, expect } from 'vitest'
import { addDays, pyWeekday, nextWorkday, endDateForNights, generateSchedule } from './scheduler.js'

const MON_FRI = new Set([0, 1, 2, 3, 4])

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
    expect(nextWorkday('2026-08-01', MON_FRI)).toBe('2026-08-03') // Sat -> Mon
  })

  it('returns the same date if it is already allowed', () => {
    expect(nextWorkday('2026-08-03', MON_FRI)).toBe('2026-08-03')
  })

  it('skips holidays', () => {
    const holidays = new Set(['2026-08-03'])
    expect(nextWorkday('2026-08-01', MON_FRI, holidays)).toBe('2026-08-04')
  })
})

describe('endDateForNights', () => {
  it('returns the start date for a single night', () => {
    expect(endDateForNights('2026-08-03', 1, MON_FRI)).toBe('2026-08-03')
  })

  it('spans consecutive work days, skipping weekends', () => {
    // Friday start, 2 nights -> ends the following Monday
    expect(endDateForNights('2026-08-07', 2, MON_FRI)).toBe('2026-08-10')
  })

  it('skips holidays when spanning', () => {
    const holidays = new Set(['2026-08-04'])
    expect(endDateForNights('2026-08-03', 2, MON_FRI, holidays)).toBe('2026-08-05')
  })
})

// ── generateSchedule (table-driven, DB/geocoder injected) ─────────────────────

// Coordinates roughly Raleigh NC / Charlotte NC / Richmond VA / Phoenix AZ
const GEO = {
  'Raleigh, NC': { lat: 35.78, lng: -78.64 },
  'Cary, NC': { lat: 35.79, lng: -78.78 },
  'Charlotte, NC': { lat: 35.23, lng: -80.84 },
  'Richmond, VA': { lat: 37.54, lng: -77.44 },
  'Phoenix, AZ': { lat: 33.45, lng: -112.07 },
}
const geocoder = async (loc) => GEO[loc] ?? null

// Members without city/states have no location -> no centroid -> fallback path
const team = (id, members = [{ technician_id: `tech-${id}` }]) => ({ id, members })
const geoTeam = (id, city, state) =>
  ({ id, members: [{ technician_id: `tech-${id}`, city, states: [state] }] })

const basePlan = {
  id: 'plan-1',
  start_date: '2026-08-03', // a Monday
  end_date: null,
  max_sites_per_night: null,
  work_days: [0, 1, 2, 3, 4],
}

const defaults = { busyByTech: {}, geocoder, holidays: new Set() }

describe('generateSchedule', () => {
  it('re-flows a site with a date but date_locked=false from plan start', async () => {
    const sites = [{ id: 's1', city: 'Raleigh', state: 'NC', scheduled_start: '2026-01-05', date_locked: false }]
    const stops = await generateSchedule(basePlan, { ...defaults, teams: [team('t1')], sites })
    expect(stops).toHaveLength(1)
    expect(stops[0].scheduled_start).toBe('2026-08-03')
  })

  it('keeps a date_locked site pinned to its scheduled date', async () => {
    const sites = [{ id: 's1', city: 'Raleigh', state: 'NC', scheduled_start: '2026-08-12', date_locked: true }]
    const stops = await generateSchedule(basePlan, { ...defaults, teams: [team('t1')], sites })
    expect(stops[0].scheduled_start).toBe('2026-08-12')
  })

  it('assigns a locked site to the least-loaded team on that date', async () => {
    const sites = [
      { id: 's1', city: 'Raleigh', state: 'NC', scheduled_start: '2026-08-12', date_locked: true },
      { id: 's2', city: 'Cary', state: 'NC', scheduled_start: '2026-08-12', date_locked: true },
    ]
    const stops = await generateSchedule(basePlan, { ...defaults, teams: [team('t1'), team('t2')], sites })
    expect(new Set(stops.map((s) => s.team_id))).toEqual(new Set(['t1', 't2']))
  })

  it('applies the hours fallback chain: override beats site hours beats 8.0 default', async () => {
    const sites = [
      { id: 's1', city: 'Raleigh', state: 'NC', estimated_hours: '4.5' },
      { id: 's2', city: 'Cary', state: 'NC' },
    ]
    const noOverride = await generateSchedule(basePlan, { ...defaults, teams: [team('t1')], sites })
    expect(noOverride.find((s) => s.site_id === 's1').estimated_hours).toBe(4.5)
    expect(noOverride.find((s) => s.site_id === 's2').estimated_hours).toBe(8.0)

    const withOverride = await generateSchedule(basePlan, {
      ...defaults, teams: [team('t1')], sites,
      params: { estimatedHoursOverride: 6.0, maxSitesPerNight: null },
    })
    for (const s of withOverride) expect(s.estimated_hours).toBe(6.0)
  })

  it('packs two 4h sites into one day under the 10h cap; an 8h site gets its own day', async () => {
    // Fallback path sorts by (state, city) and only moves the day cursor
    // forward, so the two 4h sites must be sort-adjacent to share a day.
    const sites = [
      { id: 's1', city: 'Apex', state: 'NC', estimated_hours: 4 },
      { id: 's2', city: 'Cary', state: 'NC', estimated_hours: 4 },
      { id: 's3', city: 'Durham', state: 'NC', estimated_hours: 8 },
    ]
    const stops = await generateSchedule(basePlan, { ...defaults, teams: [team('t1')], sites })
    const byId = Object.fromEntries(stops.map((s) => [s.site_id, s]))
    expect(byId.s1.scheduled_start).toBe('2026-08-03')
    expect(byId.s2.scheduled_start).toBe('2026-08-03')
    expect(byId.s3.scheduled_start).toBe('2026-08-04')
  })

  it('enforces max_sites_per_night as a global cross-team daily cap', async () => {
    const sites = [
      { id: 's1', city: 'Raleigh', state: 'NC', estimated_hours: 2 },
      { id: 's2', city: 'Cary', state: 'NC', estimated_hours: 2 },
    ]
    const plan = { ...basePlan, max_sites_per_night: 1 }
    const stops = await generateSchedule(plan, { ...defaults, teams: [team('t1'), team('t2')], sites })
    const days = stops.map((s) => s.scheduled_start)
    expect(new Set(days).size).toBe(days.length)
  })

  it('pushes stops past PTO and other-plan busy ranges (proximity path)', async () => {
    // The proximity branch advances the date when members are unavailable
    // (the fallback branch only rotates teams, matching the Python reference).
    const sites = [{ id: 's1', city: 'Raleigh', state: 'NC' }]
    const busyByTech = { 'tech-t1': [{ start: '2026-08-03', end: '2026-08-04' }] }
    const teams = [geoTeam('t1', 'Raleigh', 'NC')]
    const stops = await generateSchedule(basePlan, { ...defaults, busyByTech, teams, sites })
    expect(stops[0].scheduled_start).toBe('2026-08-05')
  })

  it('schedules only on plan work_days and rolls a weekend start forward', async () => {
    const plan = { ...basePlan, start_date: '2026-08-01', work_days: [0, 2] } // Sat start; Mon+Wed only
    const sites = [
      { id: 's1', city: 'Raleigh', state: 'NC' },
      { id: 's2', city: 'Cary', state: 'NC' },
    ]
    const stops = await generateSchedule(plan, { ...defaults, teams: [team('t1')], sites })
    const days = stops.map((s) => s.scheduled_start).sort()
    expect(days).toEqual(['2026-08-03', '2026-08-05']) // Mon, Wed
  })

  it('skips company holidays', async () => {
    const sites = [{ id: 's1', city: 'Raleigh', state: 'NC' }]
    const holidays = new Set(['2026-08-03'])
    const stops = await generateSchedule(basePlan, { ...defaults, holidays, teams: [team('t1')], sites })
    expect(stops[0].scheduled_start).toBe('2026-08-04')
  })

  it('assigns each site to the nearest team and orders per-team by nearest neighbor', async () => {
    const teams = [geoTeam('t-nc', 'Raleigh', 'NC'), geoTeam('t-az', 'Phoenix', 'AZ')]
    const sites = [
      { id: 'az1', city: 'Phoenix', state: 'AZ', estimated_hours: 2 },
      { id: 'nc-far', city: 'Charlotte', state: 'NC', estimated_hours: 2 },
      { id: 'nc-near', city: 'Cary', state: 'NC', estimated_hours: 2 },
      { id: 'nc-mid', city: 'Richmond', state: 'VA', estimated_hours: 2 },
    ]
    const stops = await generateSchedule(basePlan, { ...defaults, teams, sites })
    const azStops = stops.filter((s) => s.team_id === 't-az')
    const ncStops = stops.filter((s) => s.team_id === 't-nc')
    expect(azStops.map((s) => s.site_id)).toEqual(['az1'])
    // Nearest-neighbor from the first NC site: Charlotte -> Cary -> Richmond
    expect(ncStops.sort((a, b) => a.stop_order - b.stop_order).map((s) => s.site_id))
      .toEqual(['nc-far', 'nc-near', 'nc-mid'])
  })

  it('fallback sort compares (state, city) field-wise, not concatenated', async () => {
    // Concatenation would order 'AZ'+'A' ("AZA") before 'A'+'Z' ("AZ" < "AZA" is false
    // ordinally: "AZ" < "AZA"), tuple order puts state 'A' first regardless of city.
    const sites = [
      { id: 'az-a', city: 'A', state: 'AZ', estimated_hours: 2 },
      { id: 'a-z', city: 'Z', state: 'A', estimated_hours: 2 },
    ]
    const stops = await generateSchedule(basePlan, { ...defaults, teams: [team('t1')], sites })
    const ordered = stops.sort((a, b) => a.stop_order - b.stop_order).map((s) => s.site_id)
    expect(ordered).toEqual(['a-z', 'az-a'])
  })

  it('adds travel hours and a travel day only for legs over the 4h threshold', async () => {
    const teams = [geoTeam('t1', 'Raleigh', 'NC')]
    const sites = [
      { id: 'near1', city: 'Raleigh', state: 'NC', estimated_hours: 8 },
      { id: 'near2', city: 'Cary', state: 'NC', estimated_hours: 8 },
      { id: 'far', city: 'Phoenix', state: 'AZ', estimated_hours: 8 },
    ]
    const stops = await generateSchedule(basePlan, { ...defaults, teams, sites })
    const byId = Object.fromEntries(stops.map((s) => [s.site_id, s]))
    expect(byId.near2.travel_hours).toBeLessThan(4)
    expect(byId.near2.travel_date).toBeNull()
    expect(byId.far.travel_hours).toBeGreaterThan(4)
    expect(byId.far.travel_date).toBe(addDays(byId.far.scheduled_start, -1))
  })

  it('spans a 2-night site over the weekend and starts the next site after it', async () => {
    const plan = { ...basePlan, start_date: '2026-08-07' } // a Friday
    const sites = [
      { id: 's1', city: 'Raleigh', state: 'NC', nights_required: 2, estimated_hours: 8 },
      { id: 's2', city: 'Cary', state: 'NC', estimated_hours: 8 },
    ]
    const teams = [geoTeam('t1', 'Raleigh', 'NC')]
    const stops = await generateSchedule(plan, { ...defaults, teams, sites })
    const byId = Object.fromEntries(stops.map((s) => [s.site_id, s]))
    expect(byId.s1.scheduled_start).toBe('2026-08-07')
    expect(byId.s1.scheduled_end).toBe('2026-08-10') // Fri + 1 more work day = Mon
    expect(byId.s2.scheduled_start > byId.s1.scheduled_end).toBe(true)
  })
})
