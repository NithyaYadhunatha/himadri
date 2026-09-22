// src/lib/graph/blastRadius.ts
//
// BFS over an edge list returning every node transitively impacted when
// `originNodeId` fails, tagged with its shortest-path depth from the origin.
//
// Edge direction convention (see types/graph.ts + graphUtils.ts): `source → target`
// means "source depends on target". So when `target` goes down, every `source`
// that points at it — directly or through a chain — is impacted. The BFS walks
// the `dependents` adjacency (edges where the current frontier node is the
// `target`), which is exactly the shape `computeDependencyLists` already
// returns. Kept as its adjacency oracle rather than reimplementing the filter
// so the frontend has one — and only one — definition of what "depends on
// what" means; touching that rule in graphUtils.ts automatically retunes the
// blast-radius helper without a second edit.
//
// Mirrors the FastAPI Neo4j query in
// `InfraMind.py/backend/database/neo4j_client.py::_get_blast_radius_tx`
// (`MATCH (affected)-[*1..10]->(origin)` — origin excluded from the result,
// depths ordered ascending, capped at 10 hops by default so a pathologically
// deep dependency chain doesn't turn a per-simulation call into a graph walk
// of every reachable node). Same shape lets Phase 3's `/api/simulation/analyze`
// store the local result and the FastAPI-authoritative result in the same
// `SimulationRun.blastRadius` field without translation.

import { computeDependencyLists } from '@/lib/graphUtils'

interface EdgeLike {
  source: string
  target: string
}

export interface BlastRadiusEntry {
  nodeId: string
  depth: number
}

export interface BlastRadiusResult {
  originNodeId: string
  impacted: BlastRadiusEntry[]
}

export interface ComputeBlastRadiusOptions {
  /** Hop cap. Defaults to 10 for parity with the FastAPI `[*1..10]` query. */
  maxDepth?: number
  /**
   * Which adjacency to walk. 'dependents' (default) is the original blast-
   * radius direction — everything that would be IMPACTED if originNodeId
   * fails. 'dependencies' walks the opposite way — everything originNodeId
   * itself NEEDS, transitively (its full upstream dependency chain), for the
   * Digital Twin canvas's "highlight what this depends on" view. Same BFS
   * shape either way; only the adjacency function differs.
   */
  direction?: 'dependents' | 'dependencies'
}

export function computeBlastRadius<E extends EdgeLike>(
  originNodeId: string,
  edges: E[],
  options: ComputeBlastRadiusOptions = {},
): BlastRadiusResult {
  const maxDepth = options.maxDepth ?? 10
  const direction = options.direction ?? 'dependents'

  const impacted: BlastRadiusEntry[] = []
  const visited = new Set<string>([originNodeId])
  let frontier: string[] = [originNodeId]
  let depth = 0

  while (frontier.length > 0 && depth < maxDepth) {
    depth++
    const nextFrontier: string[] = []
    for (const nodeId of frontier) {
      const adjacent = computeDependencyLists(nodeId, edges)[direction]
      for (const dep of adjacent) {
        if (visited.has(dep)) continue
        visited.add(dep)
        impacted.push({ nodeId: dep, depth })
        nextFrontier.push(dep)
      }
    }
    frontier = nextFrontier
  }

  return { originNodeId, impacted }
}

/**
 * The reverse of computeBlastRadius: every node originNodeId transitively
 * depends on (its full upstream chain), not just direct 1-hop dependencies.
 * Used by the Digital Twin canvas to highlight "what this node needs"
 * alongside "what would break if it fails" (computeBlastRadius itself).
 */
export interface MultiBlastRadiusResult {
  originNodeIds: string[]
  impacted: BlastRadiusEntry[]
}

/**
 * Union BFS from multiple origin nodes. For each node reachable from any
 * origin, records the minimum depth across all origin paths. The origin nodes
 * themselves are excluded from the result (same invariant as the single-node
 * variant). Useful for multi-node simulation targets.
 */
export function computeMultiBlastRadius<E extends EdgeLike>(
  originNodeIds: string[],
  edges: E[],
  options: ComputeBlastRadiusOptions = {},
): MultiBlastRadiusResult {
  const originSet = new Set(originNodeIds)
  const minDepthById = new Map<string, number>()

  for (const originId of originNodeIds) {
    const result = computeBlastRadius(originId, edges, options)
    for (const entry of result.impacted) {
      if (originSet.has(entry.nodeId)) continue
      const existing = minDepthById.get(entry.nodeId)
      if (existing === undefined || entry.depth < existing) {
        minDepthById.set(entry.nodeId, entry.depth)
      }
    }
  }

  const impacted: BlastRadiusEntry[] = Array.from(minDepthById.entries())
    .map(([nodeId, depth]) => ({ nodeId, depth }))
    .sort((a, b) => a.depth - b.depth || a.nodeId.localeCompare(b.nodeId))

  return { originNodeIds, impacted }
}

export function computeDependencyChain<E extends EdgeLike>(
  originNodeId: string,
  edges: E[],
  options: Omit<ComputeBlastRadiusOptions, 'direction'> = {},
): BlastRadiusResult {
  return computeBlastRadius(originNodeId, edges, { ...options, direction: 'dependencies' })
}
