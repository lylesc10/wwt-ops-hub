/**
 * GET /api/docgen/questions?practice_area= — question templates for a practice area
 */

import { withSecurity } from '../_lib/middleware.js'
import { supa } from '../_lib/db.js'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })

  const practiceArea = req.query?.practice_area
  if (!practiceArea) return res.status(400).json({ message: 'practice_area is required' })

  const { data, error } = await supa.from('docgen_question_templates').select('*')
    .eq('practice_area', practiceArea).order('display_order')
  if (error) return res.status(500).json({ message: error.message })

  return res.json((data ?? []).map(t => ({
    id: String(t.id),
    practice_area: t.practice_area,
    question_text: t.question_text,
    input_type: t.input_type,
    options: t.options ?? [],
    display_order: t.display_order,
    required: t.required,
  })))
}

export default withSecurity(handler)
