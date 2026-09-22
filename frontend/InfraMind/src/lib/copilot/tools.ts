// src/lib/copilot/tools.ts
//
// Tool definitions for the Scenario Builder AI Copilot (src/app/api/nl/route.ts).
// Modeled after an MCP tool server (name + description + JSON-schema args,
// each backed by a small, self-contained handler) but wired directly into
// OpenAI's native function-calling — no separate server/process, so there's
// no extra network hop and the loop stays fast.
//
// The copilot previously only saw a flattened {id,label,type,layer,healthScore}
// summary of the canvas up front — no dependency structure, no business
// criticality, no catalog of what node types/layers actually mean. That's
// why answers felt shallow. These tools let the model pull in exactly the
// context a given instruction needs instead of guessing from a thin summary.

import type OpenAI from 'openai'
import { computeBlastRadius } from '@/lib/graph/blastRadius'
import { NODE_TYPE_CATEGORIES } from '@/lib/graph/nodeTypes'
import type { GraphNode, GraphEdge } from '@/types/graph'

export interface ToolContext {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export const COPILOT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_node_types',
      description:
        "List every valid node type and topology layer this platform understands, grouped by category (e.g. Database, Network Device, Cloud). Call this before inventing a node's `type`/`layer` if you're not certain which of the enum values best fits what the instruction describes.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_node_details',
      description:
        'Get full detail for specific EXISTING nodes on the canvas by id: health status, dependency/incident counts, region, raw metadata, and — when tracked — business criticality (SLA tier, revenue-per-hour, business processes it supports). Call this before removing or heavily modifying a node so the edit reflects how important it actually is, not just its label.',
      parameters: {
        type: 'object',
        properties: {
          nodeIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Existing node ids from the canvas you were given.',
          },
        },
        required: ['nodeIds'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_blast_radius',
      description:
        "Compute which other nodes on the CURRENT canvas transitively depend on a given node — i.e. what would be affected if that node failed or was removed. Call this before removing a node, or before a migration that retires one, so you can decide whether dependents need a new edge to the replacement rather than being silently orphaned.",
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'Existing node id to compute impact for.' },
          maxDepth: { type: 'number', description: 'Hop cap. Defaults to 5.' },
        },
        required: ['nodeId'],
        additionalProperties: false,
      },
    },
  },
]

function listNodeTypes(): unknown {
  return NODE_TYPE_CATEGORIES.map((c) => ({ types: c.types, label: c.config.label }))
}

function getNodeDetails(nodeIds: string[], ctx: ToolContext): unknown {
  const byId = new Map(ctx.nodes.map((n) => [n.id, n]))
  const found = nodeIds.map((id) => byId.get(id)).filter((n): n is GraphNode => Boolean(n))

  return {
    nodes: found.map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      layer: n.layer,
      stationId: n.stationId ?? null,
      zoneId: n.zoneId ?? null,
      health: n.health,
      healthScore: n.healthScore,
      dependencyCount: n.dependencyCount,
      incidents: n.incidents,
      metadata: n.metadata,
      provenance: n.provenance ?? null,
    })),
    notFound: nodeIds.filter((id) => !byId.has(id)),
  }
}

function getBlastRadius(nodeId: string, maxDepth: number | undefined, ctx: ToolContext): unknown {
  if (!ctx.nodes.some((n) => n.id === nodeId)) {
    return { error: `Unknown node id: ${nodeId}` }
  }
  const labelById = new Map(ctx.nodes.map((n) => [n.id, n.label]))
  const result = computeBlastRadius(nodeId, ctx.edges, { maxDepth: maxDepth ?? 5 })
  return {
    originNodeId: result.originNodeId,
    impacted: result.impacted.map((e) => ({ nodeId: e.nodeId, label: labelById.get(e.nodeId) ?? e.nodeId, depth: e.depth })),
  }
}

export async function executeCopilotTool(name: string, argsJson: string, ctx: ToolContext): Promise<string> {
  let args: Record<string, unknown>
  try {
    args = argsJson ? JSON.parse(argsJson) : {}
  } catch {
    return JSON.stringify({ error: 'Invalid tool arguments JSON' })
  }

  switch (name) {
    case 'list_node_types':
      return JSON.stringify(listNodeTypes())
    case 'get_node_details': {
      const nodeIds = Array.isArray(args.nodeIds) ? (args.nodeIds as string[]) : []
      return JSON.stringify(await getNodeDetails(nodeIds, ctx))
    }
    case 'get_blast_radius': {
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId : ''
      const maxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : undefined
      return JSON.stringify(getBlastRadius(nodeId, maxDepth, ctx))
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}
