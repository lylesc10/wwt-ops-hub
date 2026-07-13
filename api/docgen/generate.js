/**
 * POST /api/docgen/generate
 * Body: { project_id, doc_type = 'Deployment Guide', strategy = 'sectioned', ai_assembly = false }
 *
 * Creates a placeholder document with status='generating' and runs the
 * generation pipeline, mirroring field-services' background-thread +
 * polling pattern: the client polls GET /api/docgen/documents/[id] for
 * generation_progress until status leaves 'generating'.
 *
 * Locally (Express host / vercel dev) the pipeline runs fire-and-forget and
 * this responds immediately with the placeholder. On Vercel the function
 * would be frozen after responding, so the pipeline is awaited there —
 * progress writes still land in the DB for the poller.
 */

import { withSecurity } from '../_lib/middleware.js'
import { supa } from '../_lib/db.js'
import { generateDocumentSectioned, generateDocumentSingle, getProject } from './_lib/service.js'
import { logError } from '../_lib/log.js'

function normalizeDocType(raw) {
  return String(raw ?? 'Deployment Guide')
    .replace(/_/g, ' ').trim()
    .replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase())
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ message: 'ANTHROPIC_API_KEY is not configured' })
  }

  const { project_id, doc_type = 'Deployment Guide', strategy = 'sectioned', ai_assembly = false } = req.body ?? {}
  if (!project_id) return res.status(400).json({ message: 'project_id is required' })

  const project = await getProject(project_id)
  if (!project) return res.status(404).json({ message: 'Project not found' })

  const docType = normalizeDocType(doc_type)

  // Prevent duplicate in-flight generation for the same project + doc type
  const { data: existing } = await supa.from('documents').select('*')
    .eq('project_id', project_id).eq('doc_type', docType).eq('status', 'generating').single()
  if (existing) return res.status(201).json(existing)

  const { data: doc, error } = await supa.from('documents').insert({
    project_id,
    title: `${docType} — ${project.name}`,
    doc_type: docType,
    schema_data: {},
    status: 'generating',
    generation_progress: 'Starting generation...',
  }).select().single()
  if (error) return res.status(500).json({ message: error.message })

  const run = strategy === 'single'
    ? () => generateDocumentSingle(doc.id, project_id, docType)
    : () => generateDocumentSectioned(doc.id, project_id, docType, { aiAssembly: !!ai_assembly })

  if (process.env.VERCEL) {
    // Serverless: respond only after the pipeline finishes (progress is still
    // written to the DB along the way for pollers).
    res.status(201).json(doc)
    await run()
    return
  }

  // Long-lived host: fire and forget, respond immediately.
  run().catch(e => logError('[docgen/generate] background generation error:', e))
  return res.status(201).json(doc)
}

export default withSecurity(handler)
