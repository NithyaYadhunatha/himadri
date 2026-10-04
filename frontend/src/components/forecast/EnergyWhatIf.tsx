// src/components/forecast/EnergyWhatIf.tsx
//
// Model-driven what-if for the Energy page. Every slider re-runs the trained
// gradient-boosting consumption model (crew, temperature and wind are real model
// inputs; "extra load" scales the result) and the chart compares the baseline
// fuel trajectory with the scenario — so the output is a prediction, not
// the current tank level divided by a number.
'use client'

import { useMemo, useState } from 'react'
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { RotateCcw, TrendingDown, TrendingUp } from 'lucide-react'
import { Panel, Pill, Skeleton } from '@/components/ui/kit'
import { ChartTooltip, LegendDot, labelClass } from '@/components/ui/Panel'
import { useForecastModel } from '@/lib/ml/useForecastModel'
import { buildOutlook, fmtDate } from '@/lib/ml/outlook'
import type { StationKey } from '@/lib/ml/engine'
import { CHART, axisTick, gridProps, shortDate, fmtNum } from '@/lib/chartTheme'

const CO2_KG_PER_L = 2.68

function Slider({ label, value, shown, min, max, step, onChange }: { label: string; value: number; shown: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className={labelClass}>{label}: <span className="text-cyan font-bold">{shown}</span></label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#1D1C93]" />
    </div>
  )
}

