// src/types/graph.ts

import type { HealthStatus } from './common'

// Mirrors backend/models/tables.py's Asset.category exactly (power | heating
// | water | waste | vehicle | instrument | storage | medical | comms |
// structure), plus 'custom' for a user-created asset with no fixed
// telemetry vocabulary (see CreateCustomNodeModal).
export type NodeType =
  | 'power'
  | 'heating'
  | 'water'
  | 'waste'
  | 'vehicle'
  | 'instrument'
  | 'storage'
  | 'medical'
  | 'comms'
  | 'structure'
  | 'custom'

export interface GraphNode {
  id: string
  label: string
  type: NodeType
  /** Asset.subtype from the backend, e.g. 'generator' | 'fuel_tank' |
   * 'freezer' | 'pistenbully' | 'aws' | 'magnetometer' — drives the icon and
   * per-subtype detail panel within a category. */
  subtype?: string
  health: HealthStatus
  healthScore: number // 0-100
  layer: string // asset category, used for the 2D twin's grouping/columns
  dependencyCount: number // size the node renders at (CustomNode)
  dependencies: string[] // IDs of assets this depends on
  dependents: string[] // IDs of assets that depend on this
  ipAddress?: string
  version?: string
  /** Spatial placement — station and zone, replacing the old IT-facility
   * region/building/floor/room breakdown. */
  stationId?: string
  zoneId?: string
  incidents: number
  lastSync: string // ISO timestamp
  metadata: Record<string, string | number | boolean>
  position?: { x: number; y: number }
  /** verified | documentary | unverified | simulated — every station fact
   * carries this and the UI renders it as a badge (see lib/constants.ts's
   * Provenance type). Only populated where the backend/mock data sets it. */
  provenance?: string
  // True when the backend reports status === 'simulating' for this asset.
  // Prevents synthetic device-agent fault injection from being graded as
  // genuine degradation in the health donut / at-risk / critical lists.
  isSimulating?: boolean
  // The active injected-fault type ('generator_fault' | 'freezer_warming' |
  // 'fuel_leak' | 'instrument_dropout' | 'pb_coolant_fault'), populated from
  // the WS reading.updated event's simulation_type field. Undefined when
  // not simulating.
  simulationType?: string
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: string // relationship label — backend-defined (DEPENDS_ON, USES, ...) or mock ('primary'/'secondary')
  latency?: number // ms, when known
  bandwidth?: number // Mbps
  health: HealthStatus
}

export interface LiveGraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  lastSync: string
}

export interface SimulationGraphData extends LiveGraphData {
  scenarioId: string
  modifications: {
    added: string[]
    modified: string[]
    removed: string[]
  }
}

export interface NodeFilters {
  layer?: string
  health?: HealthStatus[]
  type?: NodeType[]
  station?: string
  search?: string
}

/** Mirrors backend/models/tables.py's Zone model — the real physical
 * breakdown of each station (Bharati's 4 floors; Maitri's main building +
 * outdoor facility cluster), used to group the 2D twin into architecture-
 * accurate bands instead of one flat auto-layout (lib/graph/zoneLayout.ts). */
export interface ZoneMeta {
  id: string
  stationId: string
  parentId: string | null
  name: string
  /** floor | room | outdoor | module | route_point */
  kind: string
  floor: number | null
  restricted: boolean
}

export interface NodeInspectorData {
  node: GraphNode
  relatedEdges: GraphEdge[]
  recentIncidents: Array<{
    id: string
    severity: 'critical' | 'warning' | 'info'
    message: string
    timestamp: string
  }>
}
