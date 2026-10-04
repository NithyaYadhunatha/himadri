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

// The deployed backend nests the passport (identity / current_state /
// telemetry_history_30d / maintenance_and_faults); the page reads a flat
// shape. Accept either so a missing field can never crash the page.
/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizePassport(raw: any, assetId: string): AssetPassport {
  const idn = raw?.identity ?? {}
  const cur = raw?.current_state ?? {}
  const hist: any[] = raw?.telemetry_history ?? raw?.telemetry_history_30d ?? []
  const log: any[] = raw?.maintenance_log ?? raw?.maintenance_and_faults ?? []
  const { id, name, station_id, zone_id, category, subtype, provenance, spec, ...rest } = idn
  const notRecorded = (v: unknown) => (v === null || v === undefined || v === '' ? 'Not recorded' : v)
  const identity: Record<string, unknown> = {
    station: station_id ? String(station_id).replace(/^./, (c: string) => c.toUpperCase()) : 'Not recorded',
    zone: zone_id ?? 'Not recorded',
    category: [category, subtype].filter(Boolean).join(' / ') || 'Not recorded',
    manufacturer: notRecorded(rest.manufacturer),
    ...Object.fromEntries(Object.entries(rest).filter(([k]) => k !== 'manufacturer').map(([k, v]) => [k, notRecorded(v)])),
    ...(spec && typeof spec === 'object' ? spec : {}),
  }
  if (cur.risk_score !== undefined) identity.risk_score = cur.risk_score
  if (cur.primary_value !== undefined && cur.primary_value !== null) identity.latest_reading = `${cur.primary_value}${cur.primary_unit ? ' ' + cur.primary_unit : ''}`
  if (cur.last_seen) identity.last_seen = String(cur.last_seen).replace('T', ' ').slice(0, 19) + ' UTC'
  identity.responsible_user = notRecorded(raw?.responsible_user)
  if (raw?.controllable !== undefined) identity.remotely_controllable = raw.controllable ? 'Yes' : 'No'
  if (raw?.life_safety !== undefined) identity.life_safety = raw.life_safety ? 'Yes' : 'No'
  return {
    id: raw?.id ?? id ?? assetId,
    name: raw?.name ?? name ?? assetId,
    category: raw?.category ?? category ?? 'asset',
    subtype: raw?.subtype ?? subtype ?? null,
    station_id: raw?.station_id ?? station_id ?? '',
    zone_id: raw?.zone_id ?? zone_id ?? null,
    status: raw?.status ?? cur.status ?? 'unknown',
    health_score: Math.round((raw?.health_score ?? cur.health_score ?? 0) * 10) / 10,
    provenance: raw?.provenance ?? provenance ?? 'unverified',
    identity: raw?.maintenance_log ? idn : identity,
    telemetry_history: hist.map((p) => ({ timestamp: p.timestamp ?? p.collected_at ?? '', values: p.values ?? {} })),
    maintenance_log: log.map((m, i) => ({
      id: m.id ?? `m-${i}`,
      type: m.type ?? m.kind ?? 'Event',
      description: m.description ?? m.message ?? '',
      logged_by: m.logged_by ?? m.entered_by ?? null,
      logged_at: m.logged_at ?? m.created_at ?? m.at ?? '',
    })),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
    return normalizePassport(await json<unknown>(await fetch(`/api/nodes/${encodeURIComponent(assetId)}/passport`)), assetId)
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
