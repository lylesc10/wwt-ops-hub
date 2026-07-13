import { describe, it, expect } from 'vitest'
import {
  normalizeTime, timesForDay, buildRows, toCSV,
  rowComplete, isPastDate, compressString, decompressString,
} from './engine.js'

describe('normalizeTime', () => {
  it('passes through an already-normalized time, lowercasing the suffix', () => {
    expect(normalizeTime('4:30pm')).toBe('4:30pm')
    expect(normalizeTime('4:30 PM')).toBe('4:30pm')
  })

  it('expands hour-only am/pm', () => {
    expect(normalizeTime('2pm')).toBe('2:00pm')
    expect(normalizeTime('9 AM')).toBe('9:00am')
  })

  it('converts 24-hour military time to 12-hour', () => {
    expect(normalizeTime('16:30')).toBe('4:30pm')
    expect(normalizeTime('16:30:00')).toBe('4:30pm')
    expect(normalizeTime('0:15')).toBe('12:15am')
    expect(normalizeTime('12:00')).toBe('12:00pm')
  })

  it('returns empty string for blank input', () => {
    expect(normalizeTime('')).toBe('')
    expect(normalizeTime(null)).toBe('')
  })

  it('passes through unrecognized formats unchanged', () => {
    expect(normalizeTime('whenever')).toBe('whenever')
  })
})

describe('timesForDay', () => {
  it('falls back to cfg.startTime when no per-day override exists', () => {
    const { start, end } = timesForDay({}, { startTime: '8:00am' }, 0)
    expect(start).toBe('8:00am')
    expect(end).toBe('')
  })

  it('site-level per-day start time wins over cfg.startTime', () => {
    const site = { startTimes: ['', '9:00am'] }
    const { start } = timesForDay(site, { startTime: '8:00am' }, 1)
    expect(start).toBe('9:00am')
  })

  it('cfg per-day time applies when perDayTimes is enabled and no site override exists', () => {
    const cfg = { perDayTimes: true, startTimes: ['', '10:00am'], startTime: '8:00am' }
    const { start } = timesForDay({}, cfg, 1)
    expect(start).toBe('10:00am')
  })

  it('only sets an end time when checkInWindow is enabled', () => {
    const cfg = { startTime: '8:00am', checkInWindow: true, endTime: '5:00pm' }
    expect(timesForDay({}, cfg, 0).end).toBe('5:00pm')
    expect(timesForDay({}, { ...cfg, checkInWindow: false }, 0).end).toBe('')
  })
})

describe('buildRows', () => {
  const site = {
    code: 'FB1A', branchName: 'Denver Branch', address: '123 Main', address2: '',
    city: 'Denver', state: 'CO', zip: '80202', date: '2026-08-01',
    numTechs: '', numDays: '', budgetTech: '', payRate: '', womId: '', routeToTechs: [],
  }
  const cfg = {
    templateId: '102221', startTime: '8:00am', numTechs: '1', numDays: '1',
    budgetTech: '500', payRate: '400', approxHours: '4', country: 'US',
    payType: 'Fixed', techType: 'Tech',
  }

  it('builds a single row for a single-tech, single-day, non-bundled type (DEL)', () => {
    const rows = buildRows(site, 'PRJ1', 'Denver Project', 'DEL', cfg)
    expect(rows).toEqual([[
      102221, 'PRJ1', 'FB1A-DEL', '',
      '123 Main', '', 'Denver', 'CO', '80202',
      'US', '', '2026-08-01', '', '8:00am', '',
      'Tech', '', '',
      500, '', 500, 400,
      '', '', '', '', 4, 4, 'Fixed',
      'Denver Project-FB1A-DEL-Denver, CO', 'Denver Project-FB1A-DEL-Denver, CO', '',
    ]])
  })

  it('sets the bundle column to the site ID for bundled types (LVL)', () => {
    const rows = buildRows(site, 'PRJ1', 'Denver Project', 'LVL', cfg)
    expect(rows[0][2]).toBe('FB1A-LVL(1)') // siteId
    expect(rows[0][3]).toBe('FB1A-LVL(1)') // bundle === siteId when useBundle
  })

  it('generates one row per tech, incrementing the site ID suffix', () => {
    const multiTechCfg = { ...cfg, numTechs: '2' }
    const rows = buildRows(site, 'PRJ1', 'Denver Project', 'DEL', multiTechCfg)
    expect(rows).toHaveLength(2)
    expect(rows[0][2]).toBe('FB1A-DEL(1)')
    expect(rows[1][2]).toBe('FB1A-DEL(2)')
  })

  it('appends a trailing blank row when a single tech spans multiple days', () => {
    const multiDayCfg = { ...cfg, numDays: '2' }
    const rows = buildRows(site, 'PRJ1', 'Denver Project', 'DEL', multiDayCfg)
    expect(rows).toHaveLength(3) // 2 day rows + 1 trailing separator
    expect(rows[2]).toEqual([])
    expect(rows[1][11]).toBe('2026-08-02') // date column advances by 1 day
  })
})

describe('toCSV', () => {
  it('quotes fields containing commas and renders blank rows as blank lines', () => {
    const csv = toCSV(['A', 'B'], [['1', 'x,y'], []])
    expect(csv).toBe('A,B\r\n1,"x,y"\r\n')
  })

  it('escapes embedded quotes by doubling them', () => {
    const csv = toCSV(['A'], [['say "hi"']])
    expect(csv).toBe('A\r\n"say ""hi"""')
  })
})

describe('rowComplete', () => {
  it('is true only when all required fields are present', () => {
    const complete = { code: 'A', address: '1 St', city: 'Denver', state: 'CO', zip: '80202', date: '2026-08-01' }
    expect(rowComplete(complete)).toBe(true)
    expect(rowComplete({ ...complete, zip: '' })).toBe(false)
  })
})

describe('isPastDate', () => {
  it('flags yesterday as past and next year as not', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]
    const nextYear = `${new Date().getFullYear() + 1}-01-01`
    expect(isPastDate(yesterday)).toBe(true)
    expect(isPastDate(nextYear)).toBe(false)
  })

  it('treats missing input as not past', () => {
    expect(isPastDate('')).toBe(false)
    expect(isPastDate(null)).toBe(false)
  })
})

describe('compressString / decompressString', () => {
  it('round-trips text through gzip + base64', async () => {
    const original = 'hello world — job history payload'
    const compressed = await compressString(original)
    expect(typeof compressed).toBe('string')
    const restored = await decompressString(compressed)
    expect(restored).toBe(original)
  })
})
