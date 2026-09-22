// src/app/api/remediation/recommendations/route.ts
//
// Derives asset-specific remediation actions from real blast radius + asset
// health/alert data. Falls back to static recommendations when the FastAPI
// backend is unavailable or USE_MOCK is set. Auth-gated to any ACTIVE member
// (not admin-only) because the NodeInspector showing recommendations is
// visible to every authenticated user who can see the asset.
//
// Unlike the old IT-stack version of this route, there's no universal
// cpu/memory/disk vocabulary to threshold against — Antarctic asset
// telemetry is heterogeneous per category (see backendAdapters.ts's header
// comment) — so recommendations here are derived from health score, open
// alert severity, and blast-radius size only, which apply to every category.
//
// Response: { actions: RemediationAction[] } sorted by rankScore desc.

import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'
import type { RemediationAction } from '@/types/nodes'
import type { BackendAlertDetail } from '@/lib/backendAdapters'

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true'
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000'
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? ''

interface BackendAssetDetail {
  id: string
  health_score: number
  status: string
}

interface BlastRadiusResponse {
  origin_asset_id?: string
  affected_count: number
  affected_assets?: Array<{ asset_id: string; depth: number }>
}

async function backendGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Backend ${res.status} ${path}`)
  return res.json() as Promise<T>
}

function deriveRecommendations(
  nodeId: string,
  healthScore: number,
  alerts: BackendAlertDetail[],
  affectedCount: number,
): RemediationAction[] {
  const actions: RemediationAction[] = []

  const criticalAlerts = alerts.filter((a) => a.severity === 'critical' || a.severity === 'emergency')

  if (criticalAlerts.length > 0) {
    actions.push({
      id: `ra-emergency-${nodeId}`,
      name: 'Run Guided Diagnosis',
      description: `${criticalAlerts.length} critical alert${criticalAlerts.length > 1 ? 's' : ''} open on this asset. Rank probable causes with a recommended check sequence.`,
      estimatedTime: '5 min',
      blastRadiusReduction: 55,
      rankScore: 92,
      historicalSuccessRate: 88,
    })
  }

  if (affectedCount >= 5) {
    actions.push({
      id: `ra-isolate-${nodeId}`,
      name: 'Escalate to Station Leader',
      description: `This asset has ${affectedCount} downstream dependents. Escalate before attempting remediation during an active fault.`,
      estimatedTime: '1 min',
      blastRadiusReduction: 40,
      rankScore: 87,
      historicalSuccessRate: 90,
    })
  } else if (affectedCount >= 2) {
    actions.push({
      id: `ra-failover-${nodeId}`,
      name: 'Switch Load / Failover',
      description: `Redirect load to a standby unit to protect the ${affectedCount} dependent asset${affectedCount > 1 ? 's' : ''} while the root cause is addressed.`,
      estimatedTime: '5 min',
      blastRadiusReduction: 60,
      rankScore: 82,
      historicalSuccessRate: 91,
    })
  }

  if (healthScore < 70) {
    actions.push({
      id: `ra-maintenance-${nodeId}`,
      name: 'Schedule Maintenance',
      description: `Health score at ${Math.round(healthScore)}. Log a maintenance window before the condition worsens.`,
      estimatedTime: '10 min',
      blastRadiusReduction: 25,
      rankScore: 70,
      historicalSuccessRate: 85,
    })
  }

  // Always include a baseline check
  actions.push({
    id: `ra-check-${nodeId}`,
    name: 'Log Daily Check',
    description: 'Record a manual reading/inspection to confirm current condition.',
    estimatedTime: '2 min',
    blastRadiusReduction: 10,
    rankScore: healthScore < 50 ? 65 : 40,
    historicalSuccessRate: 94,
  })

  const seen = new Set<string>()
  return actions
    .filter((a) => { const keep = !seen.has(a.id); seen.add(a.id); return keep })
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, 5)
}

const MOCK_ACTIONS: RemediationAction[] = [
  {
    id: 'ra-001',
    name: 'Run Guided Diagnosis',
    description: 'Rank probable causes with a recommended check sequence.',
    estimatedTime: '5 min',
    blastRadiusReduction: 40,
    rankScore: 78,
    historicalSuccessRate: 94,
  },
  {
    id: 'ra-002',
    name: 'Log Daily Check',
    description: 'Record a manual reading/inspection to confirm current condition.',
    estimatedTime: '2 min',
    blastRadiusReduction: 10,
    rankScore: 65,
    historicalSuccessRate: 87,
  },
]

export async function GET(req: Request) {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const nodeId = searchParams.get('nodeId')?.trim()

  if (!nodeId) {
    return NextResponse.json({ error: 'nodeId is required' }, { status: 400 })
  }

  if (USE_MOCK) {
    return NextResponse.json({ actions: MOCK_ACTIONS })
  }

  const [assetRes, alertsRes, blastRes] = await Promise.allSettled([
    backendGet<BackendAssetDetail>(`/assets/${nodeId}`),
    backendGet<BackendAlertDetail[]>(`/assets/${nodeId}/alerts`),
    backendGet<BlastRadiusResponse>(`/assets/${nodeId}/blast-radius`),
  ])

  const healthScore = assetRes.status === 'fulfilled' ? assetRes.value.health_score : 50
  const alerts = alertsRes.status === 'fulfilled' ? alertsRes.value.filter((a) => a.state === 'open' || a.state === 'acked') : []
  const affectedCount = blastRes.status === 'fulfilled' ? blastRes.value.affected_count : 0

  const actions = deriveRecommendations(nodeId, healthScore, alerts, affectedCount)
  return NextResponse.json({ actions })
}
