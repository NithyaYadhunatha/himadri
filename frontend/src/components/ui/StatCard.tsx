// src/components/ui/StatCard.tsx
'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'
import type { HealthStatus } from '@/types/common'

interface StatCardProps {
  label: string
  value: string | number
  unit?: string
  trend?: number
  status?: HealthStatus
  description?: string
  className?: string
}

const statusBg: Record<HealthStatus, string> = {
  healthy: 'border-emerald/30 bg-emerald/5',
  degraded: 'border-amber/30 bg-amber/5',
  critical: 'border-crimson/30 bg-crimson/5',
  unreachable: 'border-white/10 bg-white/5',
}

const statusText: Record<HealthStatus, string> = {
  healthy: 'text-emerald',
  degraded: 'text-amber',
  critical: 'text-crimson',
  unreachable: 'text-white/62',
}

export function StatCard({ label, value, unit, trend, status, description, className = '' }: StatCardProps) {
  const borderStyle = status ? statusBg[status] : 'border-brand-border bg-brand-surface'
  const valueColor = status ? statusText[status] : 'text-white'

  return (
    <div className={`border rounded p-4 flex flex-col gap-1 ${borderStyle} ${className}`}>
      <p className="font-mono text-[10px] uppercase tracking-widest text-white/70">{label}</p>
      <div className="flex items-end gap-1.5">
        <span className={`font-mono font-bold text-2xl leading-none ${valueColor}`}>{value}</span>
        {unit && <span className="text-white/62 text-xs mb-0.5 font-mono">{unit}</span>}
      </div>
      {(trend !== undefined || description) && (
        <div className="flex items-center gap-1 mt-0.5">
          {trend !== undefined && (
            <span className={`flex items-center gap-0.5 text-xs font-mono ${trend >= 0 ? 'text-emerald' : 'text-crimson'}`}>
              {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {Math.abs(trend)}%
            </span>
          )}
          {description && <span className="text-white/55 text-xs">{description}</span>}
        </div>
      )}
    </div>
  )
}