export function EnergyWhatIf({ station, fuelL, isolationDays }: { station: StationKey; fuelL: number; isolationDays: number }) {
  const { model, error } = useForecastModel()
  const [crew, setCrew] = useState<number | null>(null)
  const [temp, setTemp] = useState(0)
  const [wind, setWind] = useState(100)
  const [load, setLoad] = useState(0)

  const base = useMemo(() => (model && fuelL > 0 ? buildOutlook(model, station, { fuelL, foodKg: 0 }) : null), [model, station, fuelL])
  const scen = useMemo(
    () => (model && fuelL > 0
      ? buildOutlook(model, station, { fuelL, foodKg: 0 }, { drivers: { headcount: crew ?? undefined, tempOffset: temp, windScale: wind / 100, calibration: 1 + load / 100 } })
      : null),
    [model, station, fuelL, crew, temp, wind, load],
  )

  const defaultCrew = base?.forecast[0].headcount ?? 25
  const changed = crew !== null || temp !== 0 || wind !== 100 || load !== 0
  const bd = base?.fuel.daysMid ?? null
  const sd = scen?.fuel.daysMid ?? null
  const horizon = Math.min(365, Math.max(60, Math.ceil(Math.max(bd ?? 0, sd ?? 0, isolationDays) * 1.15)))
  const delta = bd !== null && sd !== null ? sd - bd : null

  const rows = useMemo(() => {
    if (!base || !scen) return []
    return base.fuel.trajectory.slice(0, horizon + 1).map((p, i) => ({ x: p.date, base: p.mid, scenario: scen.fuel.trajectory[i]?.mid ?? null }))
  }, [base, scen, horizon])

  const margin = sd !== null ? sd - isolationDays : null
  const burnB = base?.fuel.avgDailyBurn ?? 0
  const burnS = scen?.fuel.avgDailyBurn ?? 0
  const kwB = base ? base.forecast.slice(0, 30).reduce((a, f) => a + f.power_kwh.mid, 0) / 30 : 0
  const kwS = scen ? scen.forecast.slice(0, 30).reduce((a, f) => a + f.power_kwh.mid, 0) / 30 : 0
  const tone = margin === null ? 'text-white' : margin >= 30 ? 'text-emerald' : margin >= 0 ? 'text-amber' : 'text-crimson'

  return (
    <Panel eyebrow="What-if · model prediction" title="What happens to the fuel if conditions change?"
      right={<Pill tone="primary">re-runs the model</Pill>}>
      {error && <p className="font-mono text-[12px] text-crimson mb-2">{error}</p>}
      <div className="grid xl:grid-cols-[300px_minmax(0,1fr)] gap-6">
        <div className="space-y-4">
          <Slider label="Crew on station" value={crew ?? defaultCrew} shown={String(crew ?? defaultCrew)} min={8} max={70} step={1} onChange={setCrew} />
          <Slider label="Temperature vs normal" value={temp} shown={`${temp > 0 ? '+' : ''}${temp} °C`} min={-12} max={12} step={1} onChange={setTemp} />
          <Slider label="Wind vs normal" value={wind} shown={`${wind}%`} min={50} max={200} step={10} onChange={setWind} />
          <Slider label="Extra heating / process load" value={load} shown={`${load > 0 ? '+' : ''}${load}%`} min={-20} max={80} step={5} onChange={setLoad} />
          <button type="button" disabled={!changed} onClick={() => { setCrew(null); setTemp(0); setWind(100); setLoad(0) }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-white/80 hover:border-cyan disabled:opacity-40">
            <RotateCcw size={12} /> Reset to baseline
          </button>
          <p className="font-mono text-[10.5px] text-white/60 leading-relaxed">Crew, temperature and wind are inputs to the trained model; the load slider scales its output. Synthetic-trained — directional, not validated.</p>
        </div>

        <div className="min-w-0">
          {!base || !scen ? <Skeleton className="h-72" /> : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-xl border border-brand-border bg-brand-surface-2/60 p-3.5">
                  <p className="eyebrow">Baseline</p>
                  <p className="font-display text-3xl num text-white">{bd ?? `>${base.fuel.horizon}`}<span className="text-sm text-white/65 font-mono"> days</span></p>
                  <p className="font-mono text-[10.5px] text-white/65 mt-1">{fmtDate(base.fuel.runoutDate)}</p>
                </div>
                <div className="rounded-xl border border-cyan/50 bg-cyan/5 p-3.5">
                  <p className="eyebrow">Scenario</p>
                  <p className={`font-display text-3xl num ${tone}`}>{sd ?? `>${scen.fuel.horizon}`}<span className="text-sm text-white/65 font-mono"> days</span></p>
                  <p className="font-mono text-[10.5px] text-white/65 mt-1">{fmtDate(scen.fuel.runoutDate)}</p>
                </div>
                <div className="rounded-xl border border-brand-border bg-brand-surface-2/60 p-3.5">
                  <p className="eyebrow">Change</p>
                  <p className={`font-display text-3xl num flex items-center gap-1.5 ${delta === null || delta === 0 ? 'text-white' : delta < 0 ? 'text-crimson' : 'text-emerald'}`}>
                    {delta === null ? '—' : <>{delta < 0 ? <TrendingDown size={20} /> : delta > 0 ? <TrendingUp size={20} /> : null}{delta > 0 ? '+' : ''}{delta}</>}
                    <span className="text-sm text-white/65 font-mono">days</span>
                  </p>
                  <p className="font-mono text-[10.5px] text-white/65 mt-1">{changed ? 'vs baseline' : 'move a slider'}</p>
                </div>
                <div className="rounded-xl border border-brand-border bg-brand-surface-2/60 p-3.5">
                  <p className="eyebrow">vs {isolationDays} d isolation</p>
                  <p className={`font-display text-3xl num ${tone}`}>{margin === null ? '—' : `${margin >= 0 ? '+' : ''}${fmtNum(margin)}`}<span className="text-sm text-white/65 font-mono"> days</span></p>
                  <p className="font-mono text-[10.5px] text-white/65 mt-1">{margin === null ? 'beyond model horizon' : margin >= 0 ? 'covers the window' : 'shortfall — resupply'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-wrap mt-4 mb-1">
                <LegendDot color={CHART.ink} label="Baseline" dashed />
                <LegendDot color={changed ? CHART.blue : CHART.muted} label="Scenario" />
                <LegendDot color={CHART.red} label={`${isolationDays} d isolation`} dashed />
              </div>
              <div style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="x" tick={axisTick} tickFormatter={shortDate} minTickGap={36} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} tickFormatter={(v) => `${fmtNum(v / 1000)}k`} axisLine={false} tickLine={false} width={44} domain={[0, 'auto']} />
                    <Tooltip content={<ChartTooltip labelFormatter={(l) => shortDate(String(l))} format={(v) => `${fmtNum(v)} L`} />} />
                    <Line type="monotone" dataKey="base" name="Baseline" stroke={CHART.ink} strokeWidth={1.6} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="scenario" name="Scenario" stroke={changed ? CHART.blue : CHART.muted} strokeWidth={2.6} dot={false} isAnimationActive={false} />
                    {rows[isolationDays] && <ReferenceLine x={rows[isolationDays].x} stroke={CHART.red} strokeDasharray="4 4" />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mt-3">
                {[
                  { l: 'Daily fuel burn', a: burnB, b: burnS, u: 'L/day' },
                  { l: 'Electrical demand', a: kwB, b: kwS, u: 'kWh/day' },
                  { l: 'CO₂ per day', a: burnB * CO2_KG_PER_L, b: burnS * CO2_KG_PER_L, u: 'kg' },
                ].map((r) => (
                  <div key={r.l} className="rounded-xl border border-brand-border px-3.5 py-2.5">
                    <p className="eyebrow">{r.l}</p>
                    <p className="font-mono text-[13px] text-white mt-1">
                      {fmtNum(r.a)} → <b className={r.b > r.a * 1.005 ? 'text-crimson' : r.b < r.a * 0.995 ? 'text-emerald' : ''}>{fmtNum(r.b)}</b> <span className="text-white/60">{r.u}</span>
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}
