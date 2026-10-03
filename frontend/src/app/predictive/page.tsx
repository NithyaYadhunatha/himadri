'use client'

// Predictive Modelling — failure forecasts, machine performance trends with a
// model-projected health curve, prediction-vs-actual tracking, drift, and the
// consumption model's scorecard. Machine curves come from the model in
// lib/forecast (trained on synthetic data — labelled as such throughout).
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar as RBar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Target, CheckCircle, AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Cpu, Activity, Zap, Shield, Clock,
  BarChart2, Waypoints, Gauge, FlaskConical, Wrench,
} from 'lucide-react'
import { HealthGauge } from '@/components/ui/HealthGauge'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { CardSkeleton, Skeleton, ErrorState } from '@/components/ui/Loader'
import { PageShell, PageHeader, Panel, MetricTile, ChartTooltip, SyntheticChip, LegendDot, Bar } from '@/components/ui/Panel'
import { BandChart, ModelCard, type BandPoint } from '@/components/forecast/ForecastCharts'
import { FlowCanvas } from '@/components/graph/FlowCanvas'
import { graphService } from '@/services/graph.service'
import { modelAccuracyService } from '@/services/modelAccuracy.service'
import { mockControllableAssets } from '@/lib/mockData/mockCommands'
import { useStationStore } from '@/store/useStationStore'
import { useForecastModel } from '@/lib/forecast/useForecastModel'
import { forecastHealth, SERVICE_THRESHOLD, FAILURE_THRESHOLD, FEATURE_LABEL, type ForecastModel } from '@/lib/forecast/engine'
import { CHART, axisTick, gridProps, shortDate, healthColor, fmtNum } from '@/lib/chartTheme'
import { STATION_LABELS } from '@/lib/constants'
import type { AccuracyMetrics, PredictionRecord, DriftMetrics, ForecastResponse, ForecastSystem } from '@/lib/mockData/mockModelAccuracy'
import type { GraphNode, GraphEdge } from '@/types/graph'
import type { BadgeVariant } from '@/types/common'

const riskColor = (level: string) => (level === 'CRITICAL' ? CHART.red : level === 'HIGH' || level === 'WARNING' ? CHART.amber : CHART.green)
const machineName = (id: string) => mockControllableAssets.find((a) => a.id === id)?.name ?? id

// ─── Machine performance ────────────────────────────────────────────────────

