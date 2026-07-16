/**
 * DocGen service — ported from field-services backend/app/docgen/service.py.
 *
 * Context loading, the single-call generation path, the 3-phase sectioned
 * pipeline (outline → parallel sections → assembly), answer suggestion, and
 * JSON response parsing. Engagements map to docgen_projects; BOM items are
 * extracted from parsed BOM uploads and matched against the global
 * docgen_hardware repo — matched entries with curated steps are injected
 * into the generated document by postProcessor.js.
 */

import { supa } from '../../_lib/db.js'
import { getAIProvider } from './ai.js'
import { logWarn, logError } from '../../_lib/log.js'
import {
  OUTLINE_SYSTEM_PROMPT, SECTION_SYSTEM_PROMPT, ASSEMBLY_SYSTEM_PROMPT,
  SUGGEST_ANSWERS_SYSTEM_PROMPT,
  getSystemPrompt, buildUserPrompt, buildOutlinePrompt, buildSectionPrompt,
  buildAssemblyPromptSectioned, buildSuggestPrompt,
} from './prompts.js'
import { injectProcedures, resolveUnusedPlaceholders } from './postProcessor.js'
import { listHardware } from './hardware.js'
import { matchBomItems } from './hardwareMatcher.js'

const MAX_UPLOAD_CHARS = 50_000 // Cap per-upload text to keep prompts under ~100K total
const MAX_BOM_ITEMS = 60

// ── Data access ───────────────────────────────────────────────────────────────

export async function getProject(projectId) {
  const { data } = await supa.from('docgen_projects').select('*').eq('id', projectId).single()
  return data
}

export async function listUploads(projectId) {
  const { data } = await supa.from('docgen_uploads').select('*')
    .eq('project_id', projectId).order('created_at')
  return data ?? []
}

export async function getQuestionAnswers(projectId) {
  const { data: responses } = await supa.from('docgen_question_responses')
    .select('*').eq('project_id', projectId)
  if (!responses?.length) return []

  const { data: templates } = await supa.from('docgen_question_templates').select('*')
  const byId = new Map((templates ?? []).map(t => [t.id, t]))
  return responses.map(r => ({
    question: byId.get(r.question_template_id)?.question_text ?? 'Unknown',
    answer: r.answer,
  }))
}

async function updateProgress(documentId, message) {
  await supa.from('documents').update({ generation_progress: message }).eq('id', documentId)
}

// ── Context helpers ───────────────────────────────────────────────────────────

function truncateParsedData(parsedList) {
  return parsedList.map(item => {
    const text = JSON.stringify(item)
    if (text.length > MAX_UPLOAD_CHARS) {
      return {
        filename: item.filename ?? 'unknown',
        summary: text.slice(0, MAX_UPLOAD_CHARS),
        _truncated: true,
        _original_chars: text.length,
      }
    }
    return item
  })
}

/**
 * Extract BOM line items from parsed BOM uploads (Excel/CSV rows). Column
 * matching is heuristic — field-services persisted these as
 * engagement_bom_items rows via an upload pipeline; here they're derived
 * directly from the parsed data.
 */
