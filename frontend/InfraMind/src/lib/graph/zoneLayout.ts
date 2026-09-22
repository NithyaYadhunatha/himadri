// src/lib/graph/zoneLayout.ts
//
// Positions the 2D Station Twin's nodes into bands/clusters that mirror each
// station's real physical architecture, instead of one flat dagre
// auto-layout (lib/graph/layout.ts) with no spatial organization — see
// backend/models/tables.py's Zone model and
// backend/scripts/seed_himadri_demo.py for the real structure this mirrors:
//
//  - Bharati is 4 real floors (Ground/1st "Master Station"/2nd "Living
//    Quarters"/3rd AHU+Terrace) — rendered as horizontal bands top-to-bottom,
//    each floor's rooms as side-by-side sub-clusters.
//  - Maitri is one main building (no floors) plus a cluster of outdoor
//    facilities — rendered as two side-by-side bands, each sub-grouped by
//    room/site.
//
// Dagre is still used elsewhere (the LR/circular layout presets, and as the
// fallback when a graph doesn't carry usable zone data) — this is a
// lightweight "zone lanes" layout, not a replacement dependency-graph
// algorithm: nodes are packed into fixed-size grids per zone/cluster: edges
// still auto-route between whatever positions result (ReactFlow's
// smoothstep), same as before.

import type { Node } from '@xyflow/react'
import type { GraphNode as GraphNodeData, ZoneMeta } from '@/types/graph'

export interface ZoneLayoutBox {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  /** 'band' = top-level (a Bharati floor, or Maitri main/outdoor split);
   * 'cluster' = the room/site sub-group inside a band. */
  kind: 'band' | 'cluster'
  restricted?: boolean
}

const NODE_W = 120
const NODE_H = 92
const NODE_GAP = 16
const CLUSTER_PAD = 16
const CLUSTER_LABEL_H = 20
const CLUSTER_GAP = 26
const BAND_PAD = 22
const BAND_LABEL_H = 26
const BAND_GAP = 40
const CLUSTER_COLS = 3
const MIN_BAND_WIDTH = 360

const BHARATI_FLOOR_LABELS: Record<number, string> = {
  0: 'GROUND — GARAGE / WORKSHOP / CHP',
  1: '1ST — MASTER STATION',
  2: '2ND — LIVING QUARTERS',
  3: '3RD — AHU / TERRACE',
}

function zoneMapFor(zones: ZoneMeta[]): Map<string, ZoneMeta> {
  return new Map(zones.map((z) => [z.id, z]))
}

function rootAncestor(zoneId: string, byId: Map<string, ZoneMeta>): ZoneMeta | undefined {
  let cur = byId.get(zoneId)
  const seen = new Set<string>()
  while (cur?.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
    seen.add(cur.id)
    cur = byId.get(cur.parentId)
  }
  return cur
}

function prettyLabel(zoneId: string, byId: Map<string, ZoneMeta>): string {
  const known = byId.get(zoneId)?.name
  if (known) return known.toUpperCase()
  if (zoneId === 'unzoned') return 'UNZONED'
  return zoneId.replace(/^(maitri|bharati)-/, '').replace(/-/g, ' ').toUpperCase()
}

/** True when there's enough zone/station data to build a banded layout —
 * every node shares one known station id and the zones list has entries for
 * it. Callers fall back to plain dagre otherwise (mixed-station views, a
 * live backend that hasn't populated zone_id yet, etc). */
export function canUseZoneBands(nodes: GraphNodeData[], zones: ZoneMeta[] | undefined): zones is ZoneMeta[] {
  if (!zones || nodes.length === 0 || zones.length === 0) return false
  const stations = new Set(nodes.map((n) => n.stationId).filter(Boolean))
  if (stations.size !== 1) return false
  const [stationId] = [...stations]
  if (stationId !== 'maitri' && stationId !== 'bharati') return false
  return zones.some((z) => z.stationId === stationId)
}

