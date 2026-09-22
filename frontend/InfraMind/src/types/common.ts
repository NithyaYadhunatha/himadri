// src/types/common.ts

export type BadgeVariant = 'critical' | 'warning' | 'healthy' | 'info' | 'neutral'
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'unreachable'
export type ComplianceFramework = 'SOC2' | 'ISO27001' | '21CFR11' | 'HIPAA' | 'GxP'

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface TimeSeriesPoint {
  timestamp: string
  value: number
}

export interface MetricCard {
  label: string
  value: string | number
  unit?: string
  trend?: number
  status?: HealthStatus
}
