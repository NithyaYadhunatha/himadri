// src/types/nodes.ts

import type { HealthStatus, TimeSeriesPoint } from './common'
import type { NodeType } from './graph'

export interface NodeHealth {
  id: string
  name: string
  type: NodeType
  version: string
  health: HealthStatus
  healthScore: number // 0-100
  incidents: number
  lastSync: string
  uptime: number // seconds — operating hours for a generator/vehicle/instrument, meaningless (0) for a static asset like a tank
  stationId?: string
  tags: string[]
  trend: TimeSeriesPoint[] // last 24h sparkline data
  alerts: Array<{
    id: string
    message: string
    severity: 'critical' | 'warning' | 'info'
    timestamp: string
  }>
}

export interface NodeSummary {
  total: number
  critical: number
  atRisk: number
  healthy: number
  unreachable: number
  averageHealthScore: number
  lastUpdated: string
}

export interface NodeFiltersInput {
  health?: HealthStatus[]
  type?: NodeType[]
  sortBy?: 'risk' | 'name' | 'type' | 'utilization'
  sortDir?: 'asc' | 'desc'
  search?: string
}

export interface RemediationAction {
  id: string
  name: string
  description: string
  estimatedTime: string
  blastRadiusReduction: number // percentage
  rankScore: number
  historicalSuccessRate: number // 0-100
  runbookUrl?: string
}
