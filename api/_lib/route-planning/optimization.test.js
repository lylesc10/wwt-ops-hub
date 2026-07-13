import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { optimizeTeamRoute } from './optimization.js'

describe('optimizeTeamRoute', () => {
  const originalKey = process.env.ORS_API_KEY

  beforeEach(() => { delete process.env.ORS_API_KEY })
  afterEach(() => {
    if (originalKey === undefined) delete process.env.ORS_API_KEY
    else process.env.ORS_API_KEY = originalKey
    vi.unstubAllGlobals()
  })

  it('returns the identity order for 2 or fewer stops without calling out to ORS', async () => {
    const coords = [{ lat: 0, lng: 0 }, { lat: 5, lng: 5 }]
    await expect(optimizeTeamRoute(coords, [100, 100])).resolves.toEqual([0, 1])
  })

  it('returns the identity order for a single stop', async () => {
    await expect(optimizeTeamRoute([{ lat: 0, lng: 0 }], [100])).resolves.toEqual([0])
  })

  it('preserves the existing order when ORS_API_KEY is not configured', async () => {
    // Reordering without rescheduling would put stop dates out of sequence,
    // so the no-ORS fallback must be the identity (matches optimization.py).
    const coords = [
      { lat: 0, lng: 0 },
      { lat: 10, lng: 10 },
      { lat: 0, lng: 1 },
    ]
    const order = await optimizeTeamRoute(coords, [100, 100, 100])
    expect(order).toEqual([0, 1, 2])
  })

  it('preserves the existing order when the ORS request fails', async () => {
    process.env.ORS_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const coords = [
      { lat: 0, lng: 0 },
      { lat: 10, lng: 10 },
      { lat: 0, lng: 1 },
    ]
    await expect(optimizeTeamRoute(coords, [100, 100, 100])).resolves.toEqual([0, 1, 2])
  })

  it('preserves the existing order when the ORS request throws', async () => {
    process.env.ORS_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const coords = [
      { lat: 0, lng: 0 },
      { lat: 10, lng: 10 },
      { lat: 0, lng: 1 },
    ]
    await expect(optimizeTeamRoute(coords, [100, 100, 100])).resolves.toEqual([0, 1, 2])
  })

  it('applies the ORS-returned job order when the response is valid', async () => {
    process.env.ORS_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{
          steps: [
            { type: 'start' },
            { type: 'job', id: 2 },
            { type: 'job', id: 0 },
            { type: 'job', id: 1 },
            { type: 'end' },
          ],
        }],
      }),
    }))
    const coords = [
      { lat: 0, lng: 0 },
      { lat: 10, lng: 10 },
      { lat: 0, lng: 1 },
    ]
    await expect(optimizeTeamRoute(coords, [100, 100, 100])).resolves.toEqual([2, 0, 1])
  })
})
