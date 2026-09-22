// src/services/graph.service.ts

import { USE_MOCK } from '@/lib/constants'
import { mockLiveGraph } from '@/lib/mockData/mockGraph'
import { mockZones } from '@/lib/mockData/mockZones'
import { adaptFullGraph, adaptZones, type BackendFullGraph, type BackendZoneDetail } from '@/lib/backendAdapters'
import type { LiveGraphData, SimulationGraphData, GraphNode, NodeFilters, ZoneMeta } from '@/types/graph'

const GRAPH_REQUEST_TIMEOUT_MS = 10_000

async function fetchGraph(stationId?: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), GRAPH_REQUEST_TIMEOUT_MS)
  const qs = stationId ? `?station=${encodeURIComponent(stationId)}` : ''
  try {
    return await fetch(`/api/fleet/graph${qs}`, { signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The infrastructure service did not respond in time')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

export const graphService = {
  getLiveGraph: async (stationId?: string): Promise<LiveGraphData> => {
    if (USE_MOCK) {
      if (!stationId) return Promise.resolve(mockLiveGraph)
      return Promise.resolve({
        ...mockLiveGraph,
        nodes: mockLiveGraph.nodes.filter((n) => n.stationId === stationId),
        edges: mockLiveGraph.edges.filter((e) => {
          const source = mockLiveGraph.nodes.find((n) => n.id === e.source)
          return source?.stationId === stationId
        }),
      })
    }
    // Proxied through Next.js (not FastAPI directly) so getCurrentMembership()
    // station scoping applies before the graph reaches the browser — see
    // /api/fleet/graph and lib/graph/departmentScope.ts.
    const res = await fetchGraph(stationId)
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null
      throw new Error(body?.error ?? `Failed to load fleet graph (${res.status})`)
    }
    const raw = (await res.json()) as BackendFullGraph
    const { nodes, edges } = adaptFullGraph(raw)
    return { nodes, edges, lastSync: new Date().toISOString() }
  },

  // The backend has no concept of a "what would the topology look like"
  // preview — simulations only project impact for a single node (see
  // simulationService). Until that exists server-side, this just wraps the
  // current live/mock graph with an empty modification set.
  getSimulationGraph: async (): Promise<SimulationGraphData> => {
    const base = USE_MOCK ? mockLiveGraph : await graphService.getLiveGraph()
    return {
      ...base,
      scenarioId: 'sim-current',
      modifications: { added: [], modified: [], removed: [] },
    }
  },

  // Zone metadata (station architecture — floors/rooms/outdoor sites) for
  // the 2D twin's zone-banded layout (lib/graph/zoneLayout.ts). Not
  // timed/aborted like fetchGraph since it's small and non-critical — a
  // failure just means FlowCanvas falls back to plain dagre.
  getZones: async (stationId?: string): Promise<ZoneMeta[]> => {
    if (USE_MOCK) {
      if (!stationId) return Promise.resolve(mockZones)
      return Promise.resolve(mockZones.filter((z) => z.stationId === stationId))
    }
    const qs = stationId ? `?station=${encodeURIComponent(stationId)}` : ''
    const res = await fetch(`/api/fleet/zones${qs}`)
    if (!res.ok) return []
    const raw = (await res.json()) as BackendZoneDetail[]
    return adaptZones(raw)
  },

  // No backend filter endpoint exists — filtering the graph is cheap enough
  // to do client-side against whichever graph (live or mock) is loaded.
  filterNodes: async (filters: NodeFilters): Promise<GraphNode[]> => {
    const base = USE_MOCK ? mockLiveGraph : await graphService.getLiveGraph()
    let nodes = base.nodes
    if (filters.layer && filters.layer !== 'All Layers') {
      nodes = nodes.filter((n) => n.layer === filters.layer)
    }
    if (filters.health && filters.health.length > 0) {
      nodes = nodes.filter((n) => filters.health!.includes(n.health))
    }
    if (filters.type && filters.type.length > 0) {
      nodes = nodes.filter((n) => filters.type!.includes(n.type))
    }
    if (filters.search) {
      const q = filters.search.toLowerCase()
      nodes = nodes.filter((n) => n.label.toLowerCase().includes(q))
    }
    return nodes
  },
}
