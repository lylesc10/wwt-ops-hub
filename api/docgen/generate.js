import { withSecurity } from '../_lib/middleware.js'

const SYSTEM_PROMPT = `You are a technical documentation specialist for WWT field services operations.
Generate a professional deployment guide document based on the provided project information.

Return ONLY valid JSON — no markdown fences, no explanation — matching this schema exactly:
{
  "title": "string",
  "sections": [
    {
      "heading": "string",
      "content": "string",
      "subsections": [
        { "heading": "string", "content": "string" }
      ]
    }
  ]
}

Include these sections where relevant to the project type:
1. Project Overview
2. Scope of Work
3. Site Information
4. Pre-Deployment Checklist
5. Deployment Procedure
6. Equipment & Materials
7. Safety Requirements
8. Escalation & Support Contacts
9. Post-Deployment Verification
10. Sign-Off & Completion

Use markdown in content strings:
- Bullet items: "- item"
- Numbered steps: "1. step"
- Bold text: "**text**"
- Checkboxes: "- [ ] item" or "- [x] item"

Be specific, actionable, and professional — not placeholder text.`

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { answers = {}, doc_type = 'Deployment Guide' } = req.body ?? {}

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ message: 'ANTHROPIC_API_KEY is not configured' })
  }

  const answerLines = Object.entries(answers)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n')

  if (!answerLines.trim()) {
    return res.status(400).json({ message: 'No answers provided' })
  }

  const userPrompt = `Generate a ${doc_type} for the following WWT field services project:\n\n${answerLines}\n\nReturn only the JSON document schema.`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!r.ok) {
      const errBody = await r.json().catch(() => ({}))
      return res.status(500).json({ message: `AI API error: ${errBody.error?.message ?? r.statusText}` })
    }

    const aiResp = await r.json()
    const rawText = aiResp.content?.[0]?.text ?? ''

    let schema_data
    try {
      const cleaned = rawText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```\s*$/m, '').trim()
      schema_data = JSON.parse(cleaned)
    } catch {
      console.error('[docgen/generate] JSON parse failed. Raw output:', rawText.slice(0, 500))
      return res.status(500).json({ message: 'AI returned malformed JSON. Please try again.' })
    }

    // Normalize structure
    if (!schema_data.title) schema_data.title = doc_type
    schema_data.sections = (schema_data.sections ?? []).map(s => ({
      heading: String(s.heading ?? ''),
      content: String(s.content ?? ''),
      subsections: (s.subsections ?? []).map(sub => ({
        heading: String(sub.heading ?? ''),
        content: String(sub.content ?? ''),
      })),
    }))

    return res.json({ schema_data })
  } catch (err) {
    console.error('[docgen/generate] Unhandled error:', err)
    return res.status(500).json({ message: err.message ?? 'Generation failed' })
  }
}

export default withSecurity(handler)
