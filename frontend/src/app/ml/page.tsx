'use client'

// ML Lab — the predictive layer, shown with its evidence. Three honest views:
//   1. the model registry (what is trained, how it scores, and whether those
//      scores mean anything yet),
//   2. forecasts produced by the backend's /analytics/forecast (OLS trend with a
//      95% prediction interval) plus a fuel-depletion projection fitted from
//      the live tank sensors,
//   3. the explainable risk model — every subsystem score decomposed into the
//      weighted factors and the evidence that produced them.
import { useEffect, useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Brain, FlaskConical, Fuel, LineChart, Sigma } from 'lucide-react'
import { useStationStore } from '@/store/useStationStore'
import { STATION_LABELS } from '@/lib/constants'
import { useBackend } from '@/lib/hooks/usePoll'
import { useFuelEndurance } from '@/lib/hooks/useFuel'
import { Kpi, Panel, PageHead, Pill, Meter, Skeleton, Tile, TONE_HEX, type Tone } from '@/components/ui/kit'
import { fmtNum, naiveUtc, toMs } from '@/lib/format'
import { forecast } from "@/lib/forecast"

interface Accuracy {
  window: string
  model_version: string
  classification: { accuracy: number; precision: number; recall: number; f1: number; roc_auc: number }
  runtime_prediction: { mae_minutes: number; rmse_minutes: number }
  evaluated_predictions: number
  pending_predictions: number
  last_updated: string
}
interface Drift {
  featureImportance: { feature: string; importance: number; drift: number }[]
  lastRetrainedAt: string | null
}
interface RiskRow {
  id: string
  subsystem: string
  score: number
  factors: { name: string; label: string; score: number; weight: number; evidence: string }[]
}
interface SeriesRow {
  key: string
  station_id: string
  asset_id: string
  label: string
  unit: string
}
interface ForecastResp {
  metric: string
  unit: string
  method: string
  sample_count: number
  series: { ts: string; value: number; ci_lower: number; ci_upper: number }[]
}
interface Reading {
  ts: string
  value: number
}

const riskTone = (n: number): Tone => (n >= 66 ? 'crit' : n >= 40 ? 'warn' : 'ok')

