/**
 * AI provider for docgen — ported from field-services backend/app/docgen/ai/.
 *
 * field-services has a multi-provider abstraction (Anthropic + Azure OpenAI)
 * configured from an app_settings table; here the provider is Anthropic via
 * the official SDK, configured from env:
 *   ANTHROPIC_API_KEY     — required
 *   ANTHROPIC_MODEL       — optional, defaults to claude-opus-4-8
 *   ANTHROPIC_MAX_TOKENS  — optional, defaults to 16384
 */

import Anthropic from '@anthropic-ai/sdk'

const DEFAULT_MODEL = 'claude-opus-4-8'
const DEFAULT_MAX_TOKENS = 16384

let _client = null
function client() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }
  if (!_client) _client = new Anthropic()
  return _client
}

export function getAIProvider() {
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL
  const defaultMaxTokens = Number(process.env.ANTHROPIC_MAX_TOKENS) || DEFAULT_MAX_TOKENS

  async function generate(systemPrompt, userPrompt, maxTokens = null) {
    const response = await client().messages.create({
      model,
      max_tokens: maxTokens ?? defaultMaxTokens,
      thinking: { type: 'adaptive' },
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    if (response.stop_reason === 'refusal') {
      throw new Error('AI declined the request (safety refusal). Adjust the source materials and retry.')
    }

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
    if (!text) throw new Error('AI returned an empty response')
    return text
  }

  // Same call — parallel section generation uses Promise.allSettled upstream.
  return { model, generate, asyncGenerate: generate }
}
