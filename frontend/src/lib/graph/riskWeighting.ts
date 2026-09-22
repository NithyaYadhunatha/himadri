// src/lib/graph/riskWeighting.ts
//
// Phase 10 Task 1 — per-NodeType risk weighting. Purely a derived/display-layer
// computation over the backend's existing health_score/risk_score: it does not
// change how the backend computes risk, it re-weights the same degraded score
// so that a critical node type (database, directory_auth) reads as higher risk
// than a lower-blast-radius type (monitoring_source) at the *same* raw score.
//
// Not yet wired into any page — Phase 10 Task 2 surfaces this wherever raw
// risk currently displays (node-health page, at-risk lists, Phase 8 panels).

import type { NodeType } from '@/types/graph'

/**
 * Multiplier applied to a node's raw risk (100 - healthScore) based on how
 * severe an outage of that node type typically is for the rest of the fleet.
 * 1.0 = no adjustment. Values above 1.0 amplify risk for types whose failure
 * tends to cascade (auth, data, network path); below 1.0 dampens risk for
 * types that are typically observational rather than load-bearing.
 */
export const NODE_TYPE_RISK_WEIGHT: Record<NodeType, number> = {
  // Power loss cascades into heating/water/medical/comms within hours in
  // Antarctic winter — the single highest-consequence category.
  power: 1.35,
  // Losing heat is a life-safety event almost as fast as losing power.
  heating: 1.3,
  medical: 1.25,
  water: 1.15,
  waste: 1.0,
  comms: 1.15,
  structure: 1.05,
  vehicle: 1.05,
  storage: 1.1,
  instrument: 0.85,
  custom: 1.0,
}

export function getRiskWeight(type: NodeType): number {
  return NODE_TYPE_RISK_WEIGHT[type] ?? 1.0
}

/**
 * Weighted risk score (0-100, higher = riskier) for a node, derived from its
 * raw healthScore (0-100, higher = healthier) and type. Clamped to [0, 100]
 * so an amplified score on an already-critical node doesn't overflow the
 * display scale.
 */
export function computeWeightedRisk(healthScore: number, type: NodeType): number {
  const rawRisk = 100 - healthScore
  const weighted = rawRisk * getRiskWeight(type)
  return Math.round(Math.min(100, Math.max(0, weighted)) * 100) / 100
}

/**
 * Display color for a weighted risk value (0-100, higher = riskier) —
 * shared across the node-health page, at-risk lists, and node inspector so
 * the weighted-risk badge reads consistently wherever it's surfaced.
 */
export function weightedRiskColor(weightedRisk: number): string {
  if (weightedRisk >= 50) return '#EF4444' // crimson — critical
  if (weightedRisk >= 20) return '#F59E0B' // amber — at risk
  return '#10B981' // emerald — healthy
}
