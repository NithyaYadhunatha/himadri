// src/lib/backendAdapters.ts
//
// Shape definitions and mapping helpers for HIMADRI's actual FastAPI backend
// (see backend/schemas/schemas.py) and functions that adapt its responses
// into this frontend's GraphNode/GraphEdge/NodeHealth types.
//
// What the backend genuinely has (real, non-mock): stations/zones, the asset
// twin graph, readings, alerts, commands, scenarios, risk heatmap,
// diagnosis, logistics/inventory, reports, audit, and the predictive-
// maintenance model. Everything that doesn't map to a real HIMADRI feature
// (CAB-style change review, revenue/SLA business metadata, shadow-run
// divergence) was intentionally dropped rather than re-skinned — see
// src/services/*.service.ts for what's live vs mock today.

import type { GraphNode, GraphEdge, NodeType, ZoneMeta } from '@/types/graph'
import type { HealthStatus } from '@/types/common'
import { computeDependencyLists } from '@/lib/graphUtils'

// ─── Raw backend response shapes ───────────────────────────────────────────

export interface BackendAssetListItem {
  id: string
  name: string
  station_id: string
  zone_id: string | null
  category: string
  subtype: string | null
  status: string
  health_score: number
  risk_score: number
  primary_value: number | null
  primary_unit: string | null
  provenance: string
  last_seen: string | null
}

export interface BackendReadingRecord {
  id: string
  asset_id: string
  values: Record<string, number>
  units: Record<string, string> | null
  source: 'sensor' | 'manual' | 'simulated'
  entered_by: string | null
  simulation_active: boolean
  simulation_type: string | null
  collected_at: string
}

export interface BackendAlertDetail {
  id: string
  rule_id: string | null
  station_id: string
  asset_id: string
  series_key: string | null
  severity: 'info' | 'warning' | 'critical' | 'emergency'
  category: string
  message: string
  value: number | null
  first_seen: string
  last_seen: string
  occurrences: number
  state: 'open' | 'acked' | 'resolved' | 'suppressed'
  acked_by: string | null
  acked_at: string | null
  ack_note: string | null
  escalated_at: string | null
}

export interface BackendTwinSummary {
  station_id: string
  total_assets: number
  ok_assets: number
  degraded_assets: number
  fault_or_offline_assets: number
  avg_health_score: number
  open_alerts: number
  critical_alerts: number
}

export interface BackendGraphAssetNode {
  asset_id: string
  name: string
  category: string
  station_id: string
  status: string
  health_score: number
  /** Optional/nullable — older synced graph nodes may not carry it yet (see
   * neo4j_client.py's _get_full_graph_tx). Powers the 2D twin's
   * zone/floor-banded layout (lib/graph/zoneLayout.ts) when present. */
  zone_id?: string | null
}

export interface BackendGraphEdge {
  source: string
  target: string
  relationship: string
}

export interface BackendFullGraph {
  nodes: BackendGraphAssetNode[]
  edges: BackendGraphEdge[]
}

/** GET /stations/{id}/zones — backend/schemas/schemas.py's ZoneDetail. */
export interface BackendZoneDetail {
  id: string
  station_id: string
  parent_id: string | null
  name: string
  kind: string
  floor: number | null
  restricted: boolean
  layout: Record<string, unknown> | null
  provenance: string
}

export function adaptZones(raw: BackendZoneDetail[]): ZoneMeta[] {
  return raw.map((z) => ({
    id: z.id,
    stationId: z.station_id,
    parentId: z.parent_id,
    name: z.name,
    kind: z.kind,
    floor: z.floor,
    restricted: z.restricted,
  }))
}

// ─── Classification helpers ─────────────────────────────────────────────────

/**
 * Backend `category` strings map 1:1 onto the frontend NodeType union — both
 * sides share the same 10-category Antarctic-asset taxonomy (see
 * backend/models/tables.py's ASSET_CATEGORIES and lib/constants.ts's
 * ASSET_CATEGORIES). Anything unrecognised (e.g. a category typo, or a
 * legacy value from before a manifest was corrected) falls back to 'custom'
 * rather than crashing the twin render.
 */
