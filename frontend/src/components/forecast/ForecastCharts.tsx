// src/components/forecast/ForecastCharts.tsx
//
// Charts + explanation cards shared by Energy, Logistics, Overview and
// Predictive Modelling, all fed by the model in lib/forecast/engine.ts.
'use client'

import { useMemo } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { AlertTriangle, FlaskConical } from 'lucide-react'
import { CHART, axisTick, gridProps, shortDate, fmtNum } from '@/lib/chartTheme'
import { ChartTooltip, LegendDot, Bar as ProgressBar } from '@/components/ui/Panel'
import { FEATURE_LABEL, type ForecastModel, type ConsumptionTarget, TARGET_LABEL } from '@/lib/ml/engine'

export interface BandPoint {
  /** ISO date (YYYY-MM-DD) or any category label. */
  x: string
  mid?: number | null
  lo?: number | null
  hi?: number | null
  actual?: number | null
  fit?: number | null
}

interface BandChartProps {
  data: BandPoint[]
  color?: string
  unit?: string
  height?: number
  midName?: string
  actualName?: string
  fitName?: string
  refY?: { value: number; label: string; color?: string }
  refX?: Array<{ x: string; label: string; color?: string }>
  yDomain?: [number | 'auto' | 'dataMin', number | 'auto' | 'dataMax']
  yFormat?: (v: number) => string
  xIsDate?: boolean
  bandName?: string
}

