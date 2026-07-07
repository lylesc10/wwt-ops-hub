/**
 * Deterministic procedure injection post-processor — ported from
 * field-services backend/app/docgen/post_processor.py.
 *
 * Runs after AI generation and before saving to DB. Replaces AI content in
 * procedure-backed sections (Check-In, Check-Out, matched BOM items) with
 * exact curated steps formatted as checkboxes.
 *
 * wwt-ops-hub has no curated procedure library yet, so injection is normally
 * a no-op — but resolveUnusedPlaceholders() also cleans up any
 * _[PROCEDURE_PLACEHOLDER: ...]_ markers the AI emitted with nothing to
 * inject, replacing them with a generic checklist so documents never ship
 * with raw placeholder text.
 *
 * Pure functions only — no DB dependencies.
 */

// ── Step formatting ───────────────────────────────────────────────────────────

export function formatStepAsCheckbox(step) {
  const prefix = step.warning ? '**⚠️ CRITICAL:** ' : ''
  const lines = [`- [ ] ${prefix}${step.text}`]
  if (step.photo_required) lines.push('  - [ ] Photo required after this step')
  if (step.escalation_trigger) lines.push('  > ⚠️ If this cannot be achieved, STOP and escalate')
  return lines.join('\n')
}

function formatSteps(steps) {
  return steps.map(formatStepAsCheckbox).join('\n')
}

function stepsToStructured(steps) {
  return steps.map(s => ({
    text: s.text,
    warning: !!s.warning,
    photoRequired: !!s.photo_required,
    escalationTrigger: !!s.escalation_trigger,
  }))
}

// ── Heading normalization and classification ──────────────────────────────────

export function normalizeHeading(heading) {
  return String(heading ?? '')
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[^\w\s]/g, '')
    .split(/\s+/).filter(Boolean).join(' ')
}

export function classifyHeading(heading) {
  const normalized = normalizeHeading(heading)
  if (normalized.includes('check in')) return 'check_in'
  if (normalized.includes('check out')) return 'check_out'
  if (normalized.includes('installation')) return 'installation'
  return null
}

// ── Token overlap matching for BOM subsections ────────────────────────────────

export function tokenOverlapRatio(description, heading) {
  const descTokens = new Set(normalizeHeading(description).split(' ').filter(Boolean))
  if (!descTokens.size) return 0
  const headingTokens = new Set(normalizeHeading(heading).split(' ').filter(Boolean))
  let overlap = 0
  for (const t of descTokens) if (headingTokens.has(t)) overlap++
  return overlap / descTokens.size
}

const BOM_MATCH_THRESHOLD = 0.6

function findBestBomMatch(heading, bomProcedures, alreadyMatched) {
  let bestIdx = null
  let bestRatio = BOM_MATCH_THRESHOLD
  bomProcedures.forEach((bom, idx) => {
    if (alreadyMatched.has(idx)) return
    const ratio = tokenOverlapRatio(bom.description, heading)
    if (ratio >= bestRatio) {
      bestRatio = ratio
      bestIdx = idx
    }
  })
  return bestIdx
}

// ── Core injection ────────────────────────────────────────────────────────────

/**
 * Return new schema_data with procedure steps injected. Does NOT mutate input.
 *
 * alwaysProcedures: [{ title, doc_section: 'check_in'|'check_out', steps: [...] }]
 * bomProcedures:    [{ description, part_number, matched_procedure_title, steps|null }]
 */
export function injectProcedures(schemaData, alwaysProcedures = [], bomProcedures = []) {
  if (!schemaData || !schemaData.sections) return structuredClone(schemaData ?? {})
  if (!alwaysProcedures.length && !bomProcedures.length) return structuredClone(schemaData)

  const alwaysBySection = {}
  for (const proc of alwaysProcedures) alwaysBySection[proc.doc_section] = proc

  const result = structuredClone(schemaData)

  result.sections = result.sections.map(section => {
    const classification = classifyHeading(section.heading ?? '')

    if (classification === 'check_in' || classification === 'check_out') {
      const proc = alwaysBySection[classification]
      if (proc?.steps?.length) {
        return {
          ...section,
          content: formatSteps(proc.steps),
          procedure_steps: stepsToStructured(proc.steps),
        }
      }
      return section
    }

    if (classification === 'installation') {
      return injectBomIntoInstallation(section, bomProcedures)
    }

    return section
  })

  return result
}

function injectBomIntoInstallation(section, bomProcedures) {
  const subsections = [...(section.subsections ?? [])]
  const matchedIndices = new Set()

  const newSubsections = subsections.map(sub => {
    const bestIdx = findBestBomMatch(sub.heading ?? '', bomProcedures, matchedIndices)
    if (bestIdx === null) return sub
    const bom = bomProcedures[bestIdx]
    matchedIndices.add(bestIdx)
    if (bom.steps?.length) {
      return {
        ...sub,
        content: formatSteps(bom.steps),
        procedure_steps: stepsToStructured(bom.steps),
      }
    }
    return sub // unmatched BOM item — preserve AI content with markers
  })

  // Append subsections for matched BOMs with no existing subsection
  bomProcedures.forEach((bom, idx) => {
    if (matchedIndices.has(idx) || !bom.steps?.length) return
    newSubsections.push({
      heading: `Install ${bom.description}`,
      content: formatSteps(bom.steps),
      procedure_steps: stepsToStructured(bom.steps),
    })
  })

  return { ...section, subsections: newSubsections }
}

// ── Unresolved placeholder cleanup ────────────────────────────────────────────

const PLACEHOLDER_RE = /_?\[PROCEDURE_PLACEHOLDER:\s*(\w+)\]_?/g

const FALLBACK_CONTENT = {
  check_in: [
    '- [ ] Check in with the site contact on arrival',
    '- [ ] Present identification and sign in per site policy',
    '- [ ] Confirm work area access and secure a staging location',
    '- [ ] Verify equipment delivery is on site and undamaged',
    '- [ ] Notify the command center / PM that work is starting',
  ].join('\n'),
  check_out: [
    '- [ ] Clean the work area and remove all packaging/debris',
    '- [ ] Confirm all equipment is powered on and operational',
    '- [ ] Take completion photos per deliverable requirements',
    '- [ ] Obtain site contact sign-off',
    '- [ ] Notify the command center / PM that work is complete before leaving',
  ].join('\n'),
  bom_matched: '_Installation steps to be completed — edit this subsection with the detailed procedure._',
}

/**
 * Replace any placeholder markers the AI emitted that had no curated
 * procedure to inject, so documents never contain raw placeholder text.
 */
export function resolveUnusedPlaceholders(schemaData) {
  if (!schemaData?.sections) return schemaData
  const result = structuredClone(schemaData)

  const clean = (content) =>
    typeof content === 'string'
      ? content.replace(PLACEHOLDER_RE, (_, kind) => FALLBACK_CONTENT[kind] ?? FALLBACK_CONTENT.bom_matched)
      : content

  result.sections = result.sections.map(section => ({
    ...section,
    content: clean(section.content),
    subsections: (section.subsections ?? []).map(sub => ({ ...sub, content: clean(sub.content) })),
  }))
  return result
}
