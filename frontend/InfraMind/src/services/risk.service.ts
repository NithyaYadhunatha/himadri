// src/services/risk.service.ts
//
// Antarctic Risk Heatmap — GET /analytics/risk?station=. Falls back to
// lib/mockData/mockRisk.ts when NEXT_PUBLIC_USE_MOCK is set, same convention
// as the rest of the app's services (nodeHealth.service.ts etc.) — this was
// previously the one feature with no mock path at all, so /risk just showed
// "backend unreachable" with no live backend running.

import { USE_MOCK } from '@/lib/constants'
import { mockRiskHeatmaps } from '@/lib/mockData/mockRisk'

export interface RiskFactor {
  name: string
  label: string
  score: number
  weight: number
  evidence: string
}

export interface RiskCell {
  subsystem: string
  label: string
  score: number
  factors: RiskFactor[]
}

export interface RiskHeatmap {
  station: string
  generated_at: string
  cells: RiskCell[]
}

export const riskService = {
  getHeatmap: async (station: string): Promise<RiskHeatmap> => {
    if (USE_MOCK) {
      return Promise.resolve(mockRiskHeatmaps[station] ?? mockRiskHeatmaps.maitri)
    }
    const res = await fetch(`/api/analytics/risk?station=${encodeURIComponent(station)}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `Failed to load risk heatmap (${res.status})`)
    }
    return res.json()
  },
}
