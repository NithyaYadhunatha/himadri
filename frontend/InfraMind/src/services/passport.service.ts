// src/services/passport.service.ts
//
// QR Asset Passport — GET /assets/{id}/passport, POST /assets/{id}/maintenance.
// Falls back to lib/mockData/mockPassport.ts when NEXT_PUBLIC_USE_MOCK is
// set: the curated few there for a rich passport, and a generic passport
// built from the asset's mockNodes/mockGraph entry for everything else so
// every asset in /assets has a passport page that renders.

import { USE_MOCK } from '@/lib/constants'
import { mockPassports } from '@/lib/mockData/mockPassport'
import { mockNodes as mockGraphNodes } from '@/lib/mockData/mockGraph'

export interface PassportMaintenanceEntry {
  id: string
  type: string
  description: string
  logged_by: string | null
  logged_at: string
}

export interface PassportTelemetryPoint {
  timestamp: string
  values: Record<string, number>
}

export interface AssetPassport {
  id: string
  name: string
  category: string
  subtype: string | null
  station_id: string
  zone_id: string | null
  status: string
  health_score: number
  provenance: string
  identity: Record<string, unknown>
  telemetry_history: PassportTelemetryPoint[]
  maintenance_log: PassportMaintenanceEntry[]
}

const mockMaintenanceLogs = new Map<string, PassportMaintenanceEntry[]>()

function buildFallbackPassport(assetId: string): AssetPassport | null {
  const node = mockGraphNodes.find((n) => n.id === assetId)
  if (!node) return null
  return {
    id: node.id,
    name: node.label,
    category: node.type,
    subtype: node.subtype ?? null,
    station_id: node.stationId ?? 'maitri',
    zone_id: node.zoneId ?? null,
    status: node.isSimulating ? 'simulating' : node.health === 'unreachable' ? 'offline' : 'ok',
    health_score: node.healthScore,
    provenance: node.provenance ?? 'documentary',
    identity: { commissioned: 'unknown', serial: `${node.id.toUpperCase()}-GEN` },
    telemetry_history: Array.from({ length: 12 }, (_, i) => ({
      timestamp: new Date(Date.now() - (12 - i) * 3600_000).toISOString(),
      values: { health_score: Math.round(Math.max(0, Math.min(100, node.healthScore + (Math.random() - 0.5) * 8)) * 10) / 10 },
    })),
    maintenance_log: [],
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}

export const passportService = {
  get: async (assetId: string): Promise<AssetPassport> => {
    if (USE_MOCK) {
      const curated = mockPassports[assetId]
      if (curated) {
        return Promise.resolve({ ...curated, maintenance_log: [...curated.maintenance_log, ...(mockMaintenanceLogs.get(assetId) ?? [])] })
      }
      const fallback = buildFallbackPassport(assetId)
      if (fallback) return Promise.resolve({ ...fallback, maintenance_log: mockMaintenanceLogs.get(assetId) ?? [] })
      return Promise.reject(new Error('Asset not found'))
    }
    return json(await fetch(`/api/nodes/${encodeURIComponent(assetId)}/passport`))
  },

  logMaintenance: async (assetId: string, input: { type: string; description: string }): Promise<PassportMaintenanceEntry> => {
    if (USE_MOCK) {
      const entry: PassportMaintenanceEntry = {
        id: `mock-maint-${Date.now()}`,
        type: input.type,
        description: input.description,
        logged_by: 'Dev Tester',
        logged_at: new Date().toISOString(),
      }
      const list = mockMaintenanceLogs.get(assetId) ?? []
      list.unshift(entry)
      mockMaintenanceLogs.set(assetId, list)
      return Promise.resolve(entry)
    }
    return json(await fetch(`/api/nodes/${encodeURIComponent(assetId)}/maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }))
  },
}