function ForecastChart({ metric, unit, horizon }: { metric: string; unit: string; horizon: number }) {
  const [hist, setHist] = useState<Reading[]>([])
  const [loaded, setLoaded] = useState(false)
  const [server, setServer] = useState<ForecastResp | null>(null)
  const [showServer, setShowServer] = useState(false)

  useEffect(() => {
    let alive = true
    setLoaded(false)
    setServer(null)
    ;(async () => {
      const from = naiveUtc(Date.now() - 96 * 3600 * 1000)
      const h = await fetch(`/api/backend/series/${encodeURIComponent(metric)}/readings?from=${encodeURIComponent(from)}&bucket=1h`).then((r) => (r.ok ? r.json() : []))
      if (!alive) return
      setHist([...(h as Reading[])].reverse())
      setLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [metric])

  // optional second opinion: the backend's own OLS trend endpoint
  useEffect(() => {
    if (!showServer) return
    let alive = true
    const station = metric.split('-')[0]
    fetch('/api/backend/analytics/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ station, metric, horizon_days: horizon }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setServer(j))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [showServer, metric, horizon])

  const pts = useMemo(() => hist.map((r) => ({ t: toMs(r.ts), v: r.value })), [hist])
  const fc = useMemo(() => forecast(pts, horizon), [pts, horizon])

  const data = useMemo(() => {
    const rows: { t: number; actual?: number; fc?: number; lo?: number; band?: number; srv?: number }[] = pts.map((p) => ({ t: p.t, actual: p.v }))
    if (fc) {
      const last = rows[rows.length - 1]
      if (last) rows[rows.length - 1] = { ...last, fc: last.actual }
      for (const p of fc.points) rows.push({ t: p.t, fc: p.v, lo: p.lo, band: p.hi - p.lo })
    }
    if (server) for (const p of server.series) rows.push({ t: toMs(p.ts), srv: p.value })
    return rows.sort((a, b) => a.t - b.t)
  }, [pts, fc, server])

  if (!loaded) return <Skeleton className="h-64" />
  if (!fc)
    return (
      <p className="font-mono text-[12px] text-white/50">
        Not enough history yet to forecast this signal (needs at least 6 hourly points). Devices or the station feeder need to report for a few more hours.
      </p>
    )
  return (
    <div>
      <div style={{ height: 270 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#DDD5C2" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#8A8576' }} axisLine={false} tickLine={false} minTickGap={40} />
            <YAxis tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#8A8576' }} axisLine={false} tickLine={false} width={52} domain={['auto', 'auto']} tickFormatter={(v) => fmtNum(v)} />
            <Tooltip
              contentStyle={{ background: '#FFFEFB', border: '1px solid #DDD5C2', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 11 }}
              labelFormatter={(t) => new Date(Number(t)).toLocaleString('en-GB')}
              formatter={(v, n) => [`${fmtNum(Number(v), 1)} ${unit}`, n === 'actual' ? 'Observed' : n === 'fc' ? 'Forecast' : n === 'srv' ? 'Backend OLS' : String(n)]}
            />
            <Area dataKey="lo" stackId="ci" stroke="none" fill="transparent" isAnimationActive={false} />
            <Area dataKey="band" stackId="ci" stroke="none" fill="#3A3AB8" fillOpacity={0.12} isAnimationActive={false} name="95% interval" />
            <Line dataKey="actual" stroke="#1C1F33" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            <Line dataKey="fc" stroke="#3A3AB8" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls />
            {showServer && <Line dataKey="srv" stroke="#D4820A" strokeWidth={1.6} strokeDasharray="2 4" dot={false} isAnimationActive={false} connectNulls />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <p className="font-mono text-[10.5px] text-white/50 max-w-[78%]">
          method: <b>{fc.method}</b> — {fc.reason} · fitted on {pts.length} hourly points · shaded band = 95% interval.
        </p>
        <label className="font-mono text-[10.5px] text-white/60 inline-flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showServer} onChange={(e) => setShowServer(e.target.checked)} /> overlay backend OLS trend
        </label>
      </div>
    </div>
  )
}

export default function MlLabPage() {
  const station = useStationStore((s) => s.station)
  const acc = useBackend<Accuracy>('model-accuracy/accuracy', 30000)
  const drift = useBackend<Drift>('model-accuracy/drift', 60000)
  const risk = useBackend<RiskRow[]>(`analytics/risk?station=${station}`, 30000)
  const series = useBackend<SeriesRow[]>('series', 120000)
  const fuel = useFuelEndurance(station)
  const [metric, setMetric] = useState('')
  const [horizon, setHorizon] = useState(14)
  const [retrain, setRetrain] = useState<string | null>(null)

  const options = useMemo(
    () => (series.data ?? []).filter((s) => s.station_id === station && ['power_kw', 'level_l', 'temp_c'].includes(s.label)).slice(0, 40),
    [series.data, station],
  )
  useEffect(() => {
    if (!options.length) return
    if (!options.find((o) => o.key === metric)) {
      setMetric((options.find((o) => /generator-01\.power_kw|fuel-tank-01\.level_l/.test(o.key)) ?? options[0]).key)
    }
  }, [options, metric])
  const sel = options.find((o) => o.key === metric)

  const a = acc.data
  const degenerate = !!a && a.model_version !== 'none' && a.classification.precision === 0 && a.classification.recall === 0 && a.classification.roc_auc <= 50
  const trained = !!a && a.model_version !== 'none'
  const sortedRisk = useMemo(() => [...(risk.data ?? [])].sort((x, y) => y.score - x.score), [risk.data])
  const [openRisk, setOpenRisk] = useState<string | null>(null)

  async function doRetrain() {
    setRetrain('queued…')
    try {
      const r = await fetch('/api/ml/retrain', { method: 'POST' })
      const j = await r.json()
      setRetrain(r.ok ? `job ${j.jobId ?? ''} ${j.status ?? 'queued'}` : (j.error ?? 'refused'))
      setTimeout(() => {
        acc.refresh()
        drift.refresh()
      }, 4000)
    } catch {
      setRetrain('failed')
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto px-6 py-7">
        <PageHead
          eyebrow={`ML lab · ${STATION_LABELS[station]}`}
          title="Predictions that show their working."
          sub="A model is only useful if you can see what it learned, how it scores and why it said what it said. This page keeps all three in view — including when the honest answer is 'not enough data yet'."
          right={
            <>
              <Pill tone={trained ? (degenerate ? 'warn' : 'ok') : 'mute'} dot>
                {trained ? (degenerate ? 'Trained · unvalidated' : 'Production model') : 'No model yet'}
              </Pill>
              <button onClick={doRetrain} className="rounded-lg border border-brand-border bg-brand-surface px-4 py-2 font-mono text-[11px] uppercase tracking-wider hover:border-cyan hover:text-cyan transition">
                Retrain
              </button>
            </>
          }
        />
        {retrain && <p className="font-mono text-[11px] text-cyan mb-4">Retrain: {retrain}</p>}

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 stagger">
                    <Tile label="Model version" value={a?.model_version ?? "…"} icon={<Brain size={15} />} hint={a ? `window ${a.window}` : undefined} />
          <Kpi label="Failure-in-24h · recall" value={a ? a.classification.recall : null} unit="%" digits={0} tone={degenerate ? 'warn' : 'primary'} icon={<Sigma size={15} />} hint={a ? `precision ${a.classification.precision.toFixed(0)}% · F1 ${a.classification.f1.toFixed(0)}%` : ''} />
          <Kpi label="Scored predictions" value={a?.evaluated_predictions ?? null} tone="ink" icon={<FlaskConical size={15} />} hint={a ? `${a.pending_predictions} awaiting outcome` : ''} />
          <Kpi label="Fuel days (fitted)" value={fuel.days !== null ? Math.round(fuel.days) : null} unit="days" tone={fuel.days !== null && fuel.days > 150 ? 'ok' : 'warn'} icon={<Fuel size={15} />} hint={fuel.burnLph ? `burn ${fmtNum(fuel.burnLph, 0)} L/h from 24 h of tank data` : 'collecting history…'} />
        </div>

        {degenerate && (
          <div className="mt-5 rounded-xl border border-amber/40 bg-amber/10 px-5 py-4">
            <p className="font-display text-[17px] text-white">This model has not been validated yet.</p>
            <p className="text-[13px] text-white/70 mt-1 leading-relaxed">
              Its validation window contains no failures, so precision, recall and ROC-AUC are undefined (the 100% accuracy is just &ldquo;nothing happened&rdquo;). Failure labels come from critical alerts in the incident history — the model needs recorded incidents before the numbers mean anything. We show this rather than hide it.
            </p>
          </div>
        )}

        <div className="grid xl:grid-cols-[1.5fr_1fr] gap-5 mt-5">
          <Panel
            eyebrow="Forecast · robust trend or daily cycle"
            title="Where this signal is heading"
            right={
              <div className="flex items-center gap-2">
                <select value={metric} onChange={(e) => setMetric(e.target.value)} className="rounded-lg border border-brand-border bg-brand-surface px-2.5 py-1.5 font-mono text-[11px] text-white max-w-[260px]">
                  {options.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.asset_id.replace(`${station}-`, '')} · {o.label}
                    </option>
                  ))}
                </select>
                <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className="rounded-lg border border-brand-border bg-brand-surface px-2.5 py-1.5 font-mono text-[11px] text-white">
                  {[7, 14, 30, 90].map((d) => (
                    <option key={d} value={d}>{d} days</option>
                  ))}
                </select>
              </div>
            }
          >
            {sel ? <ForecastChart metric={sel.key} unit={sel.unit} horizon={horizon} /> : <Skeleton className="h-64" />}
          </Panel>

          <Panel eyebrow="Model registry" title="What the model looks at" right={<LineChart size={16} className="text-white/40" />}>
            {drift.data && drift.data.featureImportance.length ? (
              <ul className="space-y-3">
                {[...drift.data.featureImportance].sort((x, y) => y.importance - x.importance).map((f) => (
                  <li key={f.feature}>
                    <Meter value={Math.max(f.importance * 100, 1)} max={100} tone="primary" height={7} label={<span className="font-mono">{f.feature}</span>} right={`${(f.importance * 100).toFixed(1)}%`} />
                  </li>
                ))}
              </ul>
            ) : (
              <Skeleton className="h-24" />
            )}
            <p className="text-[12px] text-white/55 mt-4 leading-relaxed">
              Random-forest classifier (failure within 24 h) and regressor (minutes to failure) over a generalised value series per asset — one feature set for every device type, so onboarding a new instrument needs no retraining pipeline change.
            </p>
            {drift.data?.featureImportance.every((f) => f.importance === 0) && (
              <p className="font-mono text-[10.5px] text-amber mt-2">All importances are 0 — the model found no signal in its (failure-free) training window.</p>
            )}
          </Panel>
        </div>

        <Panel className="mt-5" eyebrow="Explainable risk model" title="Why each subsystem scores what it does" right={<Pill tone="primary">weights × evidence</Pill>}>
          {risk.loading && !risk.data ? (
            <Skeleton className="h-48" />
          ) : sortedRisk.length === 0 ? (
            <p className="text-sm text-white/50">No risk cells computed for this station yet.</p>
          ) : (
            <ul className="divide-y divide-brand-border/70">
              {sortedRisk.map((r) => {
                const open = openRisk === r.id
                return (
                  <li key={r.id} className="py-3">
                    <button onClick={() => setOpenRisk(open ? null : r.id)} className="w-full text-left flex items-center gap-4">
                      <span className="font-mono text-[12px] uppercase tracking-wider text-white w-28 shrink-0">{r.subsystem}</span>
                      <div className="flex-1"><Meter value={r.score} tone={riskTone(r.score)} height={8} /></div>
                      <span className="font-display text-2xl num w-12 text-right" style={{ color: TONE_HEX[riskTone(r.score)] }}>{r.score.toFixed(0)}</span>
                    </button>
                    {open && (
                      <ul className="mt-3 ml-0 sm:ml-32 space-y-2.5 animate-fade-in">
                        {[...r.factors].sort((x, y) => y.score * y.weight - x.score * x.weight).map((f) => (
                          <li key={f.name} className="grid grid-cols-[1fr_auto] gap-x-4 items-center">
                            <div>
                              <p className="text-[13px] text-white">{f.label}</p>
                              <p className="font-mono text-[10.5px] text-white/50">{f.evidence}</p>
                            </div>
                            <p className="font-mono text-[11px] text-white/70 num text-right">
                              {f.score.toFixed(0)} × {(f.weight * 100).toFixed(0)}% = <b className="text-white">{(f.score * f.weight).toFixed(1)}</b>
                            </p>
                            <div className="col-span-2"><Meter value={f.score * f.weight} max={40} tone={riskTone(f.score)} height={4} /></div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
