// src/lib/graph/layout.ts
//
// Auto-layout via dagre, used by FlowCanvas's "Re-layout" button — for users
// who've dragged nodes around and want to reset to a clean hierarchical
// arrangement rather than the initial random/cached positions.

import dagre from 'dagre'
import type { Node, Edge } from '@xyflow/react'

export function layoutWithDagre(
  nodes: Node[],
  edges: Edge[],
  options: { direction?: 'TB' | 'LR'; nodeSize?: number; width?: number; height?: number; nodesep?: number; ranksep?: number } = {}
): Node[] {
  const { direction = 'TB', nodeSize = 90 } = options
  // width/height let callers with non-square rendered nodes (e.g. DiffGraphView's
  // ~150px-wide label boxes) give dagre their real footprint so it spaces them
  // apart correctly — passing only nodeSize forces a square, which understates
  // width for wide boxes and causes them to visually overlap once rendered.
  const width = options.width ?? nodeSize
  const height = options.height ?? nodeSize

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: options.nodesep ?? 60, ranksep: options.ranksep ?? 90 })

  for (const node of nodes) {
    g.setNode(node.id, { width, height })
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map((node) => {
    const pos = g.node(node.id)
    return {
      ...node,
      position: { x: pos.x - width / 2, y: pos.y - height / 2 },
    }
  })
}

// Arranges nodes evenly around a circle. Radius is computed from node count so
// the spacing stays reasonable at any fleet size.
export function layoutCircular(nodes: Node[], options: { nodeSize?: number } = {}): Node[] {
  const { nodeSize = 90 } = options
  const n = nodes.length
  if (n === 0) return nodes
  // Enough radius so nodes don't overlap — circumference ≥ n × nodeSize × 1.5
  const radius = Math.max(200, (n * nodeSize * 1.5) / (2 * Math.PI))
  const cx = radius
  const cy = radius
  return nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    return {
      ...node,
      position: {
        x: cx + radius * Math.cos(angle) - nodeSize / 2,
        y: cy + radius * Math.sin(angle) - nodeSize / 2,
      },
    }
  })
}