function clusterGridSize(count: number): { width: number; height: number; cols: number } {
  const cols = Math.min(CLUSTER_COLS, Math.max(1, count))
  const rows = Math.ceil(count / cols)
  return {
    cols,
    width: cols * NODE_W + (cols - 1) * NODE_GAP,
    height: rows * NODE_H + (rows - 1) * NODE_GAP,
  }
}

function packCluster(nodeIds: string[], originX: number, originY: number, cols: number): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  nodeIds.forEach((id, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    pos.set(id, { x: originX + col * (NODE_W + NODE_GAP), y: originY + row * (NODE_H + NODE_GAP) })
  })
  return pos
}

function groupByCluster(nodes: GraphNodeData[]): Map<string, GraphNodeData[]> {
  const out = new Map<string, GraphNodeData[]>()
  for (const n of nodes) {
    const key = n.zoneId ?? 'unzoned'
    if (!out.has(key)) out.set(key, [])
    out.get(key)!.push(n)
  }
  return out
}

interface BandedResult {
  positions: Map<string, { x: number; y: number }>
  boxes: ZoneLayoutBox[]
}

/** Bharati: one horizontal band per real floor (0-3), top-to-bottom, each
 * containing its rooms as side-by-side clusters. */
function layoutBharati(nodes: GraphNodeData[], byId: Map<string, ZoneMeta>): BandedResult {
  const positions = new Map<string, { x: number; y: number }>()
  const boxes: ZoneLayoutBox[] = []

  const byFloor = new Map<number, GraphNodeData[]>()
  for (const n of nodes) {
    const zone = n.zoneId ? byId.get(n.zoneId) : undefined
    const floor = zone?.floor ?? rootAncestor(n.zoneId ?? '', byId)?.floor ?? 0
    if (!byFloor.has(floor)) byFloor.set(floor, [])
    byFloor.get(floor)!.push(n)
  }

  let y = 0
  for (const floor of [...byFloor.keys()].sort((a, b) => a - b)) {
    const clusters = groupByCluster(byFloor.get(floor)!)
    let x = BAND_PAD
    let maxClusterHeight = 0
    const clusterBoxes: ZoneLayoutBox[] = []
    for (const [zoneId, clusterNodes] of clusters) {
      const size = clusterGridSize(clusterNodes.length)
      const clusterX = x
      const clusterY = y + BAND_LABEL_H + CLUSTER_LABEL_H + BAND_PAD / 2
      const pos = packCluster(clusterNodes.map((n) => n.id), clusterX, clusterY, size.cols)
      for (const [id, p] of pos) positions.set(id, p)
      clusterBoxes.push({
        id: `cluster-${floor}-${zoneId}`,
        label: prettyLabel(zoneId, byId),
        x: clusterX - CLUSTER_PAD / 2,
        y: clusterY - CLUSTER_LABEL_H,
        width: size.width + CLUSTER_PAD,
        height: size.height + CLUSTER_LABEL_H + CLUSTER_PAD / 2,
        kind: 'cluster',
        restricted: byId.get(zoneId)?.restricted,
      })
      maxClusterHeight = Math.max(maxClusterHeight, size.height)
      x = clusterX + size.width + CLUSTER_PAD + CLUSTER_GAP
    }
    const bandWidth = Math.max(x - CLUSTER_GAP, MIN_BAND_WIDTH)
    const bandHeight = maxClusterHeight + BAND_LABEL_H + CLUSTER_LABEL_H + BAND_PAD * 1.5
    boxes.push({
      id: `band-floor-${floor}`,
      label: BHARATI_FLOOR_LABELS[floor] ?? `FLOOR ${floor}`,
      x: 0,
      y,
      width: bandWidth,
      height: bandHeight,
      kind: 'band',
    })
    boxes.push(...clusterBoxes)
    y += bandHeight + BAND_GAP
  }

  return { positions, boxes }
}

