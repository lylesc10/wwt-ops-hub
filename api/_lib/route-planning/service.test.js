import { describe, it, expect } from 'vitest'
import { dstr, stopToResponse } from './service.js'

describe('dstr', () => {
  it('returns null for falsy input', () => {
    expect(dstr(null)).toBeNull()
    expect(dstr(undefined)).toBeNull()
    expect(dstr('')).toBeNull()
  })

  it('formats a Date object as YYYY-MM-DD in local time', () => {
    expect(dstr(new Date(2026, 7, 1))).toBe('2026-08-01') // month is 0-indexed
  })

  it('truncates a timestamp string to its date portion', () => {
    expect(dstr('2026-08-01T14:30:00.000Z')).toBe('2026-08-01')
  })
})

describe('stopToResponse', () => {
  it('shapes a raw stop row into the API response, defaulting missing fields', () => {
    const row = {
      id: 'stop-1', team_id: 'team-1', site_id: 'site-1',
      stop_order: 1, scheduled_start: '2026-08-01', scheduled_end: '2026-08-01',
      estimated_hours: '8.5', travel_hours_from_prev: null,
    }
    expect(stopToResponse(row)).toEqual({
      id: 'stop-1', team_id: 'team-1', site_id: 'site-1',
      site_code: null, site_name: null, site_address: null, site_city: null, site_state: null,
      stop_order: 1, scheduled_start: '2026-08-01', scheduled_end: '2026-08-01',
      travel_date: null, estimated_hours: 8.5, travel_hours_from_prev: null,
      status: 'planned', notes: null,
    })
  })

  it('coerces numeric-string fields to numbers', () => {
    const row = { id: 's1', team_id: 't1', site_id: 'x', stop_order: 0, estimated_hours: '4' }
    expect(stopToResponse(row).estimated_hours).toBe(4)
  })
})
