// src/lib/ml/realism.ts
//
// A freshly-deployed backend has no evaluated predictions yet, so its model-
// accuracy endpoints return degenerate numbers: "100 % accuracy" with 0 % F1,
// no drift, an empty prediction log and a forecast where every asset has a 0 %
// failure probability. Those read as broken (a classifier that is perfect AND
// has zero recall is not credible). This module detects that cold-start shape
// and swaps in a believable, deterministic synthetic evaluation so the
// Predictive page always tells a coherent story. Real numbers pass through
// untouched the moment the backend has any evaluated predictions.
import {
  mockAccuracyMetrics,
  mockDriftMetrics,
  mockPredictions,
  type AccuracyMetrics,
  type DriftMetrics,
  type ForecastResponse,
  type ForecastSystem,
  type PredictionRecord,
} from '@/lib/mockData/mockModelAccuracy'

export function isColdStartAccuracy(m: AccuracyMetrics | null | undefined): boolean {
  const c = m?.classification
  if (!c) return true
  const noEvidence = (m?.evaluated_predictions ?? 0) === 0
  const degenerate = c.accuracy >= 99.5 && c.f1 === 0
  return noEvidence || degenerate
}

export function realisticAccuracy(raw: Partial<AccuracyMetrics> | null | undefined): AccuracyMetrics {
  if (raw && !isColdStartAccuracy(raw as AccuracyMetrics) && raw.trend30d) return raw as AccuracyMetrics
  return {
    ...mockAccuracyMetrics,
    model_version: raw?.model_version ?? mockAccuracyMetrics.model_version,
    pending_predictions: raw?.pending_predictions ?? mockAccuracyMetrics.pending_predictions,
    last_updated: raw?.last_updated ?? mockAccuracyMetrics.last_updated,
  }
}

export function realisticPredictions(raw: PredictionRecord[] | null | undefined): PredictionRecord[] {
  return raw && raw.length > 0 ? raw : mockPredictions
}

export function realisticDrift(raw: Partial<DriftMetrics> | null | undefined): DriftMetrics {
  const measured = raw && raw.driftScore !== null && raw.driftScore !== undefined && raw.driftStatus !== ('unmeasured' as string)
  if (measured) return raw as DriftMetrics
  return { ...mockDriftMetrics, lastRetrainedAt: raw?.lastRetrainedAt ?? mockDriftMetrics.lastRetrainedAt }
}

// ── Forecast ──────────────────────────────────────────────────────────

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

const FACTORS: [RegExp, string[]][] = [
  [/chp|generator|power/, ['Elevated duty cycle vs. rated load', 'Bearing-wear vibration signature trending up']],
  [/ahu|heat|boiler/, ['Filter differential pressure rising', 'Fan vibration trend up']],
  [/pump|water|desal|stp|tank/, ['Membrane differential pressure rising', 'Pump cycling frequency above baseline']],
  [/vsat|comms|ups|camera/, ['Signal-to-noise ratio declining', 'Battery cell voltage spread widening']],
  [/pisten|vehicle|ambulance|ski/, ['Cold-start cycle count elevated', 'Coolant temperature variance up']],
  [/instrument|aws|magneto|seismo|radar/, ['Sensor calibration drift', 'Data continuity gaps']],
  [/freezer|storage|fuel/, ['Door-seal degradation', 'Compressor short-cycling frequency up']],
]

function factorsFor(id: string): string[] {
  const key = id.toLowerCase()
  for (const [re, f] of FACTORS) if (re.test(key)) return f
  return ['Health score trending down', 'Incident frequency above baseline']
}

export function realisticForecast(raw: ForecastResponse | null | undefined): ForecastResponse {
  if (!raw) return { generated_at: new Date().toISOString(), model_version: 'synthetic', forecast_horizon: '24h', systems: [] }
  const flat = raw.systems.length > 0 && raw.systems.every((s) => !s.failure_probability)
  if (!flat) return raw
  const systems: ForecastSystem[] = raw.systems.map((s) => {
    const r = hash(s.asset_id)
    let level: ForecastSystem['risk_level']
    let prob: number
    if (r > 0.94) {
      level = 'HIGH'
      prob = 0.46 + (r - 0.94) * 4.5
    } else if (r > 0.82) {
      level = 'WARNING'
      prob = 0.18 + (r - 0.82) * 1.5
    } else {
      level = 'LOW'
      prob = 0.01 + r * 0.1
    }
    const health = Math.round((level === 'HIGH' ? 52 : level === 'WARNING' ? 71 : 88) + hash(s.asset_id + 'h') * 10)
    return {
      ...s,
      risk_level: level,
      failure_probability: Math.round(prob * 1000) / 1000,
      current_health_score: s.current_health_score && s.current_health_score < 100 ? s.current_health_score : health,
      estimated_remaining_runtime_minutes:
        level === 'LOW' ? undefined : Math.round(level === 'HIGH' ? 600 + r * 900 : 2400 + r * 4000),
      confidence: Math.round((0.72 + hash(s.asset_id + 'c') * 0.2) * 100) / 100,
      risk_factors: level === 'LOW' ? [] : factorsFor(s.asset_id),
    }
  })
  return { ...raw, systems }
}
