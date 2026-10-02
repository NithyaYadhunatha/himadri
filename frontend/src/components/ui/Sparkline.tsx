// src/components/ui/Sparkline.tsx
'use client'

import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import type { TimeSeriesPoint } from '@/types/common'

interface SparklineProps {
  data: TimeSeriesPoint[]
  color?: string
  height?: number
  className?: string
}

export function Sparkline({ data, color = '#1D1C93', height = 32, className = '' }: SparklineProps) {
  const chartData = data.map((d) => ({ v: d.value }))

  return (
    <div className={className} style={{ height, width: '100%', minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-${color.replace('#', '')})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
