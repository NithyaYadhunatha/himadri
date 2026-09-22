// src/app/api/custom-nodes/analyze-prd/route.ts
//
// Backs the Station Twin's "Create Custom Asset" modal: takes an uploaded PRD
// file (.txt/.md/.json/.docx/.pdf) plus the asset name the user typed,
// extracts its text server-side, asks an LLM for a short structured
// summary, and returns it — the caller shows the summary as a one-time
// receipt (there is no backend field to persist it onto the asset; the old
// NodeBusinessMeta.description this used to write to was removed along with
// revenue/SLA business metadata, see lib/backendAdapters.ts's header
// comment) once the real asset has been created via POST /api/assets. This
// route only ever reads/analyzes text; it never creates or modifies an
// asset itself.
//
// Calls OpenAI directly rather than Groq's OpenAI-SDK-compatible endpoint.
// The Groq variant required a separate GROQ_API_KEY that was never
// provisioned in this environment, which is what produced the 500 on every
// call — OPENAI_API_KEY is already configured and used elsewhere.
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import { getCurrentMembership } from '@/lib/auth/rbac'

export const runtime = 'nodejs'

const MODEL = 'gpt-4.1-mini'
const TIMEOUT_MS = 30_000
const MAX_RETRIES = 1
const OVERALL_BUDGET_MS = 40_000

// Generous but bounded — keeps token usage/cost predictable regardless of
// how large a document gets dropped in; a PRD summary doesn't need every
// page verbatim to produce a useful extraction.
const MAX_PRD_CHARS = 20_000
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

const PLAIN_TEXT_EXTENSIONS = new Set(['txt', 'md', 'json'])

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase()
}

/** Extracts plain text from an uploaded PRD file based on its extension. */
async function extractText(file: File): Promise<string> {
  const ext = extensionOf(file.name)

  if (PLAIN_TEXT_EXTENSIONS.has(ext)) {
    return file.text()
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  if (ext === 'pdf') {
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return result.text
    } finally {
      await parser.destroy()
    }
  }

  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  throw new Error(`Unsupported file type ".${ext || '?'}" — use .txt, .md, .json, .docx, or .pdf`)
}

const PrdAnalysisSchema = z.object({
  category: z.string().describe('A short (2-4 word) category label for what kind of system/asset this PRD describes, e.g. "IoT Sensor Gateway", "Custom ETL Service".'),
  summary: z.string().describe('A concise 2-3 sentence plain-English summary of what this node/system does, based only on the PRD text given.'),
  keyRequirements: z.array(z.string()).max(5).describe('Up to 5 short bullet-point key requirements or capabilities stated in the PRD.'),
})

export async function POST(req: Request) {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 })
  }

  const form = await req.formData().catch(() => null)
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart/form-data with a "file" field' }, { status: 400 })
  }

  const nodeName = typeof form.get('nodeName') === 'string' ? (form.get('nodeName') as string).trim() : ''
  const file = form.get('file')

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'A PRD file is required' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File is too large (10 MB max)' }, { status: 400 })
  }

  let prdText: string
  try {
    prdText = (await extractText(file)).trim()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read the uploaded file'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (!prdText) {
    return NextResponse.json({ error: 'No readable text found in the uploaded file' }, { status: 400 })
  }

  const truncated = prdText.slice(0, MAX_PRD_CHARS)
  const client = new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES })
  const overallDeadline = AbortSignal.timeout(OVERALL_BUDGET_MS)

  try {
    const completion = await client.chat.completions.create(
      {
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You analyze product requirement documents (PRDs) for infrastructure/system nodes being added to an infrastructure digital twin. Extract only what the given text actually supports — do not invent capabilities or numbers the document does not state.',
          },
          {
            role: 'user',
            content: `Node name: ${nodeName || '(not provided)'}\n\nPRD text:\n${truncated}`,
          },
        ],
        response_format: zodResponseFormat(PrdAnalysisSchema, 'prd_analysis'),
      },
      { signal: overallDeadline },
    )

    const message = completion.choices[0]?.message
    if (message?.refusal) {
      return NextResponse.json({ error: `Analysis declined: ${message.refusal}` }, { status: 502 })
    }
    if (!message?.content) {
      return NextResponse.json({ error: 'The model returned an empty response' }, { status: 502 })
    }

    const parsed = PrdAnalysisSchema.parse(JSON.parse(message.content))
    return NextResponse.json(parsed)
  } catch (err) {
    const isTimeout =
      overallDeadline.aborted ||
      (err instanceof Error && (err.name === 'AbortError' || /timed? ?out/i.test(err.message)))
    if (isTimeout) {
      return NextResponse.json({ error: 'PRD analysis took too long — try a shorter document' }, { status: 504 })
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `PRD analysis failed: ${message}` }, { status: 502 })
  }
}
