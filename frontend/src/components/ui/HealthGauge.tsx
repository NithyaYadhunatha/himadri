// src/components/ui/HealthGauge.tsx
'use client'

interface HealthGaugeProps {
  score: number // 0-100
  size?: number // px
  strokeWidth?: number
  showLabel?: boolean
  label?: string
}

function getColor(score: number): string {
  if (score >= 85) return '#0F8A6A' // emerald
  if (score >= 60) return '#D4820A' // amber
  return '#C23B3B' // crimson
}

export function HealthGauge({
  score,
  size = 80,
  strokeWidth = 6,
  showLabel = true,
  label,
}: HealthGaugeProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  // Arc from 135° to 45° (270° sweep)
  const sweepAngle = 270
  const arcLength = (circumference * sweepAngle) / 360
  const scoreArc = (arcLength * score) / 100
  const gap = circumference - arcLength
  const color = getColor(score)

  // Rotate so arc starts at bottom-left (135°)
  const rotation = 135

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-0">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#B3B0CE"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference - arcLength}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
        />
        {/* Score arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${scoreArc} ${circumference - scoreArc}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
          style={{
            filter: `drop-shadow(0 0 6px ${color}88)`,
            transition: 'stroke-dasharray 0.8s ease-out',
          }}
        />
      </svg>
      {/* Center label */}
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono font-bold leading-none"
            style={{ fontSize: size * 0.2, color }}
          >
            {score}
          </span>
          {label && (
            <span className="text-white/62 uppercase tracking-wider" style={{ fontSize: size * 0.1 }}>
              {label}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
