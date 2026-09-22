// src/lib/graph/floorPlan.ts
//
// Groups 2D twin nodes into per-room "boxes" for the room-wise Floor Plan
// view (src/app/twin/floorplan/page.tsx) — a third way of looking at the
// same station/zone data the 2D graph's zone bands use (lib/graph/
// zoneLayout.ts), but as a floor-plan grid of rooms instead of a dependency
// graph. Bharati sections are its 4 real floors; Maitri sections are the
// Main Building vs Outdoor Facilities split — same architecture zoneLayout
// derives from, grouped here into rooms rather than pixel positions.

import type { GraphNode as GraphNodeData, ZoneMeta } from '@/types/graph'

export interface FloorPlanRoom {
  zoneId: string
  name: string
  kind: string
  restricted: boolean
  floor: number | null
  assets: GraphNodeData[]
}

export interface FloorPlanSection {
  key: string
  label: string
  rooms: FloorPlanRoom[]
}

export const BHARATI_FLOOR_LABELS: Record<number, string> = {
  0: 'Ground — Garage / Workshop / CHP',
  1: '1st — Master Station',
  2: '2nd — Living Quarters',
  3: '3rd — AHU / Terrace',
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

function buildRoom(zoneId: string, byId: Map<string, ZoneMeta>, assets: GraphNodeData[]): FloorPlanRoom {
  const zone = byId.get(zoneId)
  return {
    zoneId,
    name: zone?.name ?? zoneId.replace(/^(maitri|bharati)-/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    kind: zone?.kind ?? 'room',
    restricted: zone?.restricted ?? false,
    floor: zone?.floor ?? null,
    assets,
  }
}

/** True when there's enough zone data to build a floor-plan grid — same
 * gate as zoneLayout.ts's canUseZoneBands. */
export function canUseFloorPlan(nodes: GraphNodeData[], zones: ZoneMeta[] | undefined): zones is ZoneMeta[] {
  if (!zones || nodes.length === 0 || zones.length === 0) return false
  const stations = new Set(nodes.map((n) => n.stationId).filter(Boolean))
  if (stations.size !== 1) return false
  const [stationId] = [...stations]
  if (stationId !== 'maitri' && stationId !== 'bharati') return false
  return zones.some((z) => z.stationId === stationId)
}

export function computeFloorPlanSections(nodes: GraphNodeData[], zones: ZoneMeta[]): FloorPlanSection[] {
  const byId = zoneMapFor(zones)
  const stationId = nodes.find((n) => n.stationId)?.stationId

  if (stationId === 'bharati') {
    const byFloor = new Map<number, Map<string, GraphNodeData[]>>()
    for (const n of nodes) {
      const zone = n.zoneId ? byId.get(n.zoneId) : undefined
      const floor = zone?.floor ?? rootAncestor(n.zoneId ?? '', byId)?.floor ?? 0
      if (!byFloor.has(floor)) byFloor.set(floor, new Map())
      const rooms = byFloor.get(floor)!
      const key = n.zoneId ?? 'unzoned'
      if (!rooms.has(key)) rooms.set(key, [])
      rooms.get(key)!.push(n)
    }
    return [...byFloor.keys()].sort((a, b) => a - b).map((floor) => ({
      key: `floor-${floor}`,
      label: BHARATI_FLOOR_LABELS[floor] ?? `Floor ${floor}`,
      rooms: [...byFloor.get(floor)!.entries()].map(([zoneId, assets]) => buildRoom(zoneId, byId, assets)),
    }))
  }

  // Maitri: Main Building vs Outdoor Facilities.
  const buckets: Record<'main' | 'outdoor', Map<string, GraphNodeData[]>> = { main: new Map(), outdoor: new Map() }
  for (const n of nodes) {
    const zone = n.zoneId ? byId.get(n.zoneId) : undefined
    const root = zone ? rootAncestor(zone.id, byId) ?? zone : undefined
    const isOutdoor = root?.id === 'maitri-outdoor' || root?.kind === 'outdoor'
    const bucket = buckets[isOutdoor ? 'outdoor' : 'main']
    const key = n.zoneId ?? 'unzoned'
    if (!bucket.has(key)) bucket.set(key, [])
    bucket.get(key)!.push(n)
  }
  const sections: FloorPlanSection[] = []
  if (buckets.main.size > 0) {
    sections.push({ key: 'main', label: 'Main Building', rooms: [...buckets.main.entries()].map(([zoneId, assets]) => buildRoom(zoneId, byId, assets)) })
  }
  if (buckets.outdoor.size > 0) {
    sections.push({ key: 'outdoor', label: 'Outdoor Facilities', rooms: [...buckets.outdoor.entries()].map(([zoneId, assets]) => buildRoom(zoneId, byId, assets)) })
  }
  return sections
}
