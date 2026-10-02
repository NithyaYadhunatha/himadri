// src/components/nodes/NodeCard.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Clock, RefreshCw, QrCode } from 'lucide-react'
import { HealthGauge } from '@/components/ui/HealthGauge'
import { Sparkline } from '@/components/ui/Sparkline'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { NodeHealth } from '@/types/nodes'
import type { BadgeVariant } from '@/types/common'
import { ASSET_CATEGORY_ABBREV, HEALTH_COLORS } from '@/lib/constants'
import { computeWeightedRisk, weightedRiskColor } from '@/lib/graph/riskWeighting'

interface NodeCardProps {
  node: NodeHealth
  onSelect: (node: NodeHealth) => void
  onRemediate: (nodeId: string) => Promise<void>
}

const healthVariant: Record<string, BadgeVariant> = {
  healthy: 'healthy',
  degraded: 'warning',
  critical: 'critical',
  unreachable: 'neutral',
}

const healthLabel: Record<string, string> = {
  healthy: 'Healthy',
  degraded: 'At Risk',
  critical: 'Critical',
  unreachable: 'Unreachable',
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  if (d > 0) return `${d}d ${h}h`
  return `${h}h`
}

function formatSync(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

export function NodeCard({ node, onSelect, onRemediate }: NodeCardProps) {
  const [remediating, setRemediating] = useState(false)
  const abbrev = ASSET_CATEGORY_ABBREV[node.type] ?? node.type.slice(0, 3).toUpperCase()
  const healthColor = HEALTH_COLORS[node.health] ?? '#626079'
  const sparkColor = healthColor
  const weightedRisk = computeWeightedRisk(node.healthScore, node.type)

  const borderStyle =
    node.health === 'critical'
      ? 'border-crimson/40 shadow-crimson-glow'
      : node.health === 'degraded'
      ? 'border-amber/30'
      : 'border-brand-border hover:border-white/20'

  const handleRemediate = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setRemediating(true)
    try {
      await onRemediate(node.id)
    } finally {
      setRemediating(false)
    }
  }

  return (
    <div
      onClick={() => onSelect(node)}
      className={`
        bg-brand-surface border rounded p-4 flex flex-col gap-3 cursor-pointer
        transition-all duration-200 hover:bg-brand-surface-2 animate-fade-in
        ${borderStyle}
        ${node.health === 'critical' ? 'bg-crimson/5' : ''}
      `}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(node)}
      aria-label={`Node ${node.name} — ${healthLabel[node.health]}`}
    >
      {/* Header row: avatar + name + badge */}
      <div className="flex items-start gap-3">
        {/* Type avatar */}
        <div
          className="w-10 h-10 rounded flex items-center justify-center shrink-0 font-mono text-[11px] font-bold"
          style={{
            backgroundColor: `${healthColor}18`,
            border: `1px solid ${healthColor}40`,
            color: healthColor,
          }}
        >
          {abbrev}
        </div>

        <div className="flex-1 min-w-0">
          <p
            className="font-sans text-sm font-semibold text-white leading-tight truncate"
            title={node.name}
          >
            {node.name}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="font-mono text-[10px] text-white/40 uppercase">{node.type}</span>
            {node.version && (
              <span className="font-mono text-[10px] text-white/25 border border-brand-border rounded px-1">
                {node.version.length > 14 ? node.version.slice(0, 14) + '…' : node.version}
              </span>
            )}
          </div>
        </div>

        {/* Incident count */}
        {node.incidents > 0 && (
          <div className="shrink-0 flex items-center gap-1 bg-crimson/10 border border-crimson/30 rounded px-1.5 py-0.5">
            <AlertCircle size={10} className="text-crimson" />
            <span className="font-mono text-[10px] text-crimson">{node.incidents}</span>
          </div>
        )}
      </div>

      {/* Health gauge + status */}
      <div className="flex flex-col items-center gap-2">
        <HealthGauge score={node.healthScore} size={72} label={healthLabel[node.health].toUpperCase()} />
        <Badge variant={healthVariant[node.health]} dot size="sm">
          {healthLabel[node.health]}
        </Badge>
        <span
          className="font-mono text-[9px]"
          title="Type-weighted risk (health score × node-type criticality) — not the backend's raw risk_score"
        >
          <span className="text-white/30">WEIGHTED RISK </span>
          <span style={{ color: weightedRiskColor(weightedRisk) }}>{weightedRisk.toFixed(0)}</span>
        </span>
      </div>

      {/* Sparkline */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider">24h trend</span>
          <span className="font-mono text-[9px]" style={{ color: healthColor }}>
            {node.healthScore}
          </span>
        </div>
        <Sparkline data={node.trend} color={sparkColor} height={28} />
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between text-[10px] font-mono">
        <div className="flex items-center gap-1 text-white/30">
          <Clock size={9} />
          <span>{formatSync(node.lastSync)}</span>
        </div>
        <div className="flex items-center gap-1 text-white/30">
          <RefreshCw size={9} />
          <span>{formatUptime(node.uptime)}</span>
        </div>
      </div>

      {/* Tags */}
      {node.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {node.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="font-mono text-[9px] text-white/30 border border-brand-border rounded px-1.5 py-0.5"
            >
              {tag}
            </span>
          ))}
          {node.tags.length > 3 && (
            <span className="font-mono text-[9px] text-white/20">+{node.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-2 pt-1 border-t border-brand-border">
        <Button
          variant={node.health === 'critical' ? 'danger' : 'secondary'}
          size="sm"
          loading={remediating}
          onClick={handleRemediate}
          className="flex-1"
          id={`remediate-${node.id}`}
        >
          Remediate
        </Button>
        <Link
          href={`/assets/${node.id}/passport`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded border border-brand-border text-white/40 hover:text-cyan hover:border-cyan/40 transition-colors"
          title="Open QR passport"
        >
          <QrCode size={13} />
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onSelect(node) }}
          className="shrink-0"
          id={`inspect-${node.id}`}
        >
          +
        </Button>
      </div>
    </div>
  )
}