export function BandChart({
  data, color = CHART.blue, unit = '', height = 260, midName = 'Forecast', actualName = 'Actual', fitName = 'Model fit',
  refY, refX = [], yDomain, yFormat, xIsDate = true, bandName = '80% band',
}: BandChartProps) {
  const rows = useMemo(
    () => data.map((d) => ({ ...d, base: d.lo ?? null, span: d.lo != null && d.hi != null ? d.hi - d.lo : null })),
    [data],
  )
  const hasActual = data.some((d) => d.actual != null)
  const hasFit = data.some((d) => d.fit != null)
  const hasBand = data.some((d) => d.lo != null)
  const fmt = yFormat ?? ((v: number) => fmtNum(v))
  const gradId = `band-${color.replace('#', '')}`

  return (
    <div>
      <div className="flex items-center gap-4 flex-wrap mb-2">
        {hasActual && <LegendDot color={CHART.ink} label={actualName} />}
        {hasFit && <LegendDot color={color} label={fitName} dashed />}
        <LegendDot color={color} label={midName} />
        {hasBand && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-white/70">
            <span className="inline-block w-3.5 h-2.5 rounded-sm" style={{ background: `${color}33` }} />
            {bandName}
          </span>
        )}
      </div>
      <div style={{ height }} className="w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color} stopOpacity={0.12} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="x" tick={axisTick} tickLine={false} axisLine={{ stroke: CHART.grid }}
              tickFormatter={xIsDate ? shortDate : undefined} minTickGap={36}
            />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={58} tickFormatter={fmt} domain={yDomain ?? ['auto', 'auto']} allowDataOverflow={!!yDomain} />
            <Tooltip
              content={
                <ChartTooltip
                  labelFormatter={(l) => (xIsDate ? shortDate(String(l)) : String(l))}
                  format={(v) => `${fmtNum(v, v < 100 ? 1 : 0)}${unit ? ' ' + unit : ''}`}
                  hide={['base', 'span']}
                />
              }
            />
            {hasBand && <Area dataKey="base" stackId="band" stroke="none" fill="none" isAnimationActive={false} legendType="none" name="base" />}
            {hasBand && <Area dataKey="span" stackId="band" stroke="none" fill={`url(#${gradId})`} isAnimationActive={false} legendType="none" name={bandName} />}
            {refY && (
              <ReferenceLine
                y={refY.value} stroke={refY.color ?? CHART.amber} strokeDasharray="5 4"
                label={{ value: refY.label, fill: refY.color ?? CHART.amber, fontSize: 11, position: 'insideTopRight', fontFamily: 'var(--font-mono)' }}
              />
            )}
            {refX.map((r) => (
              <ReferenceLine
                key={r.x + r.label} x={r.x} stroke={r.color ?? CHART.muted} strokeDasharray="4 4"
                label={{ value: r.label, fill: r.color ?? CHART.muted, fontSize: 11, position: 'insideTopLeft', fontFamily: 'var(--font-mono)' }}
              />
            ))}
            {hasFit && <Line dataKey="fit" name={fitName} stroke={color} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls={false} />}
            {hasActual && <Line dataKey="actual" name={actualName} stroke={CHART.ink} strokeWidth={1.75} dot={false} isAnimationActive={false} connectNulls={false} />}
            <Line dataKey="mid" name={midName} stroke={color} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Model card ─────────────────────────────────────────────────────────────

export function ModelCard({ model, target }: { model: ForecastModel; target?: ConsumptionTarget }) {
  const targets = Object.keys(model.consumption) as ConsumptionTarget[]
  const focus = target ?? 'fuel_l'
  const info = model.consumption[focus]
  const imp = Object.entries(info.importance).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxImp = imp[0]?.[1] ?? 1

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-md border border-amber/40 bg-amber/10 px-3 py-2.5">
        <FlaskConical size={16} className="text-amber shrink-0 mt-0.5" />
        <p className="font-sans text-xs text-white/80 leading-relaxed">
          <span className="font-semibold text-amber">Trained, not validated against real data.</span>{' '}
          {model.meta.validated}. The {fmtNum(model.meta.n_logistics_rows)}-row dataset is synthetic
          ({model.meta.data_range[0]} → {model.meta.data_range[1]}); treat every figure as a planning aid, not a measurement.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="font-mono text-[11px] uppercase tracking-wider text-white/62 text-left">
              <th className="py-1.5 pr-3 font-semibold">Target</th>
              <th className="py-1.5 pr-3 font-semibold">Exported model</th>
              <th className="py-1.5 pr-3 font-semibold text-right">MAE</th>
              <th className="py-1.5 pr-3 font-semibold text-right">MAPE</th>
              <th className="py-1.5 pr-3 font-semibold text-right">R²</th>
              <th className="py-1.5 pr-3 font-semibold text-right">Baseline MAPE</th>
              <th className="py-1.5 font-semibold text-right">80% band coverage</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => {
              const c = model.consumption[t]
              const m = c.exported === 'gbm' ? c.metrics.gbm : c.metrics.ridge
              return (
                <tr key={t} className="border-t border-brand-border">
                  <td className="py-2 pr-3 font-sans text-white">{TARGET_LABEL[t].label} <span className="text-white/55 font-mono">({TARGET_LABEL[t].unit})</span></td>
                  <td className="py-2 pr-3 font-mono uppercase text-cyan">{c.exported === 'gbm' ? 'Gradient boosting' : 'Ridge regression'}</td>
                  <td className="py-2 pr-3 font-mono text-right text-white">{fmtNum(m.mae, 1)}</td>
                  <td className="py-2 pr-3 font-mono text-right text-white">{m.mape_pct.toFixed(1)}%</td>
                  <td className="py-2 pr-3 font-mono text-right text-white">{m.r2.toFixed(2)}</td>
                  <td className="py-2 pr-3 font-mono text-right text-white/70">{c.metrics.seasonal_naive.mape_pct.toFixed(1)}% <span className="text-white/70">(last yr)</span></td>
                  <td className="py-2 font-mono text-right text-white">{Math.round(c.interval.test_coverage * 100)}% <span className="text-white/70">of 80%</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div>
        <p className="font-mono text-[11px] uppercase tracking-wider text-white/70 mb-2">
          What drives {TARGET_LABEL[focus].label.toLowerCase()}
        </p>
        <div className="space-y-2">
          {imp.map(([f, v]) => (
            <div key={f} className="grid grid-cols-[130px_1fr_44px] items-center gap-3">
              <span className="font-sans text-xs text-white/80">{FEATURE_LABEL[f] ?? f}</span>
              <ProgressBar value={v} max={maxImp} color={CHART.blue} height="h-2" />
              <span className="font-mono text-xs text-white/70 text-right">{(v * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      <p className="font-sans text-[11px] text-white/62 leading-relaxed flex items-start gap-1.5">
        <AlertTriangle size={12} className="shrink-0 mt-0.5 text-white/55" />
        Chronological split: trained up to {model.meta.train_end}, interval width calibrated to {model.meta.calibration_end}, scored on the
        months after. Run-out ranges assume the high/low end of the daily band applies every day, so they are pessimistic/optimistic bounds, not a probability.
      </p>
    </div>
  )
}