const ALL_ASSET_CATEGORIES: readonly NodeType[] = [
  'power', 'heating', 'water', 'waste', 'vehicle', 'instrument',
  'storage', 'medical', 'comms', 'structure', 'custom',
]

export function mapNodeType(backendCategory: string): NodeType {
  if ((ALL_ASSET_CATEGORIES as readonly string[]).includes(backendCategory)) {
    return backendCategory as NodeType
  }
  return 'custom'
}

/** The 2D twin groups/columns by asset category directly — no separate
 * "layer" taxonomy needed once the domain is a physical station rather than
 * an application/data/network/infrastructure IT stack. */
export function mapLayer(backendCategory: string): string {
  return mapNodeType(backendCategory)
}

/**
 * Backend tracks operational `status` (ok/degraded/fault/offline/
 * maintenance/simulating) and a continuous `health_score`. The frontend's
 * HealthStatus is purely health-score-based (matching the health donut /
 * asset coloring thresholds used throughout the UI), except offline assets
 * are always 'unreachable'.
 *
 * Simulating assets are classified from their real health_score — an
 * injected fault should read 'critical', not 'healthy'. Callers that render
 * aggregate counts (donut, at-risk list) must exclude simulating assets from
 * their buckets separately (check isSimulating on GraphNode); this function
 * only classifies, it does not filter.
 */
export function classifyHealth(status: string, healthScore: number): HealthStatus {
  if (status === 'offline' || healthScore <= 0) return 'unreachable'
  if (healthScore >= 80) return 'healthy'
  if (healthScore >= 50) return 'degraded'
  return 'critical'
}

// ─── Graph adapter ───────────────────────────────────────────────────────────

export function adaptFullGraph(raw: BackendFullGraph): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const edges: GraphEdge[] = raw.edges.map((e) => {
    const targetNode = raw.nodes.find((n) => n.asset_id === e.target)
    const edgeHealth: HealthStatus = targetNode
      ? classifyHealth(targetNode.status, targetNode.health_score)
      : 'healthy'
    return {
      id: `${e.source}__${e.relationship}__${e.target}`,
      source: e.source,
      target: e.target,
      type: e.relationship,
      health: edgeHealth,
      // Backend doesn't track per-edge latency/bandwidth (not a meaningful
      // concept for a physical dependency like "heater DEPENDS_ON
      // generator") — left undefined rather than fabricated.
    }
  })

  const nodes: GraphNode[] = raw.nodes.map((n) => {
    const { dependencies, dependents } = computeDependencyLists(n.asset_id, raw.edges)
    return {
      id: n.asset_id,
      label: n.name,
      type: mapNodeType(n.category),
      health: classifyHealth(n.status, n.health_score),
      healthScore: n.health_score,
      isSimulating: n.status === 'simulating',
      layer: mapLayer(n.category),
      dependencyCount: dependencies.length,
      dependencies,
      dependents,
      incidents: 0, // not available without an N+1 alert-count fetch per asset
      lastSync: new Date().toISOString(),
      metadata: {},
      stationId: n.station_id,
      zoneId: n.zone_id ?? undefined,
    }
  })

  return { nodes, edges }
}

// ─── Reading helpers ─────────────────────────────────────────────────────────

/** The single numeric value the asset card/twin tile should display "right
 * now" — the asset's declared primary series if present in this reading,
 * else the first key in the values dict (readings are heterogeneous across
 * asset categories, so there is no fixed "the" field like cpu_percent). */
export function primaryValueFromReading(
  reading: BackendReadingRecord | undefined,
  primarySeries: string | null,
): { value: number | null; unit: string | null } {
  if (!reading) return { value: null, unit: null }
  const key = primarySeries && primarySeries in reading.values ? primarySeries : Object.keys(reading.values)[0]
  if (!key) return { value: null, unit: null }
  return { value: reading.values[key] ?? null, unit: reading.units?.[key] ?? null }
}
