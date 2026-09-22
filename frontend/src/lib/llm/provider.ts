// src/lib/llm/provider.ts
// Unified LLM call: Gemini primary (interactions API), OpenAI fallback on any
// error or timeout. Both paths return structured JSON guided by a caller-supplied
// JSON Schema. Server-side only — API keys never reach the browser.

import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'

const GEMINI_MODEL = 'gemini-3.7-flash'
const OPENAI_MODEL = 'gpt-4o-mini'
const DEFAULT_TIMEOUT_MS = 20_000

export interface LLMRequest {
  systemPrompt: string
  userMessage: string
  // Full JSON Schema object for the expected response structure.
  jsonSchema: Record<string, unknown>
  // Identifier passed to OpenAI's json_schema response format (a-z, A-Z, 0-9, _, -, max 64).
  schemaName: string
  timeoutMs?: number
}

export interface LLMResult {
  text: string
  provider: 'gemini' | 'openai'
}

async function callGemini(req: LLMRequest): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')
  const ai = new GoogleGenAI({ apiKey })
  const timeout = req.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const interaction = await ai.interactions.create(
    {
      model: GEMINI_MODEL,
      system_instruction: req.systemPrompt,
      input: req.userMessage,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: req.jsonSchema,
      },
    },
    { timeout }
  )
  if (interaction.status !== 'completed') {
    const detail = interaction.errors
      ?.map((e) => (e as { message?: string }).message)
      .filter(Boolean)
      .join('; ')
    throw new Error(
      `Gemini status: ${interaction.status}${detail ? ` — ${detail}` : ''}`
    )
  }
  if (!interaction.output_text) throw new Error('Gemini returned empty output_text')
  return interaction.output_text
}

async function callOpenAI(req: LLMRequest): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')
  const timeout = req.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const client = new OpenAI({ apiKey, timeout })
  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: req.systemPrompt },
      { role: 'user', content: req.userMessage },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: req.schemaName,
        schema: req.jsonSchema,
        // strict: false — the zod-derived schema uses $schema / $defs which
        // OpenAI's strict mode rejects; loose mode still guides the output.
        strict: false,
      },
    },
  })
  const text = completion.choices[0]?.message.content
  if (!text) throw new Error('OpenAI returned empty content')
  return text
}

/**
 * Call the LLM with automatic Gemini→OpenAI fallback.
 *
 * Gemini is tried first when GEMINI_API_KEY is present. Any error (network,
 * quota, non-completed status) is caught and logged, then OpenAI is tried.
 * If both fail the error from the second attempt propagates to the caller.
 *
 * Throws if neither key is configured.
 */
export async function callLLM(req: LLMRequest): Promise<LLMResult> {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY)
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY)
  if (!hasGemini && !hasOpenAI) {
    throw new Error(
      'No LLM provider configured — set GEMINI_API_KEY and/or OPENAI_API_KEY in .env.local'
    )
  }

  if (hasGemini) {
    try {
      const text = await callGemini(req)
      return { text, provider: 'gemini' }
    } catch (err) {
      console.error(
        '[llm/provider] Gemini failed, falling back to OpenAI:',
        err instanceof Error ? err.message : String(err)
      )
    }
  }

  const text = await callOpenAI(req)
  return { text, provider: 'openai' }
}
