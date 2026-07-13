/**
 * POST /api/docgen/suggest-answers
 * Body: { project_id }
 * Returns: { suggestions: { <question_template_id>: <answer> } }
 *
 * AI-extracts answers to the project's practice-area questions from its
 * parsed uploads. Failure is non-blocking — returns empty suggestions.
 */

import { withSecurity } from '../_lib/middleware.js'
import { suggestAnswers } from './_lib/service.js'
import { logError } from '../_lib/log.js'

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { project_id } = req.body ?? {}
  if (!project_id) return res.status(400).json({ message: 'project_id is required' })

  try {
    const suggestions = await suggestAnswers(project_id)
    return res.json({ suggestions })
  } catch (e) {
    logError('[docgen/suggest-answers] failed:', e.message)
    return res.json({ suggestions: {} })
  }
}

export default withSecurity(handler)
