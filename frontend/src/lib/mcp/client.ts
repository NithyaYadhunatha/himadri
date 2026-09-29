// src/lib/mcp/client.ts
//
// Thin MCP client wrapper around the FastAPI backend's own MCP server
// (InfraMind.py/backend/main.py — fastapi-mcp, mounted at POST/GET /mcp,
// Streamable HTTP transport, curated to 14 read/report/simulation tools —
// see that file's MCP_TOOL_OPERATIONS). Used by the Digital Twin chat's
// OpenAI tool-calling agent loop (src/app/api/chat/mcp/route.ts) so the
// model can query/simulate the live fleet directly against this repo's own
// Postgres/Neo4j data — no n8n, no external workflow service, everything
// stays on this machine's own stack.
//
// Same Bearer token every other server-side backend call already uses. The
// REST base ends in /api/v1, so MCP deliberately resolves from its origin and
// remains mounted at the backend-root /mcp endpoint.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://himadri.aus1in.me/api/v1'
const API_ORIGIN = new URL(API_BASE).origin
const API_TOKEN = process.env.API_TOKEN ?? process.env.NEXT_PUBLIC_API_TOKEN ?? ''
const TOOL_CALL_TIMEOUT_MS = 15_000

export interface McpTool {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, object>
    required?: string[]
  }
}

// Module-level singleton, reused across requests in the same server worker.
// Reset to null on any failure so the next call opens a fresh connection
// instead of permanently caching a dead one (e.g. the backend restarted).
let clientPromise: Promise<Client> | null = null

async function connect(): Promise<Client> {
  const client = new Client({ name: 'inframind-web', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(`${API_ORIGIN}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${API_TOKEN}` } },
  })
  await client.connect(transport)
  return client
}

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = connect().catch((err) => {
      clientPromise = null
      throw err
    })
  }
  return clientPromise
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await getClient()
  try {
    return await fn(client)
  } catch (err) {
    clientPromise = null
    throw err
  }
}

export async function listMcpTools(): Promise<McpTool[]> {
  const { tools } = await withClient((client) =>
    client.listTools(undefined, { timeout: TOOL_CALL_TIMEOUT_MS })
  )
  return tools as McpTool[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface NodeLite { id: string; name: string }

// Every node-scoped MCP tool (get_node, get_node_metrics, get_node_dependencies,
// get_blast_radius, get_node_alerts) takes a `node_id` path param that the
// backend resolves as a literal Postgres UUID primary key (see
// InfraMind.py/backend/models/tables.py's Node.id) — it is NOT the human
// node name. The LLM only ever sees names (from the fleet snapshot, from its
// own conversation, from list_nodes results it may not have called yet), so
// it very often calls e.g. get_node({ node_id: "nugenesis" }) — a name, not a
// UUID — which the backend can't find, the tool call errors, and the model
// then has to apologize instead of answering. Resolve that here rather than
// relying on prompting discipline: any non-UUID-shaped node_id is looked up
// against list_nodes by name before the real call is made.
let nodeListCache: { at: number; nodes: NodeLite[] } | null = null
const NODE_LIST_CACHE_TTL_MS = 30_000

async function fetchNodeList(): Promise<NodeLite[]> {
  if (nodeListCache && Date.now() - nodeListCache.at < NODE_LIST_CACHE_TTL_MS) {
    return nodeListCache.nodes
  }
  const result = await withClient((client) =>
    client.callTool({ name: 'list_nodes', arguments: {} }, undefined, { timeout: TOOL_CALL_TIMEOUT_MS })
  )
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>
  const text = content.filter((c) => c.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('\n')
  const nodes = (JSON.parse(text) as NodeLite[]).map((n) => ({ id: n.id, name: n.name }))
  nodeListCache = { at: Date.now(), nodes }
  return nodes
}

/** Best-effort name → id resolution: exact (case-insensitive) match first,
 *  then substring either direction, so "nugenesis" matches a node named
 *  "NuGenesis SDMS". Returns the original value if nothing matches — the
 *  underlying tool call then fails exactly as it did before this existed. */
async function resolveNodeId(raw: string): Promise<string> {
  if (UUID_RE.test(raw)) return raw
  try {
    const nodes = await fetchNodeList()
    const needle = raw.trim().toLowerCase()
    const exact = nodes.find((n) => n.name.toLowerCase() === needle)
    if (exact) return exact.id
    const partial = nodes.find(
      (n) => n.name.toLowerCase().includes(needle) || needle.includes(n.name.toLowerCase())
    )
    return partial?.id ?? raw
  } catch {
    return raw
  }
}

export async function callMcpTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  let resolvedArgs = args
  if (name !== 'list_nodes' && typeof args.node_id === 'string') {
    resolvedArgs = { ...args, node_id: await resolveNodeId(args.node_id) }
  }
  const result = await withClient((client) =>
    client.callTool({ name, arguments: resolvedArgs }, undefined, { timeout: TOOL_CALL_TIMEOUT_MS })
  )
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>
  const text = content
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('\n')
  return text || JSON.stringify(result)
}
