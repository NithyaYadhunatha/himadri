'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, ReferenceLine,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import {
  Target, CheckCircle, AlertTriangle,
  ChevronLeft, ChevronRight, RefreshCw, Cpu,
  Activity, Zap, Shield, Clock, BarChart2, Waypoints,
} from 'lucide-react'
import { HealthGauge } from '@/components/ui/HealthGauge'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { CardSkeleton, Skeleton, ErrorState } from '@/components/ui/Loader'
import { FlowCanvas } from '@/components/graph/FlowCanvas'
import { graphService } from '@/services/graph.service'
import { modelAccuracyService } from '@/services/modelAccuracy.service'
import type { AccuracyMetrics, PredictionRecord, DriftMetrics, ForecastResponse, ForecastSystem } from '@/lib/mockData/mockModelAccuracy'
import type { GraphNode, GraphEdge } from '@/types/graph'
import type { BadgeVariant } from '@/types/common'

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function DarkTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; name?: string; color?: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(247, 251, 253,0.98)',
      border: '1px solid rgba(31, 158, 109,0.2)',
      borderRadius: 8,
      padding: '8px 12px',
      boxShadow: '0 0 20px rgba(31, 158, 109,0.1)',
      backdropFilter: 'blur(12px)',
    }} className="text-xs font-mono">
      {label && <p className="text-white/50 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color ?? '#1868A0' }}>
          {p.name ? `${p.name}: ` : ''}{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
          {p.name === 'Accuracy' || (!p.name && !label?.includes('Imp')) ? '%' : ''}
        </p>
      ))}
    </div>
  )
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────
function StatPill({ label, value, unit, color = '#1868A0', icon }: {
  label: string; value: string | number; unit?: string; color?: string; icon?: React.ReactNode
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl transition-all duration-300 hover:-translate-y-0.5"
         style={{
           background: 'linear-gradient(135deg, rgba(22, 40, 58,0.04) 0%, rgba(22, 40, 58,0.01) 100%)',
           border: `1px solid ${color}25`,
           padding: '16px',
           backdropFilter: 'blur(10px)',
           boxShadow: `0 4px 20px -2px rgba(0,0,0,0.2)`,
         }}>
      {/* Top glowing edge */}
      <div className="absolute top-0 left-0 right-0 h-[1px] opacity-40 group-hover:opacity-100 transition-opacity duration-500"
           style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      
      {/* Icon and label */}
      <div className="flex items-center gap-2.5 mb-3">
        {icon && (
          <div className="p-1.5 rounded-lg flex items-center justify-center transition-colors duration-300 group-hover:bg-opacity-20"
               style={{ background: `${color}15`, color }}>
            {icon}
          </div>
        )}
        <span className="font-mono text-[10px] text-white/50 uppercase tracking-widest">{label}</span>
      </div>
      
      {/* Value */}
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-bold tracking-tight transition-all duration-300 group-hover:brightness-125" style={{ color }}>{value}</span>
        {unit && <span className="font-mono text-[11px] text-white/40">{unit}</span>}
      </div>
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function SectionCard({ children, className = '', glow = false }: {
  children: React.ReactNode; className?: string; glow?: boolean
}) {
  return (
    <div
      className={`group relative rounded-2xl p-6 transition-all duration-500 hover:border-white/10 ${className}`}
      style={{
        background: 'linear-gradient(135deg, rgba(22, 40, 58,0.03) 0%, rgba(247, 251, 253,0.5) 100%)',
        border: '1px solid rgba(22, 40, 58,0.05)',
        backdropFilter: 'blur(20px)',
        boxShadow: glow 
          ? '0 8px 32px rgba(31, 158, 109,0.08), inset 0 1px 0 rgba(22, 40, 58,0.05)' 
          : '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(22, 40, 58,0.05)',
      }}
    >
      <div className="absolute top-0 left-1/4 right-1/4 h-[1px] opacity-30 transition-opacity duration-500 group-hover:opacity-100"
           style={{ background: 'linear-gradient(90deg, transparent, rgba(31, 158, 109,0.6), transparent)' }} />
      {children}
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, subtitle, badge }: {
  icon: React.ReactNode; title: string; subtitle?: string; badge?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl"
             style={{
               background: 'linear-gradient(135deg, rgba(31, 158, 109,0.1) 0%, rgba(31, 158, 109,0.02) 100%)',
               border: '1px solid rgba(31, 158, 109,0.2)',
               color: '#1868A0',
               boxShadow: 'inset 0 0 12px rgba(31, 158, 109,0.05)'
             }}>
          {icon}
        </div>
        <div>
          <h2 className="font-mono text-xs font-semibold text-white/90 uppercase tracking-[0.2em]">{title}</h2>
          {subtitle && <p className="text-white/40 text-[10px] font-sans mt-1 tracking-wide">{subtitle}</p>}
        </div>
      </div>
      {badge}
    </div>
  )
}

// ─── Accuracy Section ─────────────────────────────────────────────────────────
function AccuracySection({ metrics }: { metrics: AccuracyMetrics }) {
  const chartData = (metrics.trend30d || []).map((d, i) => ({
    day: i === 0 ? 'D-30' : i === 7 ? 'D-23' : i === 14 ? 'D-15' : i === 21 ? 'D-7' : i === 29 ? 'Today' : '',
    value: parseFloat(d.value.toFixed(1)),
  }))

  const accuracy = metrics.classification?.accuracy || 0
  const isAboveTarget = accuracy >= 85
  const color = accuracy >= 85 ? '#1F9E6D' : accuracy >= 60 ? '#B8720F' : '#B23A2E'

  return (
    <SectionCard glow>
      <SectionHeader
        icon={<Target size={16} />}
        title="Model Accuracy"
        subtitle="30-day rolling performance window"
        badge={
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{
            background: isAboveTarget ? 'rgba(31, 158, 109,0.1)' : 'rgba(178, 58, 46,0.1)',
            border: `1px solid ${isAboveTarget ? 'rgba(31, 158, 109,0.3)' : 'rgba(178, 58, 46,0.3)'}`,
          }}>
            {isAboveTarget
              ? <CheckCircle size={11} style={{ color: '#1F9E6D' }} />
              : <AlertTriangle size={11} style={{ color: '#B23A2E' }} />}
            <span className="font-mono text-[10px]" style={{ color: isAboveTarget ? '#1F9E6D' : '#B23A2E' }}>
              {isAboveTarget ? 'Above Target' : 'Below Target'}
            </span>
          </div>
        }
      />

      {/* Hero Layout: Left Stats | CENTER GAUGES | Right Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center mb-6">
        
        {/* Left Side: Precision & Recall */}
        <div className="space-y-3">
          <StatPill label="Precision" value={metrics.classification?.precision.toFixed(1) ?? 0} unit="%" color="#1868A0" icon={<Target size={11} />} />
          <StatPill label="Recall" value={metrics.classification?.recall.toFixed(1) ?? 0} unit="%" color="#1F9E6D" icon={<Activity size={11} />} />
        </div>

        {/* Centerpiece: Prominent Accuracy Gauge */}
        <div className="flex flex-col items-center justify-center p-8 rounded-3xl relative overflow-hidden transition-all duration-500 hover:shadow-2xl" style={{
          background: `radial-gradient(circle at center, ${color}15 0%, rgba(247, 251, 253,0.5) 100%)`,
          border: `1px solid ${color}30`,
          boxShadow: `0 0 50px ${color}10, inset 0 0 20px ${color}05`,
          backdropFilter: 'blur(16px)',
        }}>
          {/* Subtle animated background pulse */}
          <div className="absolute inset-0 opacity-20 animate-pulse pointer-events-none" 
               style={{ background: `radial-gradient(circle at center, ${color}30 0%, transparent 70%)` }} />
               
          <div style={{
            position: 'absolute', top: 0, left: '15%', right: '15%', height: 1,
            background: `linear-gradient(90deg, transparent, ${color}AA, transparent)`,
          }} />

          {/* Gauge Center */}
          <div className="relative p-2 z-10">
            <HealthGauge score={Math.round(accuracy)} size={160} strokeWidth={8} label="ACCURACY" />
          </div>

          <div className="flex items-center gap-4 mt-4 px-4 py-2 rounded-full z-10 backdrop-blur-md" 
               style={{ background: 'rgba(217, 233, 242,0.6)', border: '1px solid rgba(22, 40, 58,0.08)' }}>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] text-white/40 uppercase tracking-wider">Current:</span>
              <span className="font-mono text-sm font-bold" style={{ color }}>{accuracy.toFixed(1)}%</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-white/20" />
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] text-white/40 uppercase tracking-wider">Target:</span>
              <span className="font-mono text-sm font-bold text-emerald-400">85%</span>
            </div>
          </div>
        </div>

        {/* Right Side: F1 Score & MAE */}
        <div className="space-y-3">
          <StatPill label="F1 Score" value={metrics.classification?.f1.toFixed(1) ?? 0} unit="%" color="#A78BFA" icon={<Zap size={11} />} />
          <StatPill label="MAE" value={metrics.runtime_prediction?.mae_minutes.toFixed(1) ?? 0} unit="min" color="#B8720F" icon={<Clock size={11} />} />
        </div>

      </div>

      {/* Bottom Area: 30-Day Accuracy Trend Chart */}
      {chartData.length > 0 && (
        <div className="pt-5 border-t border-white/5 w-full min-w-0">
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest">30-Day Accuracy Trend</p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div style={{ width: 16, height: 2, background: color, borderRadius: 1 }} />
                <span className="font-mono text-[10px] text-white/40">Accuracy Trend</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div style={{ width: 16, height: 2, borderTop: '2px dashed #B8720F', opacity: 0.8 }} />
                <span className="font-mono text-[10px] text-white/40">Target (85%)</span>
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={170} minWidth={0} minHeight={0}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                tick={{ fill: '#16283A66', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#16283A66', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip content={<DarkTooltip />} />
              <ReferenceLine y={85} stroke="#B8720F" strokeDasharray="4 4" strokeOpacity={0.7} />
              <Area
                type="monotone"
                dataKey="value"
                name="Accuracy"
                stroke={color}
                strokeWidth={2.5}
                fill="url(#accGrad)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

    </SectionCard>
  )
}

// ─── Impact Radius Preview Modal ────────────────────────────────────────────
// Opened from a critical/high-risk row in the forecast table below — shows
// the CURRENT live topology (not a hypothetical) with that node selected, so
// an operator can see its dependency chain (cyan — what it needs) and blast
// radius (amber — what breaks if it fails) before deciding how urgently to
// act. Reuses FlowCanvas as-is (same component Station Twin
// use) rather than a bespoke preview renderer — it already computes and
// highlights both chains from a single `selectedNodeId` prop.
function ImpactPreviewModal({ system, onClose }: { system: ForecastSystem; onClose: () => void }) {
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    graphService.getLiveGraph()
      .then((g) => { if (!cancelled) setGraph({ nodes: g.nodes, edges: g.edges }) })
      .catch(() => { if (!cancelled) setError('Failed to load the current topology.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const nodeExists = graph?.nodes.some((n) => n.id === system.asset_id) ?? false
  const riskColor = system.risk_level === 'CRITICAL' ? '#B23A2E' : '#B8720F'

  return (
    <Dialog open onClose={onClose} title="Impact Radius Preview" width="max-w-4xl">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-sans text-sm text-white font-semibold">{system.asset_name}</h3>
            <p className="font-mono text-[9px] text-white/30 mt-0.5">{system.asset_id}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={system.risk_level === 'CRITICAL' ? 'critical' : 'warning'} size="sm">{system.risk_level}</Badge>
            <span className="font-mono text-xs font-semibold" style={{ color: riskColor }}>
              {(system.failure_probability * 100).toFixed(1)}% failure prob.
            </span>
          </div>
        </div>

        {loading ? (
          <div className="h-[480px] flex items-center justify-center">
            <Skeleton height="h-full" />
          </div>
        ) : error ? (
          <ErrorState message={error} />
        ) : !nodeExists ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-white/30 font-mono text-xs">
              This system isn&apos;t present in the current live topology (may have been removed or renamed).
            </p>
          </div>
        ) : (
          <>
            <div className="h-[480px] w-full rounded border border-brand-border overflow-hidden">
              <FlowCanvas
                nodes={graph!.nodes}
                edges={graph!.edges}
                selectedNodeId={system.asset_id}
                readOnly
                showLegend
                colorMode="health"
              />
            </div>
            <p className="text-[10px] font-sans text-white/40 leading-relaxed">
              Current node layout, centered on <span className="text-white/70">{system.asset_name}</span>. Cyan nodes are its
              upstream dependencies (what it needs to function); amber nodes are its blast radius — everything downstream
              that would be impacted if this system fails.
            </p>
          </>
        )}
      </div>
    </Dialog>
  )
}

// ─── Forecast Section ─────────────────────────────────────────────────────────
function ForecastSection({ forecast, onSelectSystem }: { forecast: ForecastResponse; onSelectSystem: (sys: ForecastSystem) => void }) {
  if (forecast.model_version === 'None' || !forecast.systems || forecast.systems.length === 0) {
    return (
      <SectionCard>
        <SectionHeader icon={<Cpu size={16} />} title="System Failure Forecast" subtitle="ML-powered 24h prediction horizon" />
        <div className="flex items-center justify-center py-10 gap-3">
          <BarChart2 size={24} className="text-white/20" />
          <p className="text-white/30 font-mono text-sm">Insufficient data — need more historical records to generate reliable forecasts.</p>
        </div>
      </SectionCard>
    )
  }

  const highRisk = forecast.systems.filter(s => s.risk_level === 'CRITICAL' || s.risk_level === 'HIGH')
  const stable = forecast.systems.filter(s => s.risk_level === 'LOW')

  const riskColor = (level: string) =>
    level === 'CRITICAL' ? '#B23A2E' : level === 'HIGH' ? '#B8720F' : '#1F9E6D'

  return (
    <div className="space-y-4">
      {/* Critical / High Risk */}
      <SectionCard>
        <SectionHeader
          icon={<AlertTriangle size={16} />}
          title="Predicted System Failures"
          subtitle="Systems at HIGH or CRITICAL risk within 24 hours"
          badge={
            highRisk.length > 0 ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{
                background: 'rgba(178, 58, 46,0.12)',
                border: '1px solid rgba(178, 58, 46,0.3)',
              }}>
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                <span className="font-mono text-[10px] text-red-400">{highRisk.length} SYSTEMS AT RISK</span>
              </div>
            ) : undefined
          }
        />

        {highRisk.length === 0 ? (
          <div className="flex items-center gap-3 py-5">
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(31, 158, 109,0.1)',
              border: '1px solid rgba(31, 158, 109,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shield size={18} style={{ color: '#1F9E6D' }} />
            </div>
            <p className="text-white/50 font-mono text-xs">All systems nominal — no high risk predictions in the next 24 hours.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-[1.8fr_0.8fr_1fr_1.4fr_0.8fr_2fr] gap-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(22, 40, 58,0.03)' }}>
              {['System', 'Risk', 'Failure Prob', 'Predicted Lifetime(Days)', 'Confidence', 'Risk Factors'].map(h => (
                <span key={h} className="font-mono text-[9px] text-white/30 uppercase tracking-widest">{h}</span>
              ))}
            </div>
            {highRisk.map((sys) => (
              <div key={sys.asset_id} onClick={() => onSelectSystem(sys)}
                title="Click to preview current topology & impact radius"
                className="grid grid-cols-[1.8fr_0.8fr_1fr_1.4fr_0.8fr_2fr] gap-3 px-3 py-3 rounded-lg items-center transition-colors cursor-pointer hover:brightness-125"
                style={{ background: `rgba(${sys.risk_level === 'CRITICAL' ? '239,68,68' : '245,158,11'},0.04)`, border: `1px solid rgba(${sys.risk_level === 'CRITICAL' ? '239,68,68' : '245,158,11'},0.12)` }}>
                <div className="flex items-center gap-1.5">
                  <Waypoints size={11} className="text-white/25 shrink-0" />
                  <div>
                    <p className="text-xs font-sans text-white font-semibold leading-tight">{sys.asset_name}</p>
                    <p className="font-mono text-[9px] text-white/30 mt-0.5">{sys.asset_id}</p>
                  </div>
                </div>
                <div>
                  <Badge variant={sys.risk_level === 'CRITICAL' ? 'critical' : 'warning'} size="sm">{sys.risk_level}</Badge>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-sm font-bold" style={{ color: riskColor(sys.risk_level) }}>
                    {(sys.failure_probability * 100).toFixed(1)}%
                  </span>
                  <div className="h-1 rounded-full" style={{ background: 'rgba(22, 40, 58,0.08)', width: '80%' }}>
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(sys.failure_probability * 100, 100)}%`,
                      background: `linear-gradient(90deg, ${riskColor(sys.risk_level)}, ${riskColor(sys.risk_level)}88)`,
                    }} />
                  </div>
                </div>
                <div className="font-mono text-sm text-white">
                  {sys.estimated_remaining_runtime_minutes
                    ? (sys.estimated_remaining_runtime_minutes / 1440).toFixed(0)
                    : 'N/A'}
                </div>
                <div className="font-mono text-sm text-white/70">
                  {sys.confidence ? (sys.confidence * 100).toFixed(0) + '%' : 'N/A'}
                </div>
                <div className="flex flex-wrap gap-1">
                  {sys.risk_factors.map((rf, i) => (
                    <span key={i} className="font-mono text-[9px] px-2 py-0.5 rounded-full" style={{
                      background: 'rgba(178, 58, 46,0.1)',
                      border: '1px solid rgba(178, 58, 46,0.2)',
                      color: '#FCA5A5',
                    }}>{rf}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Stable Systems */}
      <SectionCard>
        <SectionHeader
          icon={<Shield size={16} />}
          title="Expected Stable Systems"
          subtitle="Low risk — no predicted failures"
          badge={
            stable.length > 0 ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{
                background: 'rgba(31, 158, 109,0.1)',
                border: '1px solid rgba(31, 158, 109,0.25)',
              }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="font-mono text-[10px] text-emerald-400">{stable.length} STABLE</span>
              </div>
            ) : undefined
          }
        />

        {stable.length === 0 ? (
          <p className="text-white/30 font-mono text-xs py-3">No stable systems found.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1.8fr_0.8fr_1fr_1.4fr_0.8fr] gap-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(22, 40, 58,0.03)' }}>
              {['System', 'Health', 'Failure Prob', 'Predicted Lifetime(Days)', 'Confidence'].map(h => (
                <span key={h} className="font-mono text-[9px] text-white/30 uppercase tracking-widest">{h}</span>
              ))}
            </div>
            {stable.map((sys) => (
              <div key={sys.asset_id} className="grid grid-cols-[1.8fr_0.8fr_1fr_1.4fr_0.8fr] gap-3 px-3 py-3 rounded-lg items-center"
                style={{ background: 'rgba(31, 158, 109,0.03)', border: '1px solid rgba(31, 158, 109,0.08)' }}>
                <div>
                  <p className="text-xs font-sans text-white font-semibold">{sys.asset_name}</p>
                  <p className="font-mono text-[9px] text-white/30 mt-0.5">{sys.asset_id}</p>
                </div>
                <div className="font-mono text-sm" style={{ color: '#1F9E6D' }}>{sys.current_health_score}</div>
                <div className="font-mono text-sm text-white/70">{(sys.failure_probability * 100).toFixed(1)}%</div>
                <div className="font-mono text-sm" style={{ color: '#1F9E6D' }}>
                  {sys.estimated_remaining_runtime_minutes ? (sys.estimated_remaining_runtime_minutes / 1440).toFixed(0) : 'Stable'}
                </div>
                <div className="font-mono text-sm text-white/70">
                  {sys.confidence ? (sys.confidence * 100).toFixed(0) + '%' : 'N/A'}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ─── Predictions Table ─────────────────────────────────────────────────────────
// Covers both this page's own mock outcome vocabulary (accurate/acceptable/
// inaccurate) and the real backend's ml_prediction_outcomes enum (CORRECT/
// EARLY/LATE/FALSE_POSITIVE/FALSE_NEGATIVE/NO_FAILURE — see
// PredictionRecord['outcome']'s comment). Real-mode rows used to fall
// through this lookup entirely (undefined variant silently defaulting to
// Badge's neutral gray for every outcome, good or bad) since none of their
// values matched the mock-only keys below.
const outcomeBadge: Record<PredictionRecord['outcome'], BadgeVariant> = {
  accurate: 'healthy',
  acceptable: 'warning',
  inaccurate: 'critical',
  CORRECT: 'healthy',
  EARLY: 'info',
  LATE: 'warning',
  FALSE_POSITIVE: 'warning',
  FALSE_NEGATIVE: 'critical',
  NO_FAILURE: 'neutral',
}

function PredictionsTable({
  predictions, total, page, onPageChange, loading,
}: {
  predictions: PredictionRecord[]
  total: number
  page: number
  onPageChange: (p: number) => void
  loading: boolean
}) {
  const pageSize = 8
  const totalPages = Math.ceil(total / pageSize)

  return (
    <SectionCard>
      <div className="flex items-center justify-between mb-5">
        <SectionHeader
          icon={<BarChart2 size={16} />}
          title="Prediction vs Actuals"
          subtitle={`${total} prediction records`}
        />
        <div className="flex items-center gap-2 -mt-5">
          <span className="font-mono text-[10px] text-white/30">
            Page {page} / {totalPages || 1}
          </span>
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-1.5 rounded-lg text-white/40 hover:text-white disabled:opacity-30 transition-colors"
            style={{ background: 'rgba(22, 40, 58,0.05)', border: '1px solid rgba(22, 40, 58,0.08)' }}
          >
            <ChevronLeft size={13} />
          </button>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1.5 rounded-lg text-white/40 hover:text-white disabled:opacity-30 transition-colors"
            style={{ background: 'rgba(22, 40, 58,0.05)', border: '1px solid rgba(22, 40, 58,0.08)' }}
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-0 rounded-lg mb-1 px-4 py-2" style={{ background: 'rgba(22, 40, 58,0.03)' }}>
        {['Scenario', 'Predicted', 'Actual', 'Deviation', 'Outcome'].map((h) => (
          <div key={h}>
            <span className="font-mono text-[9px] text-white/30 uppercase tracking-widest">{h}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2 mt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="h-12" />
          ))}
        </div>
      ) : (
        <div className="space-y-1 mt-1">
          {predictions.map((pred) => {
            const devColor = pred.deviationPct > 30 ? '#B23A2E' : pred.deviationPct > 10 ? '#B8720F' : '#1F9E6D'
            return (
              <div
                key={pred.id}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-0 rounded-lg px-4 py-3 items-center transition-all hover:scale-[1.002]"
                style={{ background: 'rgba(22, 40, 58,0.02)', border: '1px solid rgba(22, 40, 58,0.04)' }}
              >
                <div>
                  <p className="text-xs font-sans text-white font-medium leading-tight line-clamp-1">{pred.scenario}</p>
                  <p className="font-mono text-[9px] text-white/30 mt-0.5">
                    {new Date(pred.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center">
                  <span className="font-mono text-sm text-white">
                    {pred.predictedValue} <span className="text-white/30 text-[10px]">{pred.unit}</span>
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="font-mono text-sm text-white">
                    {pred.actualValue} <span className="text-white/30 text-[10px]">{pred.unit}</span>
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="font-mono text-sm font-semibold" style={{ color: devColor }}>
                    {pred.deviation > 0 ? '+' : ''}{pred.deviation.toFixed(1)}
                    <span className="text-[9px] ml-0.5 opacity-70">({pred.deviationPct.toFixed(0)}%)</span>
                  </span>
                </div>
                <div>
                  <Badge variant={outcomeBadge[pred.outcome]} size="sm">{pred.outcome}</Badge>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

// ─── Drift Section ────────────────────────────────────────────────────────────
function DriftSection({ drift, onRetrain }: {
  drift: DriftMetrics
  onRetrain: () => Promise<void>
}) {
  const [retraining, setRetraining] = useState(false)

  const handleRetrain = async () => {
    setRetraining(true)
    try { await onRetrain() } finally { setRetraining(false) }
  }

  const driftColor =
    drift.driftStatus === 'critical' ? '#B23A2E' :
      drift.driftStatus === 'warning' ? '#B8720F' : '#1F9E6D'

  const chartData = drift.featureImportance.map((f) => ({
    name: f.feature,
    importance: f.importance,
    drift: f.drift,
  }))

  return (
    <SectionCard>
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `${driftColor}18`,
            border: `1px solid ${driftColor}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: driftColor,
          }}>
            <Activity size={16} />
          </div>
          <div>
            <p className="font-mono text-[10px] text-white/50 uppercase tracking-widest">Model Drift Detection</p>
            <p className="text-white/30 text-[10px] font-sans mt-0.5">
              Last retrained: {new Date(drift.lastRetrainedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="font-mono text-3xl font-bold" style={{ color: driftColor, textShadow: `0 0 20px ${driftColor}55` }}>
              {drift.driftScore}
            </p>
            <p className="font-mono text-[9px] text-white/40 uppercase tracking-widest">Drift Score</p>
          </div>
          <Badge
            variant={drift.driftStatus === 'critical' ? 'critical' : drift.driftStatus === 'warning' ? 'warning' : 'healthy'}
            dot
          >
            {drift.driftStatus}
          </Badge>
        </div>
      </div>

      {drift.driftAlert && (
        <div className="rounded-xl p-4 mb-5 flex items-start gap-3" style={{
          background: 'rgba(184, 114, 15,0.06)',
          border: '1px solid rgba(184, 114, 15,0.25)',
        }}>
          <AlertTriangle size={14} style={{ color: '#B8720F', marginTop: 1, flexShrink: 0 }} />
          <p className="text-xs font-sans" style={{ color: 'rgba(22, 40, 58,0.75)' }}>{drift.driftAlert}</p>
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-6 items-start">
        <div className="w-full min-w-0">
          <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-3">Feature Importance & Drift</p>
          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-1.5">
              <div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(31, 158, 109,0.7)' }} />
              <span className="font-mono text-[10px] text-white/40">Importance</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(178, 58, 46,0.6)' }} />
              <span className="font-mono text-[10px] text-white/40">Drift %</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={190} minWidth={0} minHeight={0}>
            <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <XAxis
                type="number"
                domain={[0, 40]}
                tick={{ fill: '#16283A44', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={130}
                tick={{ fill: '#16283AAA', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<DarkTooltip />} />
              <Bar dataKey="importance" name="Importance" fill="#1868A0" fillOpacity={0.75} radius={[0, 3, 3, 0]} barSize={8} />
              <Bar dataKey="drift" name="Drift" fill="#B23A2E" fillOpacity={0.65} radius={[0, 3, 3, 0]} barSize={8} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="w-52 space-y-3">
          <div className="rounded-xl p-4 space-y-3" style={{
            background: 'rgba(22, 40, 58,0.03)',
            border: '1px solid rgba(22, 40, 58,0.07)',
          }}>
            <p className="font-mono text-[9px] text-white/40 uppercase tracking-widest">Retraining Status</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: driftColor, boxShadow: `0 0 6px ${driftColor}` }} />
              <span className="font-mono text-[10px] text-white/70 capitalize">{drift.driftStatus}</span>
            </div>
            <p className="text-[10px] text-white/40 font-sans leading-relaxed">
              {drift.retrainingRecommended
                ? 'Retraining recommended based on drift score and prediction accuracy.'
                : 'Model is stable. No retraining required at this time.'}
            </p>
          </div>
          <Button
            variant={drift.retrainingRecommended ? 'primary' : 'secondary'}
            size="sm"
            loading={retraining}
            icon={<RefreshCw size={12} />}
            onClick={handleRetrain}
            className="w-full"
            id="trigger-retrain-btn"
          >
            {drift.retrainingRecommended ? 'Retrain Now' : 'Force Retrain'}
          </Button>
        </div>
      </div>
    </SectionCard>
  )
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────
function KPIStrip({ metrics, forecast }: { metrics: AccuracyMetrics; forecast: ForecastResponse | null }) {
  const accuracy = metrics.classification?.accuracy || 0
  const highRiskCount = forecast?.systems?.filter(s => s.risk_level === 'CRITICAL' || s.risk_level === 'HIGH').length ?? 0
  const stableCount = forecast?.systems?.filter(s => s.risk_level === 'LOW').length ?? 0

  const kpis = [
    { label: 'Overall Accuracy', value: `${accuracy.toFixed(1)}%`, color: accuracy >= 85 ? '#1F9E6D' : '#B23A2E', icon: <Target size={16} /> },
    { label: 'High Risk Systems', value: String(highRiskCount), color: highRiskCount > 0 ? '#B23A2E' : '#1F9E6D', icon: <AlertTriangle size={16} /> },
    { label: 'Stable Systems', value: String(stableCount), color: '#1F9E6D', icon: <Shield size={16} /> },
    { label: 'F1 Score', value: `${metrics.classification?.f1.toFixed(1) ?? 0}%`, color: '#A78BFA', icon: <Zap size={16} /> },
    { label: 'Model Version', value: metrics.model_version, color: '#1868A0', icon: <Cpu size={16} /> },
  ]

  return (
    <div className="grid grid-cols-5 gap-4">
      {kpis.map((k) => (
        <div key={k.label} className="group relative rounded-2xl p-5 flex flex-col gap-3 transition-all duration-300 hover:-translate-y-1" style={{
          background: 'linear-gradient(135deg, rgba(22, 40, 58,0.03) 0%, rgba(22, 40, 58,0.01) 100%)',
          border: `1px solid ${k.color}25`,
          boxShadow: `0 8px 24px -4px ${k.color}10`,
          backdropFilter: 'blur(12px)',
        }}>
          <div className="absolute top-0 left-0 right-0 h-[1px] opacity-40 group-hover:opacity-100 transition-opacity duration-500"
               style={{ background: `linear-gradient(90deg, transparent, ${k.color}88, transparent)` }} />
          
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg flex items-center justify-center transition-colors duration-300 group-hover:bg-opacity-20"
                 style={{ background: `${k.color}15`, color: k.color }}>
              {k.icon}
            </div>
            <span className="font-mono text-[9px] text-white/50 uppercase tracking-widest leading-tight">{k.label}</span>
          </div>
          
          <span className="font-mono text-2xl font-bold tracking-tight transition-all duration-300 group-hover:brightness-125" style={{ color: k.color }}>
            {k.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PredictiveMaintenancePage() {
  const [metrics, setMetrics] = useState<AccuracyMetrics | null>(null)
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [predictions, setPredictions] = useState<PredictionRecord[]>([])
  const [total, setTotal] = useState(0)
  const [drift, setDrift] = useState<DriftMetrics | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [tableLoading, setTableLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewSystem, setPreviewSystem] = useState<ForecastSystem | null>(null)

  const loadAll = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)
    setError(null)
    try {
      const [m, p, d, f] = await Promise.all([
        modelAccuracyService.getAccuracyMetrics(),
        modelAccuracyService.getPredictions(1, 8),
        modelAccuracyService.getDriftMetrics(),
        modelAccuracyService.getForecast(),
      ])
      setMetrics(m)
      setForecast(f)
      setPredictions(p.data)
      setTotal(p.total)
      setDrift(d)
      setPage(1)
    } catch {
      setError('Failed to load predictive maintenance data')
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [])

  const loadPage = useCallback(async (p: number) => {
    setPage(p)
    setTableLoading(true)
    const res = await modelAccuracyService.getPredictions(p, 8)
    setPredictions(res.data)
    setTotal(res.total)
    setTableLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const handleRetrain = async () => {
    await modelAccuracyService.triggerRetrain()
  }

  return (
    <div className="h-screen overflow-y-auto" style={{ background: 'transparent' }}>
      <div className="px-6 py-5 max-w-[1600px] mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan/50" />
              <span className="font-mono text-[9px] text-white/30 uppercase tracking-[0.2em]">Station Twin</span>
              <span className="text-white/20 text-[9px] mx-1">/</span>
              <span className="font-mono text-[9px] text-cyan/80 uppercase tracking-[0.2em] font-semibold">Predictive Maintenance</span>
            </div>
            <h1 className="font-mono font-bold tracking-tight mb-2" style={{
              fontSize: 28,
              background: 'linear-gradient(to right, #16283A, #1868A0)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 0 40px rgba(31, 158, 109, 0.2)'
            }}>
              Predictive Maintenance
            </h1>
            <p className="text-white/40 text-xs font-sans tracking-wide">
              ML-powered failure forecasting • weekly model retraining • 24h prediction horizon
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Live badge */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-full" style={{
              background: 'rgba(31, 158, 109,0.08)',
              border: '1px solid rgba(31, 158, 109,0.2)',
            }}>
              <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
              <span className="font-mono text-[10px] text-cyan/70 uppercase tracking-widest">Weekly Retrain Active</span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={12} />}
              onClick={() => loadAll(false)}
              id="refresh-accuracy-btn"
            >
              Refresh
            </Button>
          </div>
        </div>

        {error && <ErrorState message={error} onRetry={() => loadAll()} />}

        {/* ── KPI Strip ── */}
        {loading ? (
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : metrics ? (
          <KPIStrip metrics={metrics} forecast={forecast} />
        ) : null}

        {/* ── Accuracy Section ── */}
        {loading ? <CardSkeleton /> : metrics ? <AccuracySection metrics={metrics} /> : null}

        {/* ── Forecast Section ── */}
        {loading ? <CardSkeleton /> : forecast ? <ForecastSection forecast={forecast} onSelectSystem={setPreviewSystem} /> : null}
        {previewSystem && <ImpactPreviewModal system={previewSystem} onClose={() => setPreviewSystem(null)} />}

        {/* ── Predictions Table ── */}
        <PredictionsTable
          predictions={predictions}
          total={total}
          page={page}
          onPageChange={loadPage}
          loading={loading || tableLoading}
        />

        {/* ── Drift Section ── */}
        {loading ? <CardSkeleton /> : drift ? <DriftSection drift={drift} onRetrain={handleRetrain} /> : null}

      </div>
    </div>
  )
}
