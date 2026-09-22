// src/lib/mockData/mockModelAccuracy.ts

import type { TimeSeriesPoint } from '@/types/common'
import { mockNodes } from './mockGraph'

export interface AccuracyMetrics {
  currentAccuracy: number  // 0-100
  targetAccuracy: number
  trend30d: TimeSeriesPoint[]
  totalPredictions: number
  correctPredictions: number
  avgDeviation: number
  window?: string
  model_version?: string
  classification?: {
    accuracy: number
    precision: number
    recall: number
    f1: number
    roc_auc: number
  }
  runtime_prediction?: {
    mae_minutes: number
    rmse_minutes: number
  }
  evaluated_predictions?: number
  pending_predictions?: number
  last_updated?: string
}

export interface PredictionRecord {
  id: string
  scenario: string
  predictedValue: number
  actualValue: number
  unit: string
  deviation: number
  deviationPct: number
  // 'accurate' | 'acceptable' | 'inaccurate' — this mock data's own outcome
  // vocabulary. Real backend data (GET /model-accuracy/predictions) uses a
  // different, richer enum from the ml_prediction_outcomes table's `outcome`
  // column (backend/models/tables.py's MLPredictionOutcome) — both are valid
  // here so real API responses type-check without a transform layer; see
  // outcomeBadge in the Model Accuracy page for how each value is colored.
  outcome: 'accurate' | 'acceptable' | 'inaccurate' | 'CORRECT' | 'EARLY' | 'LATE' | 'FALSE_POSITIVE' | 'FALSE_NEGATIVE' | 'NO_FAILURE'
  timestamp: string
}

export interface DriftMetrics {
  driftScore: number  // 0-100 (higher = more drift)
  driftStatus: 'stable' | 'warning' | 'critical'
  driftAlert?: string
  featureImportance: Array<{ feature: string; importance: number; drift: number }>
  retrainingRecommended: boolean
  lastRetrainedAt: string
}

export interface ForecastSystem {
  asset_id: string
  asset_name: string
  risk_level: 'CRITICAL' | 'HIGH' | 'LOW' | 'WARNING' | string
  failure_probability: number
  current_health_score?: number
  estimated_remaining_runtime_minutes?: number
  confidence?: number
  risk_factors: string[]
}

export interface ForecastResponse {
  generated_at: string
  model_version: string
  forecast_horizon: string
  systems: ForecastSystem[]
}

// 30-day accuracy trend — kept in the 70-90% band on purpose (a real,
// believable "works but not perfect" model, not a suspiciously flawless
// 95%+ one), matching the tone backend/analysis/train.py's actual
// (non-mock) trained model targets — see
// backend/context/DEVELOPMENT_STATUS.md's "genuine (not perfect) accuracy"
// note. Deterministic (no Math.random) so the trend line and KPI numbers
// don't jump between renders/reloads within the same session.
const now = Date.now()
export const mockAccuracyMetrics: AccuracyMetrics = {
  currentAccuracy: 84.3,
  targetAccuracy: 85.0,
  trend30d: Array.from({ length: 30 }, (_, i) => ({
    timestamp: new Date(now - (30 - i) * 86400000).toISOString(),
    value: 78.5 + Math.sin(i * 0.37) * 3.2 + Math.cos(i * 0.13) * 1.6 + i * 0.14,
  })),
  totalPredictions: 4820,
  correctPredictions: 4063,
  avgDeviation: 4.1,
  window: '30d',
  model_version: 'himadri-gbc-v1.3-mock',
  classification: {
    accuracy: 84.3,
    precision: 81.7,
    recall: 79.8,
    f1: 80.7,
    roc_auc: 88.2,
  },
  runtime_prediction: {
    mae_minutes: 3.6,
    rmse_minutes: 4.9,
  },
  evaluated_predictions: 4756,
  pending_predictions: 64,
  last_updated: new Date(now).toISOString(),
}

// Timestamps anchored to "now" (hours/days ago) rather than fixed calendar
// dates — a fixed 2026-06 date reads as stale/placeholder once "today"
// moves past it (this session: 2026-09-22). `hoursAgo` keeps them looking
// like a live rolling prediction log every time the app is opened.
function hoursAgo(h: number): string {
  return new Date(now - h * 3600_000).toISOString()
}

export const mockPredictions: PredictionRecord[] = [
  {
    id: 'pred-001',
    scenario: 'Generator 2 Load Shed → Generator 3 Standby',
    predictedValue: 8.2,
    actualValue: 9.1,
    unit: 'min transfer',
    deviation: 0.9,
    deviationPct: 11.0,
    outcome: 'accurate',
    timestamp: hoursAgo(3),
  },
  {
    id: 'pred-002',
    scenario: 'Fuel Farm Tank Changeover (Tank 3 → 4)',
    predictedValue: 3.0,
    actualValue: 2.8,
    unit: 'min',
    deviation: 0.2,
    deviationPct: 6.7,
    outcome: 'accurate',
    timestamp: hoursAgo(9),
  },
  {
    id: 'pred-003',
    scenario: 'VSAT Link Outage → HF Backup Comms',
    predictedValue: 4.2,
    actualValue: 6.8,
    unit: 'h outage',
    deviation: 2.6,
    deviationPct: 61.9,
    outcome: 'inaccurate',
    timestamp: hoursAgo(27),
  },
  {
    id: 'pred-004',
    scenario: 'AHU 1 Fan Speed Throttle Recovery',
    predictedValue: 2.0,
    actualValue: 2.1,
    unit: 'min',
    deviation: 0.1,
    deviationPct: 5.0,
    outcome: 'accurate',
    timestamp: hoursAgo(34),
  },
  {
    id: 'pred-005',
    scenario: 'Generator Parallel Sync (2 → 3 units)',
    predictedValue: 0.0,
    actualValue: 0.0,
    unit: 'h downtime',
    deviation: 0.0,
    deviationPct: 0.0,
    outcome: 'accurate',
    timestamp: hoursAgo(41),
  },
  {
    id: 'pred-006',
    scenario: 'STP Filter Media Rolling Replacement',
    predictedValue: 12.0,
    actualValue: 15.5,
    unit: 'min',
    deviation: 3.5,
    deviationPct: 29.2,
    outcome: 'acceptable',
    timestamp: hoursAgo(58),
  },
  {
    id: 'pred-007',
    scenario: 'Deep Freezer 2 Manual Defrost Cycle',
    predictedValue: 45.0,
    actualValue: 52.0,
    unit: 'min',
    deviation: 7.0,
    deviationPct: 15.6,
    outcome: 'acceptable',
    timestamp: hoursAgo(76),
  },
  {
    id: 'pred-008',
    scenario: 'Convoy Departure Checklist Sign-off',
    predictedValue: 0.5,
    actualValue: 0.4,
    unit: 'min',
    deviation: 0.1,
    deviationPct: 20.0,
    outcome: 'accurate',
    timestamp: hoursAgo(94),
  },
]

