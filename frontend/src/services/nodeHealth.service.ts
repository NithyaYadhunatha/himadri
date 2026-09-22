// src/services/nodeHealth.service.ts

import { USE_MOCK } from '@/lib/constants'
import { mockNodes, mockNodeSummary } from '@/lib/mockData/mockNodes'
import {
  classifyHealth,
  mapNodeType,
  primaryValueFromReading,
  type BackendAssetListItem,
  type BackendReadingRecord,
  type BackendAlertDetail,
  type BackendTwinSummary,
} from '@/lib/backendAdapters'
import { remediationService } from '@/services/remediation.service'
import { generateSyntheticTrend, getSyntheticTrendRange } from '@/lib/graph/syntheticTrend'
import type { NodeHealth, NodeSummary, NodeFiltersInput, RemediationAction } from '@/types/nodes'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`)
  return res.json() as Promise<T>
}

/**
 * The backend's /assets list endpoint (BackendAssetListItem) is deliberately
 * thin — no readings history or alert counts. To build a full NodeHealth
 * record we fetch, per asset, its last 24 readings (for the 24h trend) and
 * its open/acked alerts. That's 2 extra requests per asset — fine at
 * hackathon-station scale (a few dozen assets per station), not something
 * you'd want at hundreds of assets without a backend endpoint that returns
 * this in one shot.
 *
 * All requests go through the Next.js /api/nodes/* proxy (not FastAPI
 * directly) so getCurrentMembership() station scoping applies.
 */
async function fetchNodeHealth(base: BackendAssetListItem): Promise<NodeHealth> {
  const [history, alerts] = await Promise.all([
    fetchJson<BackendReadingRecord[]>(`/api/nodes/${base.id}/readings?limit=24`),
    fetchJson<BackendAlertDetail[]>(`/api/nodes/${base.id}/alerts?active_only=true`),
  ])
  // history is newest-first
  const latest = history[0]
  const nodeType = mapNodeType(base.category)

  // Demo assets created directly (no device agent ever sent a real
  // reading) have no history at all — fall back to that asset's own curated
  // synthetic dataset (the same JSON the category panel reads) instead of a
  // blank sparkline. Real assets with real history are never affected.
  const trendRange = !latest ? getSyntheticTrendRange(base.id, nodeType) : null
  const trend = trendRange
    ? generateSyntheticTrend(base.id, trendRange.min, trendRange.max)
    : [...history].reverse().map((r) => {
        const { value } = primaryValueFromReading(r, null)
        return { timestamp: r.collected_at, value: value ?? base.health_score }
      })

  return {
    id: base.id,
    name: base.name,
    type: nodeType,
    version: base.spec?.version ?? base.subtype ?? '—',
    health: classifyHealth(base.status, base.health_score),
    healthScore: base.health_score,
    incidents: alerts.length,
    lastSync: base.last_seen ?? new Date().toISOString(),
    uptime: base.spec?.uptime ?? 0,
    stationId: base.station_id,
    tags: [
      ...(base.zone_id ? [base.zone_id] : []),
      ...(base.spec?.tags ?? [])
    ],
    trend,
    alerts: alerts.map((a) => ({
      id: a.id,
      message: a.message,
      severity: a.severity === 'critical' || a.severity === 'emergency' ? 'critical' : a.severity === 'warning' ? 'warning' : 'info',
      timestamp: a.last_seen,
    })),
  }
}

export const nodeHealthService = {
  getSummary: async (stationId?: string): Promise<NodeSummary> => {
    if (USE_MOCK) return Promise.resolve(mockNodeSummary)

    const qs = stationId ? `?station=${encodeURIComponent(stationId)}` : ''
    const [summary, nodes] = await Promise.all([
      fetchJson<BackendTwinSummary>(`/api/fleet/summary${qs}`),
      fetchJson<BackendAssetListItem[]>('/api/nodes'),
    ])
    const scoped = stationId ? nodes.filter((n) => n.station_id === stationId) : nodes
    const buckets = { healthy: 0, degraded: 0, critical: 0, unreachable: 0 }
    for (const n of scoped) {
      if (n.status === 'simulating') continue
      buckets[classifyHealth(n.status, n.health_score)]++
    }
    return {
      total: summary.total_assets,
      critical: buckets.critical,
      atRisk: buckets.degraded,
      healthy: buckets.healthy,
      unreachable: buckets.unreachable,
      averageHealthScore: summary.avg_health_score,
      lastUpdated: new Date().toISOString(),
    }
  },

  getNodes: async (filters?: NodeFiltersInput): Promise<NodeHealth[]> => {
    if (USE_MOCK) {
      let nodes = [...mockNodes]
      if (filters?.health && filters.health.length > 0) {
        nodes = nodes.filter((n) => filters.health!.includes(n.health))
      }
      if (filters?.type && filters.type.length > 0) {
        nodes = nodes.filter((n) => filters.type!.includes(n.type))
      }
      if (filters?.search) {
        const q = filters.search.toLowerCase()
        nodes = nodes.filter((n) => n.name.toLowerCase().includes(q))
      }
      if (filters?.sortBy === 'risk') {
        nodes.sort((a, b) => a.healthScore - b.healthScore)
      } else if (filters?.sortBy === 'name') {
        nodes.sort((a, b) => a.name.localeCompare(b.name))
      }
      return Promise.resolve(nodes)
    }

    const list = await fetchJson<BackendAssetListItem[]>('/api/nodes')
    let nodes = await Promise.all(list.map(fetchNodeHealth))

    if (filters?.health && filters.health.length > 0) {
      nodes = nodes.filter((n) => filters.health!.includes(n.health))
    }
    if (filters?.type && filters.type.length > 0) {
      nodes = nodes.filter((n) => filters.type!.includes(n.type))
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase()
      nodes = nodes.filter((n) => n.name.toLowerCase().includes(q))
    }
    if (filters?.sortBy === 'risk') {
      nodes.sort((a, b) => a.healthScore - b.healthScore)
    } else if (filters?.sortBy === 'name') {
      nodes.sort((a, b) => a.name.localeCompare(b.name))
    }
    return nodes
  },

  getNode: async (nodeId: string): Promise<NodeHealth> => {
    if (USE_MOCK) {
      const node = mockNodes.find((n) => n.id === nodeId)
      return Promise.resolve(node ?? mockNodes[0])
    }
    const node = await fetchJson<BackendAssetListItem>(`/api/nodes/${nodeId}`)
    return fetchNodeHealth(node)
  },

  // Fetch asset-specific remediation actions derived from real blast radius +
  // asset health via the Next.js /api/remediation/recommendations route.
  getRemediationActions: async (nodeId: string): Promise<RemediationAction[]> => {
    return remediationService.getNodeRecs(nodeId)
  },

  remediateNode: async (_nodeId: string, actionId: string): Promise<{ taskId: string }> => {
    return Promise.resolve({ taskId: `task-${Date.now()}` })
  },
}
