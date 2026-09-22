// src/lib/graph/syntheticTrend.ts
//
// Synthetic 24h trend line for a curated demo asset's overall health score —
// used by nodeHealth.service.ts as the `trend` fallback when an asset has no
// real readings history, so the sparkline shown on its card and in the Node
// Inspector's "24H Health Trend" isn't blank. Deterministic per asset id,
// shaped as a wave with a couple of peaks rather than flat noise, to read as
// plausible drift rather than random jitter.
//
// Antarctic asset telemetry is heterogeneous per category (fuel litres,
// freezer °C, generator kW, magnetometer nT — see backendAdapters.ts's
// header comment), so unlike the old IT-stack version of this file there is
// no single "signature metric" every category shares to chart. Charting each
// curated dataset's own `health.overall` score instead keeps this generic
// across all 10 non-custom categories.
import type { NodeType } from '@/types/graph'
import type { TimeSeriesPoint } from '@/types/common'
import { mockStatsFor } from './mockStats'
import powerData from '@/lib/syntheticData/powerData.json'
import heatingData from '@/lib/syntheticData/heatingData.json'
import waterData from '@/lib/syntheticData/waterData.json'
import wasteData from '@/lib/syntheticData/wasteData.json'
import vehicleData from '@/lib/syntheticData/vehicleData.json'
import instrumentData from '@/lib/syntheticData/instrumentData.json'
import storageData from '@/lib/syntheticData/storageData.json'
import medicalData from '@/lib/syntheticData/medicalData.json'
import commsData from '@/lib/syntheticData/commsData.json'
import structureData from '@/lib/syntheticData/structureData.json'

/** A wave with 2-3 peaks over `points` samples, seeded per asset so it's stable across renders. */
export function generateSyntheticTrend(nodeId: string, min: number, max: number, points = 24): TimeSeriesPoint[] {
  const { rand } = mockStatsFor(`${nodeId}-trend`)
  const peakCount = 2 + Math.floor(rand() * 2) // 2-3 peaks
  const phase = rand() * Math.PI * 2
  const range = max - min
  const now = Date.now()

  const result: TimeSeriesPoint[] = []
  for (let i = 0; i < points; i++) {
    const wave = (Math.sin((i / points) * Math.PI * 2 * peakCount + phase) + 1) / 2 // 0..1
    const noise = (rand() - 0.5) * 0.15
    const shaped = Math.min(1, Math.max(0, wave * 0.75 + noise + 0.1))
    result.push({
      timestamp: new Date(now - (points - i) * 60 * 60 * 1000).toISOString(),
      value: Math.round((min + range * shaped) * 10) / 10,
    })
  }
  return result
}

type Range = { min: number; max: number }

const DATASETS: Partial<Record<NodeType, Record<string, { health: { overall: number } }>>> = {
  power: powerData,
  heating: heatingData,
  water: waterData,
  waste: wasteData,
  vehicle: vehicleData,
  instrument: instrumentData,
  storage: storageData,
  medical: medicalData,
  comms: commsData,
  structure: structureData,
}

/** The value range (0-100, health-score-shaped) for this asset's synthetic
 * trend, or null if no curated dataset entry exists for it (custom assets,
 * or any asset id not hand-curated — nodeHealth.service falls back to a flat
 * value from the asset's own healthScore in that case). */
export function getSyntheticTrendRange(nodeId: string, nodeType: NodeType): Range | null {
  const entry = DATASETS[nodeType]?.[nodeId]
  if (!entry) return null
  const center = entry.health.overall
  return { min: Math.max(0, center - 12), max: Math.min(100, center + 8) }
}
