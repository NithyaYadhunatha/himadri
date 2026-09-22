// src/app/api/chat/mcp/route.ts
//
// POST /api/chat/mcp — the HIMADRI Operations Agent chat (the floating
// MCPChatPanel widget, mounted globally — see DashboardLayout.tsx — plus the
// Simulation page's NL scenario builder, which calls the same endpoint with
// a scenario-focused system prompt). Runs
// an OpenAI tool-calling agent loop directly against the FastAPI backend's
// MCP server (mounted at POST/GET /mcp, Streamable HTTP transport — see
// src/lib/mcp/client.ts) with its curated station-operations tool set
// (list_stations, get_station, list_station_zones, get_station_summary,
// get_station_twin_graph, list_assets, get_asset, get_asset_readings,
// get_asset_dependencies, get_blast_radius, get_asset_alerts,
// get_asset_passport, list_alerts, list_alert_rules, list_reports,
// get_report, generate_report, list_scenario_presets, run_scenario,
// list_scenarios, get_scenario, compare_scenarios, get_risk_heatmap,
// diagnose_fault, list_inventory, get_logistics_endurance, list_vehicles,
// list_convoys, list_waste_records, list_advisories) so the model can query
// live station/asset state, run diagnostics, and reason about scenarios
// against the real backend instead of guessing from a thin client snapshot.
//
// Falls back to a context-only reply (no tools, via the shared Gemini/OpenAI
// lib/llm/provider.ts) when OPENAI_API_KEY isn't set or the MCP agent loop
// fails for any reason (e.g. the FastAPI backend is down) — the chat stays
// usable, just without live-data grounding, rather than hard-failing.
//
// Body: {
//   message: string
//   history?: { role: 'user' | 'ai'; text: string }[]
//   sessionId?: string  // accepted for backward compat, unused (was n8n's chat sessionId)
//   nodesSummary?: {
//     total: number; healthy: number; degraded: number
//     critical: number; offline: number; simulating?: number
//     types?: string[]; atRisk?: string[]; criticalLabels?: string[]
//   }
// }
// Returns: { reply: string }
//
// Auth: any ACTIVE member.

import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { callLLM } from '@/lib/llm/provider'
import { listMcpTools, callMcpTool } from '@/lib/mcp/client'

export const runtime = 'nodejs'

const ChatReplySchema = z.object({ reply: z.string() })
const REPLY_JSON_SCHEMA = z.toJSONSchema(ChatReplySchema)

// gpt-4o-mini: same model the Gemini→OpenAI fallback provider uses as its
// second option (src/lib/llm/provider.ts) — cheap/fast and supports tool
// calling reliably, which is the reason this route always uses OpenAI
// directly rather than the Gemini-primary shared provider.
const MODEL = 'gpt-4o-mini'
const TIMEOUT_MS = 20_000
// Hard cap on tool-call round trips. A live-data question typically resolves
// in 1-2 calls (e.g. get_fleet_summary, or get_node + get_blast_radius for a
// "what if X fails" question); a few extra rounds of headroom lets a
// multi-step question (look up a node, then its blast radius, then simulate
// it) still finish without letting a confused model loop indefinitely.
const MAX_TOOL_ROUNDS = 4

interface NodesSummary {
  total?: number
  healthy?: number
  degraded?: number
  critical?: number
  offline?: number
  simulating?: number
  types?: string[]
  atRisk?: string[]
  criticalLabels?: string[]
}

interface HistoryMessage {
  role: 'user' | 'ai'
  text: string
}

function buildFleetContext(s: NodesSummary): string {
  if (s.total === undefined) {
    return 'No live fleet data available from the client — use the MCP tools to look up real data before answering.'
  }
  const lines: string[] = [
    `Total nodes: ${s.total}`,
    `Healthy: ${s.healthy ?? 0}`,
    `Degraded (at risk): ${s.degraded ?? 0}`,
    `Critical/Offline: ${(s.critical ?? 0) + (s.offline ?? 0)}`,
  ]
  if (s.simulating) lines.push(`Simulating: ${s.simulating}`)
  if (s.types?.length) lines.push(`Node types present: ${s.types.join(', ')}`)
  if (s.atRisk?.length) lines.push(`At-risk nodes: ${s.atRisk.join(', ')}`)
  if (s.criticalLabels?.length) lines.push(`Critical/offline nodes: ${s.criticalLabels.join(', ')}`)
  return `Live fleet snapshot (client-side summary, may lag the tools below by a few seconds):\n${lines.join('\n')}`
}

/**
 * Primary path: OpenAI tool-calling agent loop against the FastAPI backend's
 * live MCP server. Throws on any failure (missing key, MCP unreachable,
 * model error) — the caller falls back to replyFromContextOnly.
 */
