import { describe, it, expect } from 'vitest'
import {
  normalizePartNumber,
  normalizeDescription,
  validateSteps,
  matchBomItems,
} from './hardwareMatcher.js'
import { injectProcedures } from './postProcessor.js'

describe('normalizePartNumber', () => {
  it('trims, uppercases, and strips internal whitespace', () => {
    expect(normalizePartNumber('  c9300 - 48p ')).toBe('C9300-48P')
  })

  it('returns null for empty, whitespace-only, and nullish input', () => {
    expect(normalizePartNumber('')).toBeNull()
    expect(normalizePartNumber('   ')).toBeNull()
    expect(normalizePartNumber(null)).toBeNull()
    expect(normalizePartNumber(undefined)).toBeNull()
  })
})

describe('normalizeDescription', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeDescription('  Cisco Catalyst-9300, 48-Port (PoE+) ')).toBe(
      'cisco catalyst 9300 48 port poe'
    )
  })
})

describe('validateSteps', () => {
  it('throws on non-array input', () => {
    expect(() => validateSteps('not steps')).toThrow()
    expect(() => validateSteps({ text: 'x' })).toThrow()
  })

  it('drops steps with empty text and coerces flags to booleans', () => {
    const result = validateSteps([
      { text: '  Rack the switch  ', warning: 1, photo_required: undefined },
      { text: '', warning: true },
      { text: '   ' },
      null,
      { text: 'Connect uplinks', extra_key: 'stripped' },
    ])
    expect(result).toEqual([
      { text: 'Rack the switch', warning: true, photo_required: false },
      { text: 'Connect uplinks', warning: false, photo_required: false },
    ])
  })
})

describe('matchBomItems', () => {
  const hardware = [
    { id: 'hw-1', part_number: 'C9300-48P', description: 'Catalyst 9300 48-port switch', steps: [{ text: 'Rack it', warning: false, photo_required: false }] },
    { id: 'hw-2', part_number: null, description: 'Wall-mount cabinet', steps: [] },
    { id: 'hw-3', part_number: null, description: 'Wall-mount cabinet 68in AFF with backer board', steps: [{ text: 'Mount at 68in AFF', warning: true, photo_required: true }] },
    { id: 'hw-4', part_number: 'PP-24', description: 'RJ', steps: [] },
  ]

  it('matches by exact part number, case-insensitively', () => {
    const [item] = matchBomItems(
      [{ description: 'totally different words', part_number: 'c9300-48p' }],
      hardware
    )
    expect(item.match).toMatchObject({ hardware_id: 'hw-1', matched_by: 'part_number' })
    expect(item.match.steps).toHaveLength(1)
  })

  it('prefers part-number match over description match', () => {
    const [item] = matchBomItems(
      [{ description: 'Wall-mount cabinet', part_number: 'C9300-48P' }],
      hardware
    )
    expect(item.match.hardware_id).toBe('hw-1')
  })

  it('falls back to case-insensitive description substring (both directions)', () => {
    // BOM description contains hardware description
    const [a] = matchBomItems(
      [{ description: 'WALL-MOUNT CABINET, black', part_number: '' }],
      [hardware[1]]
    )
    expect(a.match).toMatchObject({ hardware_id: 'hw-2', matched_by: 'description' })

    // hardware description contains BOM description
    const [b] = matchBomItems(
      [{ description: 'cabinet 68in AFF', part_number: '' }],
      [hardware[2]]
    )
    expect(b.match.hardware_id).toBe('hw-3')
  })

  it('picks the most specific (longest description) candidate', () => {
    const [item] = matchBomItems(
      [{ description: 'Wall-mount cabinet 68in AFF with backer board and extras', part_number: '' }],
      hardware
    )
    expect(item.match.hardware_id).toBe('hw-3')
  })

  it('never substring-matches descriptions shorter than 4 normalized chars', () => {
    const [item] = matchBomItems(
      [{ description: 'RJ45 patch panel RJ', part_number: '' }],
      [hardware[3]]
    )
    expect(item.match).toBeNull()
  })

  it('returns match: null when nothing matches, preserving item fields', () => {
    const [item] = matchBomItems(
      [{ description: 'Unknown gadget', part_number: 'ZZZ-1', quantity: 3 }],
      hardware
    )
    expect(item).toEqual({ description: 'Unknown gadget', part_number: 'ZZZ-1', quantity: 3, match: null })
  })
})

describe('injectProcedures end-to-end with matched hardware steps', () => {
  it('replaces the installation subsection content with curated checkbox steps', () => {
    const schemaData = {
      title: 'Deployment Guide',
      sections: [
        {
          heading: 'Installation',
          content: 'Overview',
          subsections: [
            { heading: 'Install Catalyst 9300 48-port switch', content: 'AI guess' },
          ],
        },
      ],
    }
    const bomProcedures = [{
      description: 'Catalyst 9300 48-port switch',
      part_number: 'C9300-48P',
      matched_procedure_title: 'Catalyst 9300 48-port switch',
      steps: [
        { text: 'Rack the switch', warning: false, photo_required: true },
        { text: 'Verify grounding', warning: true, photo_required: false },
      ],
    }]

    const result = injectProcedures(schemaData, [], bomProcedures)
    const sub = result.sections[0].subsections[0]
    expect(sub.content).toBe(
      '- [ ] Rack the switch\n  - [ ] Photo required after this step\n- [ ] **⚠️ CRITICAL:** Verify grounding'
    )
    expect(sub.procedure_steps).toEqual([
      { text: 'Rack the switch', warning: false, photoRequired: true, escalationTrigger: false },
      { text: 'Verify grounding', warning: true, photoRequired: false, escalationTrigger: false },
    ])
  })
})
