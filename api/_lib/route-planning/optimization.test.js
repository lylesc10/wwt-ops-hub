import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { optimizeTeamRoute } from './optimization.js'

describe('optimizeTeamRoute', () => {
  const originalKey = process.env.ORS_API_KEY

  beforeEach(() => { delete process.env.ORS_API_KEY })
  afterEach(() => {
    if (originalKey === undefined) delete process.env.ORS_API_KEY
    else process.env.ORS_API_KEY = originalKey
  })

  it('returns the identity order for 2 or fewer stops without calling out to ORS', async () => {
    const coords = [{ lat: 0, lng: 0 }, { lat: 5, lng: 5 }]
    await expect(optimizeTeamRoute(coords, [100, 100])).resolves.toEqual([0, 1])
  })

  it('returns the identity order for a single stop', async () => {
    await expect(optimizeTeamRoute([{ lat: 0, lng: 0 }], [100])).resolves.toEqual([0])
  })

  it('falls back to nearest-neighbor ordering when ORS_API_KEY is not configured', async () => {
    // 0 is near 2 (adjacent), and 1 is far from both — greedy nearest-neighbor
    // starting at index 0 should visit 2 before the far-away 1.
    const coords = [
      { lat: 0, lng: 0 },
      { lat: 10, lng: 10 },
      { lat: 0, lng: 1 },
    ]
    const order = await optimizeTeamRoute(coords, [100, 100, 100])
    expect(order).toEqual([0, 2, 1])
  })
})