async function replyWithMcpAgent(
  message: string,
  history: HistoryMessage[],
  fleetContext: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')

  const client = new OpenAI({ apiKey, timeout: TIMEOUT_MS })
  const mcpTools = await listMcpTools()
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = mcpTools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }))

  const systemPrompt = `You are the HIMADRI Operations Agent, an AI assistant for Maitri and Bharati — India's two Antarctic research stations. You help station leaders, engineers, scientists, and HQ/NCPOR operators understand station asset health, risk, dependencies, alerts, logistics, and reports — and can run what-if survivability scenarios and guided fault diagnosis.

${fleetContext}

You have live tools connected to the real backend (Postgres + Neo4j) — use them whenever a question depends on current data (asset lists, health/alerts detail, dependencies, blast radius, risk heatmap, diagnosis, logistics/inventory, reports, scenarios) rather than guessing from the snapshot above, which is only a rough client-side summary. Prefer calling a tool over speculating whenever the answer could be wrong from the snapshot alone.

For any tool that takes an asset_id, you may pass the asset's plain name exactly as the user referred to it (e.g. "diesel generator 1") — it is resolved to the real backend id for you, so there is no need to call list_assets first just to look up an id. Always clarify which station (Maitri or Bharati) a question concerns if it's ambiguous and the answer would differ between them.

Answer concisely and technically, in plain conversational text (no markdown headers, no JSON). Reference specific asset names and real values from tool results when relevant. If asked something outside station operations entirely, answer briefly from general knowledge.`

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10).map((h) => ({
      role: h.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: h.text,
    })),
    { role: 'user', content: message },
  ]

  let finalContent: string | null | undefined
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      // Force a final answer once the round budget is spent, even if the
      // model would otherwise ask for another lookup.
      tool_choice: round === MAX_TOOL_ROUNDS ? 'none' : 'auto',
    })
    const msg = completion.choices[0]?.message
    if (msg?.refusal) throw new Error(`Model declined: ${msg.refusal}`)

    const toolCalls = msg?.tool_calls
    if (!toolCalls || toolCalls.length === 0) {
      finalContent = msg?.content
      break
    }

    messages.push({ role: 'assistant', content: msg.content, tool_calls: toolCalls })
    const results = await Promise.all(
      toolCalls.map(async (call) => {
        if (call.type !== 'function') {
          return { call, result: JSON.stringify({ error: 'Unsupported tool call type' }) }
        }
        try {
          const args = call.function.arguments ? JSON.parse(call.function.arguments) : {}
          const result = await callMcpTool(call.function.name, args)
          return { call, result }
        } catch (err) {
          return {
            call,
            result: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }
        }
      })
    )
    for (const { call, result } of results) {
      messages.push({ role: 'tool', tool_call_id: call.id, content: result })
    }
  }

  if (!finalContent) throw new Error('Model returned an empty response')
  return finalContent
}

/**
 * Fallback path: answers from the client-supplied fleet snapshot only, no
 * tools, via the shared Gemini→OpenAI provider. Used when OPENAI_API_KEY
 * isn't set or the MCP agent loop above fails for any reason, so the chat
 * degrades gracefully instead of hard-failing.
 */
async function replyFromContextOnly(
  message: string,
  history: HistoryMessage[],
  fleetContext: string,
): Promise<string> {
  const systemPrompt = `You are the HIMADRI Operations Agent for Maitri and Bharati, India's two Antarctic research stations. You help station personnel understand asset topology, health status, risks, dependencies, and relationships between station systems.

${fleetContext}

Answer questions concisely and technically. Reference specific assets from the station when relevant. If asked about something outside the provided context, answer from general station-operations best practices. Respond ONLY with the JSON object.`

  let userMessage = message
  if (history.length > 0) {
    const historyText = history
      .slice(-10)
      .map((h) => `${h.role === 'user' ? 'Human' : 'AI'}: ${h.text}`)
      .join('\n')
    userMessage = `Previous conversation:\n${historyText}\n\nCurrent question: ${message}`
  }

  const result = await callLLM({
    systemPrompt,
    userMessage,
    jsonSchema: REPLY_JSON_SCHEMA as Record<string, unknown>,
    schemaName: 'mcp_chat_reply',
  })
  const parsed = ChatReplySchema.parse(JSON.parse(result.text))
  return parsed.reply
}

export async function POST(req: Request) {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  let body: {
    message?: string
    history?: HistoryMessage[]
    sessionId?: string
    nodesSummary?: NodesSummary
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const message = body.message?.trim()
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'No LLM provider configured' }, { status: 500 })
  }

  const history = body.history ?? []
  const fleetContext = buildFleetContext(body.nodesSummary ?? {})

  if (process.env.OPENAI_API_KEY) {
    try {
      const reply = await replyWithMcpAgent(message, history, fleetContext)
      return NextResponse.json({ reply })
    } catch (err) {
      console.error(
        '[chat/mcp] MCP tool-calling agent failed, falling back to context-only reply:',
        err instanceof Error ? err.message : String(err)
      )
    }
  }

  try {
    const reply = await replyFromContextOnly(message, history, fleetContext)
    return NextResponse.json({ reply })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'LLM request failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