function MachinePerformance({ model }: { model: ForecastModel }) {
  const station = useStationStore((s) => s.station)
  const ids = useMemo(() => Object.keys(model.machines).filter((id) => model.machines[id].station === station), [model, station])
  const [picked, setPicked] = useState<string | null>(null)
  const id = picked && ids.includes(picked) ? picked : ids[0]

  const fleet = useMemo(
    () => ids.map((mid) => ({ id: mid, fc: forecastHealth(model, mid, { startDate: new Date(model.machines[mid].dates.at(-1) + 'T00:00:00Z') })! }))
      .sort((a, b) => a.fc.points[a.fc.points.length - 1].mid - b.fc.points[b.fc.points.length - 1].mid),
    [model, ids],
  )
  const m = id ? model.machines[id] : null
  const fc = fleet.find((f) => f.id === id)?.fc

  if (!m || !fc) return <p className="font-sans text-sm text-white/70">No machine history for this station.</p>

  const last = m.health[m.health.length - 1]
  const healthData: BandPoint[] = [
    ...m.dates.map((d, i) => ({ x: d, actual: m.health[i] })),
    { x: fc.points[0].date, mid: last, lo: last, hi: last },
    ...fc.points.map((p) => ({ x: p.date, mid: p.mid, lo: p.lo, hi: p.hi })),
  ]
  const series = m.dates.map((d, i) => ({ x: d, load: m.load_pct[i], temp: m.temp_c[i], vib: m.vibration_mm_s[i], fuel: m.fuel_lph[i] }))
  const color = healthColor(fc.current)
  const end = fc.points[fc.points.length - 1]
  const risk = fc.failureRisk
  const serviced = m.dates.map((d, i) => (m.maintenance[i] ? { x: d, label: 'serviced', color: CHART.green as string } : null)).filter((x): x is { x: string; label: string; color: string } => !!x).slice(-3)

  const small = (key: 'load' | 'temp' | 'vib' | 'fuel', label: string, unit: string, c: string, digits = 1) => (
    <div className="rounded-md border border-brand-border bg-brand-surface p-3">
      <div className="flex items-baseline justify-between mb-1">
        <p className="font-mono text-[11px] uppercase tracking-wider text-white/70">{label}</p>
        <p className="font-mono font-bold text-base" style={{ color: c }}>{fmtNum(series[series.length - 1][key], digits)}<span className="text-[11px] font-medium text-white/62 ml-1">{unit}</span></p>
      </div>
      <div className="h-[110px] min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <AreaChart data={series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <defs><linearGradient id={`g-${key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity={0.3} /><stop offset="100%" stopColor={c} stopOpacity={0.03} /></linearGradient></defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="x" tick={axisTick} tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={40} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} tickFormatter={(v: number) => fmtNum(v, v < 10 ? 1 : 0)} />
            <Tooltip content={<ChartTooltip labelFormatter={(l) => shortDate(String(l))} format={(v) => `${fmtNum(v, digits)} ${unit}`} />} />
            <Area dataKey={key} name={label} stroke={c} strokeWidth={2} fill={`url(#g-${key})`} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {fleet.map(({ id: mid, fc: f }) => {
          const mm = model.machines[mid]
          const e = f.points[f.points.length - 1].mid
          const sel = mid === id
          return (
            <button key={mid} type="button" onClick={() => setPicked(mid)}
              className={`text-left rounded-md border p-2.5 transition-colors bg-brand-surface ${sel ? 'border-cyan ring-1 ring-cyan/40' : 'border-brand-border hover:border-cyan/50'}`}>
              <p className="font-sans text-xs font-semibold text-white leading-tight truncate">{machineName(mid)}</p>
              <div className="flex items-baseline justify-between mt-0.5">
                <span className="font-mono text-lg font-bold" style={{ color: healthColor(f.current) }}>{f.current.toFixed(0)}</span>
                <span className="font-mono text-[11px] text-white/70">→ {e.toFixed(0)} in {f.points.length} d</span>
              </div>
              <div className="h-8 mt-1">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <LineChart data={mm.health.map((h, i) => ({ i, h }))} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                    <YAxis hide domain={[40, 100]} />
                    <Line dataKey="h" stroke={healthColor(e)} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricTile label="Health now" value={fc.current.toFixed(0)} unit="/100" color={color} icon={<Gauge size={15} />} hint={`${fc.slopePerDay >= 0 ? '+' : ''}${fc.slopePerDay.toFixed(2)} pts/day (7-day trend)`} />
        <MetricTile label={`Health in ${fc.points.length} days`} value={end.mid.toFixed(0)} unit="/100" color={healthColor(end.mid)} icon={<Activity size={15} />}
          hint={`80% range ${end.lo.toFixed(0)}–${end.hi.toFixed(0)}`} />
        <MetricTile label="Service due in" value={fc.daysToServiceEst === null ? 'No decline' : `${fc.extrapolated ? '~' : ''}${fc.daysToServiceEst}`} unit={fc.daysToServiceEst === null ? undefined : 'days'}
          color={fc.daysToServiceEst !== null && fc.daysToServiceEst < 30 ? CHART.amber : CHART.green} icon={<Wrench size={15} />}
          hint={fc.extrapolated ? `Extrapolated past the ${fc.points.length}-day model horizon` : `Health below ${SERVICE_THRESHOLD}`} />
        <MetricTile label="Failure risk" value={`${(risk * 100).toFixed(risk < 0.1 ? 1 : 0)}%`} color={risk > 0.3 ? CHART.red : risk > 0.1 ? CHART.amber : CHART.green} icon={<AlertTriangle size={15} />}
          hint={`Chance health < ${FAILURE_THRESHOLD} by day ${fc.points.length}, no maintenance`} />
      </div>

      <Panel title={`${machineName(id)} — health history & projection`} icon={<Activity size={14} />}
        subtitle={`${m.dates.length} days of synthetic history, then the model's projection assuming no maintenance. The dashed line marks the service threshold (${SERVICE_THRESHOLD}).`}>
        <BandChart data={healthData} color={color === CHART.green ? CHART.blue : color} unit="pts" height={270} yDomain={[30, 100]} midName="Projected health" actualName="Recorded health"
          refY={{ value: SERVICE_THRESHOLD, label: 'Service', color: CHART.amber }} yFormat={(v) => String(Math.round(v))} refX={serviced} />
      </Panel>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {small('load', 'Load', '%', CHART.blue, 0)}
        {small('temp', 'Temperature', '°C', CHART.red, 1)}
        {small('vib', 'Vibration', 'mm/s', CHART.violet, 2)}
        {m.fuel_lph.some((v) => v > 0) ? small('fuel', 'Fuel flow', 'L/h', CHART.amber, 1) : (
          <div className="rounded-md border border-brand-border bg-brand-surface p-3 flex items-center justify-center text-center">
            <p className="font-sans text-xs text-white/62">This machine does not burn fuel.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Accuracy ───────────────────────────────────────────────────────────────

function AccuracySection({ metrics }: { metrics: AccuracyMetrics }) {
  const accuracy = metrics.classification?.accuracy || 0
  const ok = accuracy >= 85
  const color = accuracy >= 85 ? CHART.green : accuracy >= 60 ? CHART.amber : CHART.red
  const chartData = (metrics.trend30d || []).map((d, i) => ({ day: i, value: Number(d.value.toFixed(1)) }))
  const tiles = [
    { label: 'Precision', v: metrics.classification?.precision, unit: '%', icon: <Target size={14} />, c: CHART.blue },
    { label: 'Recall', v: metrics.classification?.recall, unit: '%', icon: <Activity size={14} />, c: CHART.green },
    { label: 'F1 score', v: metrics.classification?.f1, unit: '%', icon: <Zap size={14} />, c: CHART.violet },
    { label: 'MAE (runtime)', v: metrics.runtime_prediction?.mae_minutes, unit: 'min', icon: <Clock size={14} />, c: CHART.amber },
  ]
  return (
    <Panel title="Failure-prediction accuracy" icon={<Target size={14} />} subtitle="Backend failure classifier, 30-day rolling window."
      actions={<Badge variant={ok ? 'healthy' : 'critical'} size="md">{ok ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}{ok ? 'Above target' : 'Below target'}</Badge>}>
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_1.4fr] gap-5 items-center">
        <div className="flex flex-col items-center">
          <HealthGauge score={Math.round(accuracy)} size={150} strokeWidth={9} label="ACCURACY" />
          <p className="font-mono text-xs text-white/70 mt-2">target 85%</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-md border border-brand-border bg-brand-surface-2 px-3 py-2.5">
              <p className="font-mono text-[11px] uppercase tracking-wider text-white/70 flex items-center gap-1.5"><span style={{ color: t.c }}>{t.icon}</span>{t.label}</p>
              <p className="font-mono text-xl font-bold mt-1" style={{ color: t.c }}>{t.v != null ? t.v.toFixed(1) : '—'}<span className="text-[11px] font-medium text-white/62 ml-1">{t.unit}</span></p>
            </div>
          ))}
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-white/70 mb-1">30-day accuracy trend</p>
          <div className="h-[170px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={chartData} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                <defs><linearGradient id="accG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.3} /><stop offset="100%" stopColor={color} stopOpacity={0.03} /></linearGradient></defs>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(d: number) => (d === 0 ? '−30d' : d === chartData.length - 1 ? 'now' : '')} interval={0} />
                <YAxis domain={[40, 100]} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip content={<ChartTooltip labelFormatter={(l) => `${Number(l) - (chartData.length - 1)} d`} format={(v) => `${v}%`} />} />
                <Area dataKey="value" name="Accuracy" stroke={color} strokeWidth={2.5} fill="url(#accG)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Panel>
  )
}

// ─── Impact radius modal ────────────────────────────────────────────────────

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
  return (
    <Dialog open onClose={onClose} title="Impact radius preview" width="max-w-4xl">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-sans text-base text-white font-semibold">{system.asset_name}</h3>
            <p className="font-mono text-[11px] text-white/62 mt-0.5">{system.asset_id}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={system.risk_level === 'CRITICAL' ? 'critical' : 'warning'} size="sm">{system.risk_level}</Badge>
            <span className="font-mono text-sm font-semibold" style={{ color: riskColor(system.risk_level) }}>{(system.failure_probability * 100).toFixed(1)}% failure prob.</span>
          </div>
        </div>
        {loading ? <div className="h-[480px]"><Skeleton height="h-full" /></div>
          : error ? <ErrorState message={error} />
          : !nodeExists ? <div className="h-[200px] flex items-center justify-center"><p className="text-white/70 font-mono text-xs">This system isn&apos;t in the current live topology.</p></div>
          : (
            <>
              <div className="h-[480px] w-full rounded border border-brand-border overflow-hidden">
                <FlowCanvas nodes={graph!.nodes} edges={graph!.edges} selectedNodeId={system.asset_id} readOnly showLegend colorMode="health" />
              </div>
              <p className="text-xs font-sans text-white/70 leading-relaxed">
                Blue nodes are upstream dependencies (what it needs); amber nodes are its blast radius — everything downstream that fails with it.
              </p>
            </>
          )}
      </div>
    </Dialog>
  )
}

// ─── Forecast tables ────────────────────────────────────────────────────────

function ForecastSection({ forecast, onSelectSystem }: { forecast: ForecastResponse; onSelectSystem: (s: ForecastSystem) => void }) {
  if (forecast.model_version === 'None' || !forecast.systems || forecast.systems.length === 0) {
    return (
      <Panel title="System failure forecast" icon={<Cpu size={14} />}>
        <div className="flex items-center gap-3 py-6"><BarChart2 size={22} className="text-white/50" /><p className="text-white/70 font-sans text-sm">Not enough history yet to forecast reliably.</p></div>
      </Panel>
    )
  }
  const highRisk = forecast.systems.filter((s) => s.risk_level === 'CRITICAL' || s.risk_level === 'HIGH')
  const stable = forecast.systems.filter((s) => s.risk_level === 'LOW')
  const chart = [...forecast.systems].sort((a, b) => b.failure_probability - a.failure_probability).slice(0, 10)
    .map((s) => ({ name: s.asset_name.length > 22 ? s.asset_name.slice(0, 21) + '…' : s.asset_name, p: Number((s.failure_probability * 100).toFixed(1)), level: s.risk_level }))

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
      <Panel title="Predicted failures — next 24 h" icon={<AlertTriangle size={14} />} subtitle="Click a row to preview the impact radius on the live topology."
        actions={highRisk.length ? <Badge variant="critical" dot>{highRisk.length} at risk</Badge> : <Badge variant="healthy">None at risk</Badge>}>
        {highRisk.length === 0 ? (
          <div className="flex items-center gap-3 py-3"><Shield size={20} className="text-emerald" /><p className="font-sans text-sm text-white">All systems nominal — no high-risk predictions.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[560px]">
              <thead><tr className="font-mono text-[11px] uppercase tracking-wider text-white/62 text-left">
                <th className="py-1.5 pr-3 font-semibold">System</th><th className="py-1.5 pr-3 font-semibold">Risk</th><th className="py-1.5 pr-3 font-semibold w-36">Failure prob.</th>
                <th className="py-1.5 pr-3 font-semibold text-right">Life left</th><th className="py-1.5 pr-3 font-semibold text-right">Conf.</th><th className="py-1.5 font-semibold">Risk factors</th></tr></thead>
              <tbody>
                {highRisk.map((s) => (
                  <tr key={s.asset_id} onClick={() => onSelectSystem(s)} className="border-t border-brand-border cursor-pointer hover:bg-brand-surface-2 transition-colors">
                    <td className="py-2.5 pr-3"><p className="font-sans text-sm font-semibold text-white flex items-center gap-1.5"><Waypoints size={12} className="text-white/55" />{s.asset_name}</p><p className="font-mono text-[11px] text-white/62">{s.asset_id}</p></td>
                    <td className="py-2.5 pr-3"><Badge variant={s.risk_level === 'CRITICAL' ? 'critical' : 'warning'} size="sm">{s.risk_level}</Badge></td>
                    <td className="py-2.5 pr-3"><p className="font-mono text-sm font-bold" style={{ color: riskColor(s.risk_level) }}>{(s.failure_probability * 100).toFixed(1)}%</p><Bar value={s.failure_probability * 100} color={riskColor(s.risk_level)} height="h-1.5" /></td>
                    <td className="py-2.5 pr-3 font-mono text-right text-white">{s.estimated_remaining_runtime_minutes ? `${(s.estimated_remaining_runtime_minutes / 1440).toFixed(0)} d` : 'N/A'}</td>
                    <td className="py-2.5 pr-3 font-mono text-right text-white/80">{s.confidence ? `${(s.confidence * 100).toFixed(0)}%` : 'N/A'}</td>
                    <td className="py-2.5"><div className="flex flex-wrap gap-1">{s.risk_factors.map((rf, i) => <span key={i} className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-crimson/40 bg-crimson/10 text-crimson">{rf}</span>)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {stable.length > 0 && <p className="font-sans text-xs text-white/70 mt-3 pt-3 border-t border-brand-border"><Shield size={12} className="inline mr-1 text-emerald" />{stable.length} further system{stable.length > 1 ? 's' : ''} expected stable (low risk).</p>}
      </Panel>

      <Panel title="Failure probability by system" icon={<BarChart2 size={14} />} subtitle="Top 10 by 24-hour failure probability.">
        <div style={{ height: Math.max(220, chart.length * 30) }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={chart} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} horizontal={false} vertical />
              <XAxis type="number" domain={[0, 'auto']} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
              <YAxis type="category" dataKey="name" width={130} tick={{ ...axisTick, fill: '#16283A' }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip format={(v) => `${v}%`} />} cursor={{ fill: '#D9E9F2' }} />
              <RBar dataKey="p" name="Failure probability" radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false}>
                {chart.map((d, i) => <Cell key={i} fill={riskColor(d.level)} />)}
              </RBar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  )
}

// ─── Predictions vs actuals ─────────────────────────────────────────────────

const outcomeBadge: Record<PredictionRecord['outcome'], BadgeVariant> = {
  accurate: 'healthy', acceptable: 'warning', inaccurate: 'critical', CORRECT: 'healthy', EARLY: 'info',
  LATE: 'warning', FALSE_POSITIVE: 'warning', FALSE_NEGATIVE: 'critical', NO_FAILURE: 'neutral',
}

function PredictionsTable({ predictions, total, page, onPageChange, loading }: {
  predictions: PredictionRecord[]; total: number; page: number; onPageChange: (p: number) => void; loading: boolean
}) {
  const totalPages = Math.max(1, Math.ceil(total / 8))
  return (
    <Panel title="Prediction vs actuals" icon={<BarChart2 size={14} />} subtitle={`${total} prediction records`}
      actions={
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-white/70">Page {page} / {totalPages}</span>
          <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="p-1.5 rounded border border-brand-border bg-brand-surface text-white/75 hover:text-white disabled:opacity-40"><ChevronLeft size={14} /></button>
          <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="p-1.5 rounded border border-brand-border bg-brand-surface text-white/75 hover:text-white disabled:opacity-40"><ChevronRight size={14} /></button>
        </div>
      }>
      {loading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height="h-10" />)}</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[560px]">
            <thead><tr className="font-mono text-[11px] uppercase tracking-wider text-white/62 text-left">
              <th className="py-1.5 pr-3 font-semibold">Scenario</th><th className="py-1.5 pr-3 font-semibold text-right">Predicted</th><th className="py-1.5 pr-3 font-semibold text-right">Actual</th>
              <th className="py-1.5 pr-3 font-semibold text-right">Deviation</th><th className="py-1.5 font-semibold">Outcome</th></tr></thead>
            <tbody>
              {predictions.map((p) => {
                const dev = p.deviationPct > 30 ? CHART.red : p.deviationPct > 10 ? CHART.amber : CHART.green
                return (
                  <tr key={p.id} className="border-t border-brand-border">
                    <td className="py-2 pr-3"><p className="font-sans text-sm text-white">{p.scenario}</p><p className="font-mono text-[11px] text-white/62">{new Date(p.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p></td>
                    <td className="py-2 pr-3 font-mono text-right text-white">{p.predictedValue} <span className="text-white/55">{p.unit}</span></td>
                    <td className="py-2 pr-3 font-mono text-right text-white">{p.actualValue} <span className="text-white/55">{p.unit}</span></td>
                    <td className="py-2 pr-3 font-mono text-right font-bold" style={{ color: dev }}>{p.deviation > 0 ? '+' : ''}{p.deviation.toFixed(1)} <span className="font-medium opacity-80">({p.deviationPct.toFixed(0)}%)</span></td>
                    <td className="py-2"><Badge variant={outcomeBadge[p.outcome]} size="sm">{p.outcome}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

// ─── Drift ──────────────────────────────────────────────────────────────────

function DriftSection({ drift, onRetrain }: { drift: DriftMetrics; onRetrain: () => Promise<void> }) {
  const [retraining, setRetraining] = useState(false)
  const c = drift.driftStatus === 'critical' ? CHART.red : drift.driftStatus === 'warning' ? CHART.amber : CHART.green
  const data = drift.featureImportance.map((f) => ({ name: f.feature, Importance: f.importance, Drift: f.drift }))
  return (
    <Panel title="Model drift" icon={<Activity size={14} />} accent={c}
      subtitle={`Last retrained ${new Date(drift.lastRetrainedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
      actions={<><div className="text-right mr-1"><p className="font-mono text-2xl font-bold leading-none" style={{ color: c }}>{drift.driftScore}</p><p className="font-mono text-[10px] uppercase text-white/62">drift score</p></div>
        <Badge variant={drift.driftStatus === 'critical' ? 'critical' : drift.driftStatus === 'warning' ? 'warning' : 'healthy'} dot>{drift.driftStatus}</Badge></>}>
      {drift.driftAlert && <div className="rounded-md p-3 mb-4 flex items-start gap-2.5 bg-amber/10 border border-amber/40"><AlertTriangle size={15} className="text-amber shrink-0 mt-0.5" /><p className="text-sm font-sans text-white">{drift.driftAlert}</p></div>}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-5 items-start">
        <div>
          <div className="flex gap-4 mb-1"><LegendDot color={CHART.blue} label="Importance" /><LegendDot color={CHART.red} label="Drift %" /></div>
          <div className="h-[220px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart layout="vertical" data={data} margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" domain={[0, 40]} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={140} tick={{ ...axisTick, fill: '#16283A' }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip format={(v) => `${v}%`} />} cursor={{ fill: '#D9E9F2' }} />
                <RBar dataKey="Importance" fill={CHART.blue} radius={[0, 3, 3, 0]} barSize={8} isAnimationActive={false} />
                <RBar dataKey="Drift" fill={CHART.red} radius={[0, 3, 3, 0]} barSize={8} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-md border border-brand-border bg-brand-surface-2 p-3">
            <p className="font-mono text-[11px] uppercase tracking-wider text-white/70 mb-1.5">Retraining</p>
            <p className="text-xs text-white/80 font-sans leading-relaxed">{drift.retrainingRecommended ? 'Retraining recommended based on drift and prediction accuracy.' : 'Model is stable. No retraining required.'}</p>
          </div>
          <Button variant={drift.retrainingRecommended ? 'primary' : 'secondary'} size="md" loading={retraining} icon={<RefreshCw size={13} />} className="w-full"
            onClick={async () => { setRetraining(true); try { await onRetrain() } finally { setRetraining(false) } }}>
            {drift.retrainingRecommended ? 'Retrain now' : 'Force retrain'}
          </Button>
        </div>
      </div>
    </Panel>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

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
  const { model, error: modelError } = useForecastModel()
  const station = useStationStore((s) => s.station)

  const loadAll = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)
    setError(null)
    try {
      const [m, p, d, f] = await Promise.all([
        modelAccuracyService.getAccuracyMetrics(), modelAccuracyService.getPredictions(1, 8),
        modelAccuracyService.getDriftMetrics(), modelAccuracyService.getForecast(),
      ])
      setMetrics(m); setForecast(f); setPredictions(p.data); setTotal(p.total); setDrift(d); setPage(1)
    } catch {
      setError('Failed to load predictive modelling data')
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [])

  const loadPage = useCallback(async (p: number) => {
    setPage(p)
    setTableLoading(true)
    const res = await modelAccuracyService.getPredictions(p, 8)
    setPredictions(res.data); setTotal(res.total); setTableLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const accuracy = metrics?.classification?.accuracy || 0
  const highRisk = forecast?.systems?.filter((s) => s.risk_level === 'CRITICAL' || s.risk_level === 'HIGH').length ?? 0
  const stable = forecast?.systems?.filter((s) => s.risk_level === 'LOW').length ?? 0
  const impBars = model ? Object.entries(model.health.importance).sort((a, b) => b[1] - a[1]).slice(0, 6) : []

  return (
    <PageShell>
      <PageHeader
        icon={<Cpu size={20} />} eyebrow="Predictive & Risk" title="Predictive Modelling"
        subtitle={`Failure forecasting, machine performance trends and the models behind them for ${STATION_LABELS[station]}.`}
        actions={<><SyntheticChip /><Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={() => loadAll(false)}>Refresh</Button></>}
      />

      {error && <ErrorState message={error} onRetry={() => loadAll()} />}

      {loading ? <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">{Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}</div> : metrics && (
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
          <MetricTile label="Overall accuracy" value={`${accuracy.toFixed(1)}%`} color={accuracy >= 85 ? CHART.green : CHART.red} icon={<Target size={15} />} />
          <MetricTile label="High-risk systems" value={highRisk} color={highRisk ? CHART.red : CHART.green} icon={<AlertTriangle size={15} />} />
          <MetricTile label="Stable systems" value={stable} color={CHART.green} icon={<Shield size={15} />} />
          <MetricTile label="F1 score" value={`${metrics.classification?.f1.toFixed(1) ?? 0}%`} color={CHART.violet} icon={<Zap size={15} />} />
          <MetricTile label="Model version" value={metrics.model_version ?? '—'} color={CHART.blue} icon={<Cpu size={15} />} />
        </div>
      )}

      {modelError && <ErrorState message={modelError} />}
      {model && (
        <Panel title="Machine performance" icon={<Activity size={14} />} accent={CHART.blue}
          subtitle="Per-machine health, load, temperature and vibration, with a 21-day health projection from the trained model.">
          <MachinePerformance model={model} />
        </Panel>
      )}

      {loading ? <CardSkeleton /> : forecast && <ForecastSection forecast={forecast} onSelectSystem={setPreviewSystem} />}
      {previewSystem && <ImpactPreviewModal system={previewSystem} onClose={() => setPreviewSystem(null)} />}

      {loading ? <CardSkeleton /> : metrics && <AccuracySection metrics={metrics} />}

      <PredictionsTable predictions={predictions} total={total} page={page} onPageChange={loadPage} loading={loading || tableLoading} />

      {loading ? <CardSkeleton /> : drift && <DriftSection drift={drift} onRetrain={() => modelAccuracyService.triggerRetrain().then(() => undefined)} />}

      {model && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
          <Panel title="Consumption model scorecard" icon={<FlaskConical size={14} />} subtitle="Drives the Energy and Logistics outlooks.">
            <ModelCard model={model} />
          </Panel>
          <Panel title="Machine-health model" icon={<Gauge size={14} />} subtitle="Direct multi-horizon gradient boosting, 1–21 days ahead.">
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              {[
                { l: 'MAE', v: `${model.health.metrics.gbm.mae.toFixed(2)} pts`, s: `persistence ${model.health.metrics.persistence.mae.toFixed(2)}` },
                { l: 'R²', v: model.health.metrics.gbm.r2.toFixed(3), s: 'on future health' },
                { l: '80% band', v: `${Math.round(model.health.interval_by_h.test_coverage * 100)}%`, s: 'actual coverage' },
              ].map((t) => (
                <div key={t.l} className="rounded-md border border-brand-border bg-brand-surface-2 px-3 py-2">
                  <p className="font-mono text-[11px] uppercase text-white/70">{t.l}</p>
                  <p className="font-mono text-lg font-bold text-white">{t.v}</p>
                  <p className="font-sans text-[11px] text-white/62">{t.s}</p>
                </div>
              ))}
            </div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-white/70 mb-2">What it looks at</p>
            <div className="space-y-2">
              {impBars.map(([f, v]) => (
                <div key={f} className="grid grid-cols-[130px_1fr_40px] items-center gap-3">
                  <span className="font-sans text-xs text-white/80">{FEATURE_LABEL[f] ?? f}</span>
                  <Bar value={v} max={impBars[0][1]} color={CHART.violet} />
                  <span className="font-mono text-xs text-white/70 text-right">{(v * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
            <p className="font-sans text-[11px] text-white/62 mt-3 leading-relaxed">
              Trained on {fmtNum(model.health.n_train_rows)} synthetic machine-day windows that contain no maintenance, so the projection answers “what if nobody services it?”. Not validated on real machines.
            </p>
          </Panel>
        </div>
      )}
    </PageShell>
  )
}