export const mockDriftMetrics: DriftMetrics = {
  driftScore: 18,
  driftStatus: 'stable',
  driftAlert: undefined,
  retrainingRecommended: false,
  lastRetrainedAt: hoursAgo(24 * 6),
  featureImportance: [
    { feature: 'Asset Health Score', importance: 34, drift: 2 },
    { feature: 'Dependency Depth', importance: 21, drift: 4 },
    { feature: 'Historical MTTR', importance: 18, drift: 1 },
    { feature: 'Equipment Load Factor', importance: 12, drift: 8 },
    { feature: 'Comms Link Latency', importance: 9, drift: 3 },
    { feature: 'Incident Frequency', importance: 6, drift: 12 },
  ],
}

// ─── Forecast (GET /model-accuracy/forecast) ───────────────────────────────
//
// Mock mode used to return `{ systems: [] }`, which the Predictive
// Maintenance page renders as "Insufficient data — need more historical
// records to generate reliable forecasts" — a real message for a real
// cold-start backend, but a placeholder-looking dead end in a demo that has
// no backend to ever warm up. Built from the SAME asset ids/health scores
// lib/mockData/mockGraph.ts already defines (not an invented universe) so a
// forecast row's node_id resolves correctly when ForecastSection's "preview
// impact radius" opens FlowCanvas against the live mock graph, and so
// Bharati/Maitri naturally show different systems, not copy-pasted numbers.
const RISK_FACTORS_BY_SUBTYPE: Record<string, string[]> = {
  generator: ['Elevated duty cycle vs. rated load', 'Bearing-wear vibration signature trending up'],
  chp: ['Elevated duty cycle vs. rated load', 'Combustion efficiency drifting down'],
  freezer: ['Door-seal degradation', 'Compressor short-cycling frequency up'],
  boiler: ['Filter differential pressure rising', 'Burner ignition delay lengthening'],
  ahu: ['Filter differential pressure rising', 'Fan vibration trend up'],
  vsat: ['Signal-to-noise ratio declining', 'Weather-correlated dropout pattern'],
  pistenbully: ['Cold-start cycle count elevated', 'Coolant temperature variance up'],
  seismograph: ['Data continuity gaps', 'Sensor calibration drift'],
  stp: ['Sludge pump cycling anomaly', 'Bioreactor temperature variance'],
  ro_plant: ['Membrane differential pressure rising', 'Output flow trending down'],
  desalination: ['Membrane differential pressure rising', 'Output flow trending down'],
  wastewater_tank: ['Level-sensor noise increasing'],
  radar: ['Data continuity gaps'],
  magnetometer: ['Sensor calibration drift'],
  aws: ['Sensor calibration drift'],
}

function riskFactorsFor(subtype: string | undefined): string[] {
  return RISK_FACTORS_BY_SUBTYPE[subtype ?? ''] ?? ['Health score trending down', 'Incident frequency above baseline']
}

function buildForecastSystems(): ForecastSystem[] {
  const sorted = [...mockNodes].sort((a, b) => a.healthScore - b.healthScore)
  const atRisk = sorted.filter((n) => n.healthScore < 90).slice(0, 8)
  const stable = sorted.filter((n) => n.healthScore >= 90).slice(0, 5)
  return [...atRisk, ...stable].map((n, i) => {
    const baseProb = (100 - n.healthScore) / 100
    const jitter = Math.sin(i * 1.7 + n.healthScore * 0.05) * 0.04
    const failureProbability = Math.max(0.02, Math.min(0.96, Math.round((baseProb + jitter) * 1000) / 1000))
    const riskLevel: ForecastSystem['risk_level'] = n.healthScore < 50 ? 'CRITICAL' : n.healthScore < 72 ? 'HIGH' : 'LOW'
    return {
      asset_id: n.id,
      asset_name: n.label,
      risk_level: riskLevel,
      failure_probability: failureProbability,
      current_health_score: n.healthScore,
      estimated_remaining_runtime_minutes: riskLevel === 'LOW' ? undefined : Math.round(n.healthScore * 34 + 260 + i * 53),
      confidence: Math.round((0.66 + ((i * 7) % 5) * 0.045) * 100) / 100,
      risk_factors: riskFactorsFor(n.subtype),
    }
  })
}

export const mockForecastSystems: ForecastSystem[] = buildForecastSystems()
