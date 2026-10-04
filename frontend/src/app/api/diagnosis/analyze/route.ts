// POST /api/diagnosis/analyze
//
// AI second opinion for the Guided Diagnosis page. The client sends the asset,
// the evidence an engineer ticked and the rule-engine's ranked causes; this
// route asks the configured LLM (Gemini → OpenAI, see lib/llm/provider.ts) for
// a short structured analysis grounded ONLY in that input. With no provider
// key configured — or on any LLM error — it falls back to a deterministic
// rule-based write-up, so the panel always returns something useful and says
// which analyst produced it.
import { NextResponse } from 'next/server'
import { requireMembership } from '@/lib/apiProxy'
import { callLLM } from '@/lib/llm/provider'
import { offlineAnalysis, type DiagCategory, type RankedCause } from '@/lib/diagnosis/knowledge'

export const runtime = 'nodejs'

interface Body {
  category: DiagCategory
  assetName?: string | null
  station?: string
  evidence?: string[]
  causes?: RankedCause[]
}

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '2-3 sentence plain-language assessment' },
    rootCause: { type: 'string', description: 'the single most probable root cause' },
    immediateActions: { type: 'array', items: { type: 'string' }, description: '3-4 concrete next steps, in order' },
    riskIfIgnored: { type: 'string', description: 'one sentence on what happens if this is left alone' },
  },
  required: ['summary', 'rootCause', 'immediateActions', 'riskIfIgnored'],
  additionalProperties: false,
}

const SYSTEM = `You are the diagnostics analyst for HIMADRI, a digital-twin platform for India's Antarctic research stations (Maitri and Bharati).
You are given a ranked list of probable causes produced by a curated rule engine, plus the observations an engineer ticked.
Reason ONLY from that input and general engineering knowledge of cold-climate station equipment. Do not invent sensor readings, part numbers or events.
Be concise, practical and specific. If the ranking is close, say which two causes to rule out first. Answer with JSON matching the schema.`

export async function POST(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body?.category) return NextResponse.json({ error: 'category is required' }, { status: 400 })

  const causes = (body.causes ?? []).slice(0, 5)
  const evidence = (body.evidence ?? []).slice(0, 12)
  const fallback = offlineAnalysis({ category: body.category, assetName: body.assetName ?? null, evidence, causes })

  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ...fallback, configured: false })
  }

  const userMessage = JSON.stringify({
    station: body.station ?? null,
    asset: body.assetName ?? null,
    category: body.category,
    observations: evidence,
    rankedCauses: causes.map((c) => ({
      cause: c.cause,
      probabilityPct: c.score_pct,
      matchedEvidence: c.matched_evidence,
      checkSequence: c.check_sequence,
      typicalFixTime: c.eta,
    })),
  })

  try {
    const result = await callLLM({
      systemPrompt: SYSTEM,
      userMessage,
      jsonSchema: SCHEMA,
      schemaName: 'diagnosis_analysis',
      timeoutMs: 20_000,
    })
    const parsed = JSON.parse(result.text) as typeof fallback
    return NextResponse.json({
      summary: parsed.summary ?? fallback.summary,
      rootCause: parsed.rootCause ?? fallback.rootCause,
      immediateActions: Array.isArray(parsed.immediateActions) && parsed.immediateActions.length ? parsed.immediateActions : fallback.immediateActions,
      riskIfIgnored: parsed.riskIfIgnored ?? fallback.riskIfIgnored,
      provider: result.provider === 'gemini' ? 'Gemini' : 'OpenAI',
      configured: true,
    })
  } catch (err) {
    console.error('[diagnosis/analyze] LLM failed, using offline analyst:', err instanceof Error ? err.message : err)
    return NextResponse.json({ ...fallback, configured: true, degraded: true })
  }
}