export function extractBomItems(uploads) {
  const items = []
  const bomUploads = uploads.filter(u => u.file_type === 'bom' && u.parsed_data)

  for (const upload of bomUploads) {
    const rowGroups = upload.parsed_data.sheets?.map(s => s.rows) ?? [upload.parsed_data.rows]
    for (const rows of rowGroups) {
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        if (items.length >= MAX_BOM_ITEMS) return items
        if (!row || typeof row !== 'object') continue
        const keys = Object.keys(row)
        const descKey = keys.find(k => /desc|item|product|model|name/i.test(k))
        const pnKey   = keys.find(k => /part\s*(no|num|#)|part.?number|\bpn\b|sku/i.test(k))
        const qtyKey  = keys.find(k => /qty|quant|count/i.test(k))
        const description = descKey ? String(row[descKey] ?? '').trim() : ''
        if (!description) continue
        items.push({
          description,
          part_number: pnKey ? String(row[pnKey] ?? '').trim() : '',
          quantity: qtyKey ? (Number(row[qtyKey]) || 1) : 1,
          matched_procedure: null, // filled in by hardware-repo matching (loadFullContext)
        })
      }
    }
  }
  return items
}

async function loadFullContext(projectId, onProgress) {
  const project = await getProject(projectId)
  if (!project) throw new Error('Project not found')

  await onProgress('Loading uploads and questionnaire responses...')
  const uploads = await listUploads(projectId)
  const parsedUploads = truncateParsedData(uploads.map(u => u.parsed_data).filter(Boolean))
  const questionAnswers = await getQuestionAnswers(projectId)

  const projectContext = {
    name: project.name,
    customer: project.customer,
    practice_area: project.practice_area,
    site_address: project.site_address,
    pm_name: project.pm_name,
  }

  // Match BOM items against the global hardware repo. Filling matched_procedure
  // makes the outline prompt advertise curated steps; matched entries with
  // steps become bomProcedures for deterministic injection in postProcess().
  let matched = extractBomItems(uploads).map(item => ({ ...item, match: null }))
  try {
    matched = matchBomItems(matched, await listHardware())
  } catch (err) {
    logWarn('[docgen/service] hardware matching failed — generating without curated steps', { error: err.message })
  }
  const bomItems = matched.map(({ match, ...item }) => ({
    ...item,
    matched_procedure: match ? match.hardware_description : null,
  }))
  const bomProcedures = matched
    .filter(m => m.match?.steps?.length)
    .map(m => ({
      description: m.description,
      part_number: m.part_number,
      matched_procedure_title: m.match.hardware_description,
      steps: m.match.steps,
    }))

  const sowUploads = uploads.filter(u => (u.file_type === 'sow' || u.file_type === 'scope') && u.parsed_data)
  const sowContext = sowUploads.map(u => JSON.stringify(u.parsed_data)).join('\n').slice(0, MAX_UPLOAD_CHARS)

  return { project, projectContext, uploads, parsedUploads, questionAnswers, bomItems, bomProcedures, sowContext }
}

// ── JSON response parsing ─────────────────────────────────────────────────────

export function parseJsonResponse(raw) {
  let text = String(raw ?? '').trim()
  if (!text) return null

  if (text.startsWith('```')) {
    text = text.split('\n').filter(ln => !ln.trim().startsWith('```')).join('\n').trim()
  }

  try {
    const result = JSON.parse(text)
    return result && typeof result === 'object' && !Array.isArray(result) ? result : null
  } catch (e) {
    logWarn('[docgen/service] AI returned invalid JSON:', e.message)
    return null
  }
}

// ── Context routing for sectioned generation ──────────────────────────────────

const CONTEXT_ROUTING = {
  'overview':          ['project_metadata', 'sow_context'],
  'resource':          ['project_metadata', 'question_answers'],
  'logistics':         ['project_metadata', 'question_answers'],
  'before you arrive': ['project_metadata', 'question_answers', 'consumables'],
  'work details':      ['project_metadata', 'question_answers'],
  'installation':      ['bom_items', 'sow_context', 'question_answers'],
  'validation':        ['bom_items', 'question_answers'],
  'check out':         ['project_metadata', 'question_answers'],
  'check in':          ['project_metadata', 'question_answers'],
  'reference':         ['bom_items', 'parsed_uploads'],
  'toolkit':           ['bom_items', 'consumables', 'question_answers'],
  'escalation':        ['project_metadata', 'question_answers'],
  'printable':         ['project_metadata', 'bom_items'],
}

function extractContextForSection(section, fullContext) {
  const headingLower = (section.heading ?? '').toLowerCase()

  const explicitKeys = section.relevant_context_keys ?? []
  if (explicitKeys.length) {
    return Object.fromEntries(
      explicitKeys.filter(k => fullContext[k]).map(k => [k, fullContext[k]])
    )
  }

  const matchedKeys = new Set()
  for (const [keyword, keys] of Object.entries(CONTEXT_ROUTING)) {
    if (headingLower.includes(keyword)) keys.forEach(k => matchedKeys.add(k))
  }
  if (!matchedKeys.size) { matchedKeys.add('project_metadata'); matchedKeys.add('bom_items') }

  return Object.fromEntries(
    [...matchedKeys].filter(k => fullContext[k]).map(k => [k, fullContext[k]])
  )
}

function buildOutlineSummary(outline) {
  const lines = [`Document: ${outline.title ?? 'Untitled'}`]
  ;(outline.sections ?? []).forEach((s, i) => {
    lines.push(`${i + 1}. ${s.heading ?? 'Untitled'} — ${s.description ?? ''}`)
  })
  return lines.join('\n')
}

function buildFullContext(ctx) {
  return {
    project_metadata: ctx.projectContext,
    bom_items: ctx.bomItems,
    question_answers: ctx.questionAnswers,
    sow_context: ctx.sowContext,
    parsed_uploads: ctx.parsedUploads,
    consumables: [],
    always_procedures: [],
  }
}

// ── Finalization ──────────────────────────────────────────────────────────────

async function saveResult(documentId, schemaData, startedAt) {
  await supa.from('documents').update({
    schema_data: schemaData,
    title: schemaData.title ?? undefined,
    status: 'draft',
    generation_progress: null,
    generation_time_seconds: Math.round((Date.now() - startedAt) / 100) / 10,
  }).eq('id', documentId)
}

async function saveFailure(documentId, docType, error, startedAt) {
  logError('[docgen/service] Generation failed:', error)
  await supa.from('documents').update({
    schema_data: { error: String(error.message ?? error), title: `${docType} - Generation Failed` },
    title: `${docType} - Generation Failed`,
    status: 'draft',
    generation_progress: null,
    generation_time_seconds: Math.round((Date.now() - startedAt) / 100) / 10,
  }).eq('id', documentId)
}

function postProcess(schemaData, bomProcedures = []) {
  // Inject curated hardware-repo steps into matched Installation subsections,
  // then clean up any placeholders the AI emitted with nothing to inject.
  const injected = injectProcedures(schemaData, [], bomProcedures)
  return resolveUnusedPlaceholders(injected)
}

// ── Single-call generation ────────────────────────────────────────────────────

export async function generateDocumentSingle(documentId, projectId, docType) {
  const startedAt = Date.now()
  const onProgress = (msg) => updateProgress(documentId, msg)

  try {
    await onProgress('Loading project context...')
    const ctx = await loadFullContext(projectId, onProgress)
    const provider = getAIProvider()

    await onProgress('Building prompt from uploads and questionnaire...')
    let userPrompt = buildUserPrompt(ctx.parsedUploads, ctx.questionAnswers, ctx.projectContext)
    if (ctx.bomItems.length) {
      const bomLines = ctx.bomItems.map(it =>
        `- ${it.description} (PN: ${it.part_number || 'n/a'}, Qty: ${it.quantity})` +
        (it.matched_procedure ? ' [curated install steps available]' : ''))
      userPrompt += `\n\n## BOM Items (${ctx.bomItems.length})\n${bomLines.join('\n')}\n` +
        'Create one Installation Procedures subsection per BOM item above.'
    }

    await onProgress('AI is writing the runbook — this takes a few minutes...')
    const raw = await provider.generate(getSystemPrompt(docType), userPrompt, 32000)

    await onProgress('Parsing AI response...')
    let schemaData = parseJsonResponse(raw)
    if (!schemaData) throw new Error('AI returned empty or invalid response')

    schemaData = postProcess(schemaData, ctx.bomProcedures)
    await onProgress(`Done — ${schemaData.sections?.length ?? 0} sections generated`)
    await saveResult(documentId, schemaData, startedAt)
  } catch (e) {
    await saveFailure(documentId, docType, e, startedAt)
  }
}

// ── Sectioned generation (3-phase pipeline) ───────────────────────────────────

export async function generateDocumentSectioned(documentId, projectId, docType, { aiAssembly = false } = {}) {
  const startedAt = Date.now()
  const onProgress = (msg) => updateProgress(documentId, msg)

  try {
    await onProgress('Loading project context...')
    const ctx = await loadFullContext(projectId, onProgress)
    const provider = getAIProvider()

    // Phase 1: outline
    await onProgress('Generating document outline...')
    const outlinePrompt = buildOutlinePrompt(
      ctx.projectContext, ctx.bomItems, ctx.questionAnswers, ctx.sowContext, ctx.parsedUploads,
    )
    const outlineRaw = await provider.generate(OUTLINE_SYSTEM_PROMPT, outlinePrompt, 8000)
    const outline = parseJsonResponse(outlineRaw)

    if (!outline?.sections?.length) {
      logWarn('[docgen/service] Outline generation failed — falling back to single-call')
      await onProgress('Outline failed — falling back to single-call generation...')
      return await generateDocumentSingle(documentId, projectId, docType)
    }

    const sectionCount = outline.sections.length
    await onProgress(`Outline ready — ${sectionCount} sections planned`)

    // Phase 2: sections in parallel
    const fullContext = buildFullContext(ctx)
    const outlineSummary = buildOutlineSummary(outline)

    const results = await Promise.allSettled(outline.sections.map(section => {
      const contextSubset = extractContextForSection(section, fullContext)
      const prompt = buildSectionPrompt(
        section.heading ?? '', section.description ?? '', contextSubset, outlineSummary,
      )
      return provider.generate(SECTION_SYSTEM_PROMPT, prompt, 12000)
    }))

    const generatedSections = []
    for (let i = 0; i < results.length; i++) {
      const sectionDef = outline.sections[i]
      const heading = sectionDef.heading ?? `Section ${i + 1}`
      const result = results[i]

      if (result.status === 'rejected') {
        logWarn(`[docgen/service] Section '${heading}' failed: ${result.reason} — retrying...`)
        await onProgress(`Retrying section ${i + 1} of ${sectionCount}: ${heading}...`)
        try {
          const contextSubset = extractContextForSection(sectionDef, fullContext)
          const retryPrompt = buildSectionPrompt(
            heading, sectionDef.description ?? '', contextSubset, outlineSummary,
          )
          const retryRaw = await provider.generate(SECTION_SYSTEM_PROMPT, retryPrompt, 12000)
          const sectionData = parseJsonResponse(retryRaw)
          if (sectionData) { generatedSections.push(sectionData); continue }
        } catch (retryErr) {
          logError(`[docgen/service] Section '${heading}' retry also failed:`, retryErr.message)
        }
        generatedSections.push({
          heading,
          content: `*Section generation failed. Please edit manually.*\n\nError: ${result.reason}`,
          subsections: [],
        })
      } else {
        await onProgress(`Generated section ${i + 1} of ${sectionCount}: ${heading}`)
        const sectionData = parseJsonResponse(result.value)
        generatedSections.push(sectionData ?? {
          heading,
          content: result.value || '*Empty section — please edit manually.*',
          subsections: [],
        })
      }
    }

    // Phase 3: assembly
    let schemaData
    if (aiAssembly) {
      await onProgress('Assembling final document (AI polish)...')
      const assemblyRaw = await provider.generate(
        ASSEMBLY_SYSTEM_PROMPT, buildAssemblyPromptSectioned(outline, generatedSections), 32000,
      )
      schemaData = parseJsonResponse(assemblyRaw)
      if (!schemaData) {
        logWarn('[docgen/service] AI assembly failed — stitching sections directly')
        schemaData = { title: outline.title ?? `${docType} Document`, sections: generatedSections }
      }
    } else {
      await onProgress('Assembling final document...')
      schemaData = { title: outline.title ?? `${docType} Document`, sections: generatedSections }
    }

    schemaData = postProcess(schemaData, ctx.bomProcedures)

    const totalSecs = Math.round((Date.now() - startedAt) / 1000)
    await onProgress(`Done — ${schemaData.sections?.length ?? 0} sections in ${totalSecs}s`)
    await saveResult(documentId, schemaData, startedAt)
  } catch (e) {
    await saveFailure(documentId, docType, e, startedAt)
  }
}

// ── Suggest answers ───────────────────────────────────────────────────────────

export async function suggestAnswers(projectId) {
  const project = await getProject(projectId)
  if (!project) return {}

  const uploads = await listUploads(projectId)
  const parsedUploads = truncateParsedData(uploads.map(u => u.parsed_data).filter(Boolean))
  if (!parsedUploads.length) return {}

  const { data: templates } = await supa.from('docgen_question_templates').select('*')
    .eq('practice_area', project.practice_area).order('display_order')
  if (!templates?.length) return {}

  const questions = templates.map(t => ({
    id: String(t.id),
    question_text: t.question_text,
    input_type: t.input_type,
    options: t.options ?? [],
  }))

  const provider = getAIProvider()
  const raw = await provider.generate(
    SUGGEST_ANSWERS_SYSTEM_PROMPT, buildSuggestPrompt(parsedUploads, questions), 8000,
  )
  return parseJsonResponse(raw) ?? {}
}
