// src/components/graph/panels/types.ts
import type { GraphNode } from '@/types/graph'
import type { NodeHealth } from '@/types/nodes'

export interface NodeTypePanelProps {
  node: GraphNode
  detail: NodeHealth | null
  /** All nodes on the current graph — used for cross-node lookups (e.g. hosted VMs, dependent apps). */
  allNodes: GraphNode[]
  onJumpToNode?: (nodeId: string) => void
}