/** Maitri: two side-by-side bands — Main Building vs Outdoor Facilities —
 * each stacked with its rooms/sites as sub-clusters. */
function layoutMaitri(nodes: GraphNodeData[], byId: Map<string, ZoneMeta>): BandedResult {
  const positions = new Map<string, { x: number; y: number }>()
  const boxes: ZoneLayoutBox[] = []

  const buckets: Record<'main' | 'outdoor', GraphNodeData[]> = { main: [], outdoor: [] }
  for (const n of nodes) {
    const zone = n.zoneId ? byId.get(n.zoneId) : undefined
    const root = zone ? rootAncestor(zone.id, byId) ?? zone : undefined
    const isOutdoor = root?.id === 'maitri-outdoor' || root?.kind === 'outdoor'
    buckets[isOutdoor ? 'outdoor' : 'main'].push(n)
  }

  const bandDefs: Array<['main' | 'outdoor', string]> = [
    ['main', 'MAIN BUILDING'],
    ['outdoor', 'OUTDOOR FACILITIES'],
  ]

  let x = 0
  for (const [key, label] of bandDefs) {
    const bandNodes = buckets[key]
    if (bandNodes.length === 0) continue
    const clusters = groupByCluster(bandNodes)
    let y = BAND_LABEL_H + BAND_PAD / 2
    let maxClusterWidth = 0
    const clusterBoxes: ZoneLayoutBox[] = []
    for (const [zoneId, clusterNodes] of clusters) {
      const size = clusterGridSize(clusterNodes.length)
      const clusterX = x + BAND_PAD
      const clusterY = y + CLUSTER_LABEL_H
      const pos = packCluster(clusterNodes.map((n) => n.id), clusterX, clusterY, size.cols)
      for (const [id, p] of pos) positions.set(id, p)
      clusterBoxes.push({
        id: `cluster-${key}-${zoneId}`,
        label: prettyLabel(zoneId, byId),
        x: clusterX - CLUSTER_PAD / 2,
        y: clusterY - CLUSTER_LABEL_H,
        width: size.width + CLUSTER_PAD,
        height: size.height + CLUSTER_LABEL_H + CLUSTER_PAD / 2,
        kind: 'cluster',
        restricted: byId.get(zoneId)?.restricted,
      })
      maxClusterWidth = Math.max(maxClusterWidth, size.width)
      y = clusterY + size.height + CLUSTER_GAP
    }
    const bandWidth = Math.max(maxClusterWidth + BAND_PAD * 2, MIN_BAND_WIDTH)
    const bandHeight = y - CLUSTER_GAP + BAND_PAD
    boxes.push({ id: `band-${key}`, label, x, y: 0, width: bandWidth, height: bandHeight, kind: 'band' })
    boxes.push(...clusterBoxes)
    x += bandWidth + BAND_GAP
  }

  return { positions, boxes }
}

/**
 * Computes zone-banded positions for `flowNodes` (already-built ReactFlow
 * Node objects — only `.position` is overwritten) using `graphNodesData`
 * (the source GraphNode[] with stationId/zoneId) and `zones`. Call
 * canUseZoneBands() first to check applicability.
 */
export function computeZoneBandedLayout(
  flowNodes: Node[],
  graphNodesData: GraphNodeData[],
  zones: ZoneMeta[],
): { nodes: Node[]; boxes: ZoneLayoutBox[] } {
  const byId = zoneMapFor(zones)
  const stationId = graphNodesData.find((n) => n.stationId)?.stationId
  const result = stationId === 'bharati' ? layoutBharati(graphNodesData, byId) : layoutMaitri(graphNodesData, byId)

  const nodes = flowNodes.map((node) => {
    const pos = result.positions.get(node.id)
    return pos ? { ...node, position: pos } : node
  })

  return { nodes, boxes: result.boxes }
}
