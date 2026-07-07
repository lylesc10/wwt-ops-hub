/**
 * GET  /api/docgen/responses?project_id= — saved question responses
 * POST /api/docgen/responses               — replace all responses for a project
 *   Body: { project_id, answers: [{ question_template_id, answer }] }
 */

import { withSecurity } from '../_lib/middleware.js'
import { supa } from '../_lib/db.js'

async function handler(req, res) {
  if (req.method === 'GET') {
    const projectId = req.query?.project_id
    if (!projectId) return res.status(400).json({ message: 'project_id is required' })

    const { data, error } = await supa.from('docgen_question_responses')
      .select('id, question_template_id, answer').eq('project_id', projectId)
    if (error) return res.status(500).json({ message: error.message })
    return res.json(data ?? [])
  }

  if (req.method === 'POST') {
    const { project_id, answers } = req.body ?? {}
    if (!project_id) return res.status(400).json({ message: 'project_id is required' })
    if (!Array.isArray(answers)) return res.status(400).json({ message: 'answers must be an array' })

    // Replace-all semantics, matching field-services save_responses
    const { error: delError } = await supa.from('docgen_question_responses')
      .delete().eq('project_id', project_id)
    if (delError) return res.status(500).json({ message: delError.message })

    for (const a of answers) {
      if (!a?.question_template_id) continue
      const { error } = await supa.from('docgen_question_responses').insert({
        project_id,
        question_template_id: a.question_template_id,
        answer: JSON.stringify(a.answer ?? null),
      })
      if (error) return res.status(500).json({ message: error.message })
    }

    return res.status(201).json({ status: 'ok', count: answers.length })
  }

  return res.status(405).json({ message: 'Method not allowed' })
}

export default withSecurity(handler)
