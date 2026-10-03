// src/components/remote/PerformancePanel.tsx
//
// Task-Manager-style building blocks for Remote Control: a live metric chart,
// a compact asset row with sparkline, the "predicted effect" table shown before
// a command is issued, and the "what actually happened" impact log.
// The numbers come from lib/performance (a simulator — see its header).
'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts'
import { ArrowRight, Activity, Loader2 } from 'lucide-react'
import { CHART, axisTick, gridProps } from '@/lib/chartTheme'
import { ChartTooltip } from '@/components/ui/Panel'
import type { MetricDef, Sample, ImpactEvent, PredictedChange } from '@/lib/performance/assetPerformance'

const fmt = (v: number, d: number) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

export function MetricChart({
  def, samples, windowSec, markers = [], height = 130,
}: {
  def: MetricDef
  samples: Sample[]
  windowSec: number
  /** Timestamps (ms) of applied commands to draw as vertical lines. */
  markers?: number[]
  height?: number
}) {
  const data = samples.slice(-windowSec)
  const last = data[data.length - 1]?.[def.key] ?? 0
  const t0 = data[0]?.t ?? 0
  const rows = data.map((s) => ({ s: Math.round((s.t - t0) / 1000), v: s[def.key], t: s.t }))
  const mk = markers.map((t) => rows.find((r) => r.t >= t)?.s).filter((v): v is number => v !== undefined)
  const gid = `m-${def.key}-${def.color.slice(1)}`
  return (
    <div className="rounded-md border border-brand-border bg-brand-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-wider text-white/70">{def.label}</p>
        <p className="font-mono font-bold text-lg leading-none" style={{ color: def.color }}>
          {fmt(last, def.decimals ?? 1)}<span className="text-[11px] font-medium text-white/62 ml-1">{def.unit}</span>
        </p>
      </div>
      <div style={{ height }} className="mt-1.5 min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <AreaChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={def.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={def.color} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="s" hide />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} domain={def.max ? [0, def.max] : ['auto', 'auto']} tickFormatter={(v: number) => fmt(v, def.decimals ?? 0)} />
            <Tooltip content={<ChartTooltip labelFormatter={(l) => `${Number(l) - (rows[rows.length - 1]?.s ?? 0)} s`} format={(v) => `${fmt(v, def.decimals ?? 1)} ${def.unit}`} />} />
            {mk.map((x, i) => <ReferenceLine key={i} x={x} stroke={CHART.ink} strokeDasharray="3 3" label={{ value: 'cmd', fill: CHART.ink, fontSize: 10, position: 'insideTopLeft' }} />)}
            <Area type="monotone" dataKey="v" name={def.label} stroke={def.color} strokeWidth={2} fill={`url(#${gid})`} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function MiniSpark({ samples, def, color }: { samples: Sample[]; def: MetricDef; color: string }) {
  const rows = samples.slice(-60).map((s, i) => ({ i, v: s[def.key] }))
  return (
    <div className="h-8 w-24 shrink-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <AreaChart data={rows} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <YAxis hide domain={def.max ? [0, def.max] : ['dataMin - 1', 'dataMax + 1']} />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.15} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function deltaColor(good: 'up' | 'down' | null | undefined, from: number, to: number): string {
  if (!good || Math.abs(to - from) < 1e-6) return CHART.ink
  const up = to > from
  return (good === 'up') === up ? CHART.green : CHART.red
}

export function PredictedEffects({ rows }: { rows: PredictedChange[] }) {
  if (!rows.length) return <p className="font-sans text-xs text-white/70">No measurable change in performance is expected.</p>
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className={`grid grid-cols-[1fr_auto] items-center gap-3 rounded px-2.5 py-1.5 ${r.primary ? 'bg-cyan/10' : 'bg-brand-surface-2'}`}>
          <p className="font-sans text-xs text-white leading-snug">
            {!r.primary && <span className="font-semibold">{r.assetName} · </span>}{r.label}
          </p>
          <p className="font-mono text-xs flex items-center gap-1.5 text-white/70">
            {fmt(r.from, r.decimals)}
            <ArrowRight size={11} />
            <span className="font-bold" style={{ color: deltaColor(r.goodWhen, r.from, r.to) }}>{fmt(r.to, r.decimals)} {r.unit}</span>
          </p>
        </div>
      ))}
    </div>
  )
}

export function ImpactLog({ impacts, assetId, now }: { impacts: ImpactEvent[]; assetId?: string; now: number }) {
  const list = assetId ? impacts.filter((e) => e.assetId === assetId || e.rows.some((r) => r.assetId === assetId)) : impacts
  if (!list.length) {
    return (
      <p className="font-sans text-xs text-white/70 flex items-center gap-2 py-2">
        <Activity size={14} className="text-white/55" />
        Issue a command and its measured effect on performance shows up here ~30 seconds after it is applied.
      </p>
    )
  }
  return (
    <div className="space-y-3">
      {list.map((e) => (
        <div key={e.id} className="rounded-md border border-brand-border bg-brand-surface p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="font-sans text-sm text-white">
              <span className="font-semibold">{e.assetName}</span>
              <span className="font-mono text-xs text-white/70"> · {e.detail}</span>
            </p>
            <span className="font-mono text-[11px] text-white/62 shrink-0">
              {new Date(e.t0).toLocaleTimeString('en-GB')}
            </span>
          </div>
          {!e.settled ? (
            <p className="font-mono text-xs text-white/70 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> settling… {Math.max(0, 30 - Math.round((now - e.t0) / 1000))} s
            </p>
          ) : e.rows.length === 0 ? (
            <p className="font-sans text-xs text-white/70">No measurable change.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
              {e.rows.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-xs border-b border-brand-border/60 py-1">
                  <span className="font-sans text-white/85">{!r.primary && <span className="font-semibold">{r.assetName} · </span>}{r.label}</span>
                  <span className="font-mono flex items-center gap-1.5 text-white/70">
                    {fmt(r.before, r.decimals)} <ArrowRight size={10} />
                    <span className="font-bold" style={{ color: deltaColor(r.goodWhen, r.before, r.after ?? r.before) }}>
                      {fmt(r.after ?? r.before, r.decimals)} {r.unit}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
