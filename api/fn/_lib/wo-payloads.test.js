import { describe, it, expect } from 'vitest'
import {
  normalizeTime, addHoursToTime, buildSchedulePayload, buildPayPayload,
  buildLocationPayload, buildRootPatch, diffToPatch, patchToSteps,
} from './wo-payloads.js'

describe('normalizeTime', () => {
  it('parses 12-hour am/pm formats', () => {
    expect(normalizeTime('4:30pm')).toBe('16:30:00')
    expect(normalizeTime('9am')).toBe('09:00:00')
    expect(normalizeTime('12am')).toBe('00:00:00')
    expect(normalizeTime('12pm')).toBe('12:00:00')
  })

  it('passes through 24-hour formats', () => {
    expect(normalizeTime('16:30')).toBe('16:30:00')
    expect(normalizeTime('08:00:00')).toBe('08:00:00')
  })

  it('falls back to the given default when input is missing or unrecognized', () => {
    expect(normalizeTime('', '17:00:00')).toBe('17:00:00')
    expect(normalizeTime(null, '17:00:00')).toBe('17:00:00')
    expect(normalizeTime('whenever', '17:00:00')).toBe('17:00:00')
  })
})

describe('addHoursToTime', () => {
  it('adds whole and fractional hours', () => {
    expect(addHoursToTime('08:00:00', 8)).toBe('16:00:00')
    expect(addHoursToTime('08:00:00', 8.5)).toBe('16:30:00')
  })

  it('caps the hour at 23 rather than rolling into the next day', () => {
    expect(addHoursToTime('20:00:00', 8)).toBe('23:00:00')
  })
})

describe('buildSchedulePayload', () => {
  it('returns null when no date is set', () => {
    expect(buildSchedulePayload({})).toBeNull()
  })

  it('derives the end time from approxHours when no endTime is given', () => {
    const payload = buildSchedulePayload({ date: '2026-08-01', startTime: '9am', approxHours: 4 })
    expect(payload).toEqual({
      service_window: {
        mode: 'exact',
        start: { local: { date: '2026-08-01', time: '09:00:00' } },
        end: { local: { date: '2026-08-01', time: '13:00:00' } },
      },
    })
  })

  it('uses an explicit endTime over the approxHours derivation', () => {
    const payload = buildSchedulePayload({ date: '2026-08-01', startTime: '9am', endTime: '5pm', approxHours: 2 })
    expect(payload.service_window.end.local.time).toBe('17:00:00')
  })
})

describe('buildPayPayload', () => {
  it('builds a fixed-pay body', () => {
    expect(buildPayPayload({ type: 'fixed', amount: 150 })).toEqual({ type: 'fixed', base: { amount: 150 } })
  })

  it('builds an hourly-pay body with the base.rate/max_units shape', () => {
    expect(buildPayPayload({ type: 'hourly', rate: 45, maxUnits: 6 })).toEqual({
      type: 'hourly', base: { rate: 45, max_units: 6 },
    })
  })

  it('defaults hourly max_units to 8 when not provided', () => {
    expect(buildPayPayload({ type: 'hourly', rate: 45 }).base.max_units).toBe(8)
  })
})

describe('buildLocationPayload', () => {
  it('produces a flat body with mode:custom and normalized state/country', () => {
    expect(buildLocationPayload({
      address1: '100 Main St', city: 'Denver', state: 'co', zip: '80202', country: 'us',
    })).toEqual({
      mode: 'custom', address1: '100 Main St', address2: '', city: 'Denver',
      state: 'CO', zip: '80202', country: 'US',
    })
  })

  it('defaults country to US when omitted', () => {
    expect(buildLocationPayload({ city: 'Denver' }).country).toBe('US')
  })
})

describe('buildRootPatch', () => {
  it('only includes fields that were actually passed', () => {
    expect(buildRootPatch({ title: 'New Title' })).toEqual({ title: 'New Title' })
    expect(buildRootPatch({ description: 'desc' })).toEqual({ description: 'desc' })
    expect(buildRootPatch({})).toEqual({})
  })
})

describe('diffToPatch', () => {
  const base = {
    date: '2026-08-01', startTime: '9am', endTime: '', approxHours: 8,
    payType: 'fixed', payAmount: 150, payRate: '', payMaxUnits: '',
    address1: '100 Main St', address2: '', city: 'Denver', state: 'CO', zip: '80202', country: 'US',
    title: 'FB1A-LVL(1)', description: 'Original description',
  }

  it('returns an empty patch when nothing changed', () => {
    expect(diffToPatch(base, base)).toEqual({})
  })

  it('includes only the schedule group when just a schedule field changes', () => {
    const patch = diffToPatch(base, { ...base, startTime: '10am' })
    expect(Object.keys(patch)).toEqual(['schedule'])
  })

  it('includes only the pay group when just a pay field changes', () => {
    const patch = diffToPatch(base, { ...base, payAmount: 200 })
    expect(Object.keys(patch)).toEqual(['pay'])
    expect(patch.pay).toEqual({ type: 'fixed', base: { amount: 200 } })
  })

  it('includes only the location group when just a location field changes', () => {
    const patch = diffToPatch(base, { ...base, city: 'Austin' })
    expect(Object.keys(patch)).toEqual(['location'])
  })

  it('includes both root fields directly (not nested) once either one changes', () => {
    // PUT /workorders/{id} takes the current root snapshot, not a partial diff.
    const patch = diffToPatch(base, { ...base, title: 'New Title' })
    expect(patch).toEqual({ title: 'New Title', description: 'Original description' })
  })

  it('includes multiple groups when multiple fields change', () => {
    const patch = diffToPatch(base, { ...base, city: 'Austin', payAmount: 300 })
    expect(Object.keys(patch).sort()).toEqual(['location', 'pay'])
  })
})

describe('patchToSteps', () => {
  it('returns steps in a fixed order: schedule, pay, location, root', () => {
    const patch = {
      schedule: { service_window: {} },
      pay: { type: 'fixed', base: { amount: 1 } },
      location: { mode: 'custom' },
      title: 'New Title',
    }
    const steps = patchToSteps('wo-1', patch)
    expect(steps.map((s) => s.resource)).toEqual(['schedule', 'pay', 'location', 'root'])
    expect(steps[0]).toEqual({ resource: 'schedule', path: '/workorders/wo-1/schedule', method: 'PUT', body: patch.schedule })
    expect(steps[3]).toEqual({ resource: 'root', path: '/workorders/wo-1', method: 'PUT', body: { title: 'New Title' } })
  })

  it('omits steps for groups not present in the patch', () => {
    expect(patchToSteps('wo-1', { pay: { type: 'fixed', base: { amount: 1 } } }).map((s) => s.resource)).toEqual(['pay'])
    expect(patchToSteps('wo-1', {})).toEqual([])
  })

  it('merges title and description into a single root step', () => {
    const steps = patchToSteps('wo-1', { title: 'T', description: 'D' })
    expect(steps).toHaveLength(1)
    expect(steps[0].body).toEqual({ title: 'T', description: 'D' })
  })
})
