// src/components/forecast/EnergyOutlook.tsx
//
// The model-driven "prediction layer" for the Energy page: how many days the
// fuel will last (with an earliest/latest range), daily burn and electrical
// demand forecasts, and the scorecard of the model behind them. Stock comes
// from the live tank sensors (or counted inventory); the forecast itself comes
// from the gradient-boosting model trained on the synthetic dataset.
'use client'

import { useMemo, useState } from 'react'
import { Fuel, Zap, SlidersHorizontal, FlaskConical, Gauge } from 'lucide-react'
import { Kpi, Tile, Panel, Pill, Skeleton, type Tone } from '@/components/ui/kit'
import { BandChart, ModelCard, type BandPoint } from '@/components/forecast/ForecastCharts'
import { SegTabs, labelClass } from '@/components/ui/Panel'
import { useForecastModel } from '@/lib/ml/useForecastModel'
import { buildOutlook, fmtDate, fmtDays } from '@/lib/ml/outlook'
import { useLedgerStore } from '@/store/useLedgerStore'
import { CHART, fmtNum } from '@/lib/chartTheme'
import type { StationKey } from '@/lib/ml/engine'

export function EnergyOutlook({ station, fuelL, reorderL }: { station: StationKey; fuelL: number; reorderL?: number }) {
  const { model, error } = useForecastModel()
  const deliveries = useLedgerStore((s) => s.deliveries)
  const entries = useLedgerStore((s) => s.entries)
  const [horizon, setHorizon] = useState<'30' | '90' | '180' | '365'>('90')
  const [crew, setCrew] = useState<number | null>(null)
  const [tempOffset, setTempOffset] = useState(0)
  const [calibrate, setCalibrate] = useState(false)

  const outlook = useMemo(
    () => (model && fuelL > 0
      ? buildOutlook(model, station, { fuelL, foodKg: 0, fuelReserveL: reorderL }, { drivers: { headcount: crew ?? undefined, tempOffset }, deliveries, entries, useCalibration: calibrate })
      : null),
    [model, station, fuelL, reorderL, crew, tempOffset, deliveries, entries, calibrate],
  )

  const days = outlook?.fuel.daysMid ?? null
  const tone: Tone = days === null ? 'ok' : days < 30 ? 'crit' : days < 90 ? 'warn' : 'ok'
  const color = tone === 'crit' ? CHART.red : tone === 'warn' ? CHART.amber : CHART.blue
  const defaultCrew = outlook?.forecast[0].headcount ?? 25
  const hDays = Number(horizon)

  const series = (key: 'fuel_l' | 'power_kwh', hist: 'fuel_l' | 'power_kwh'): BandPoint[] => {
    if (!outlook || !model) return []
    const h = model.history[station]
    const last = h.dates[h.dates.length - 1]
    const past = h.dates.map((d, i) => ({ x: d, actual: h[hist][i], fit: h[`${hist}_pred` as 'fuel_l_pred'][i] })).slice(-60)
    const future = outlook.forecast.filter((f) => f.date > last).slice(0, 45).map((f) => ({ x: f.date, mid: f[key].mid, lo: f[key].lo, hi: f[key].hi }))
    return [...past, ...future]
  }

  const fuelChart: BandPoint[] = outlook ? outlook.fuel.trajectory.slice(0, hDays + 1).map((p) => ({ x: p.date, mid: p.mid, lo: p.lo, hi: p.hi })) : []
  const refX = deliveries
    .filter((d) => d.station === station && d.resource === 'fuel' && fuelChart.some((p) => p.x === d.date))
    .map((d) => ({ x: d.date, label: `+${fmtNum(d.amount)} L`, color: CHART.green as string }))
  const avgBurn = outlook?.fuel.avgDailyBurn ?? 0
  const avgKw = outlook ? outlook.forecast.slice(0, 30).reduce((a, f) => a + f.power_kwh.mid, 0) / 30 / 24 : 0

  return (
    <div className="mt-8 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Prediction layer · gradient-boosting model</p>
          <h2 className="font-display text-[26px] leading-tight text-white mt-1">How many days will the fuel last?</h2>
        </div>
        <Pill tone="warn">trained on synthetic data · not validated on real data</Pill>
      </div>

      {error && <p className="font-mono text-[12px] text-crimson">{error}</p>}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 stagger">
        <Kpi label="Predicted endurance" value={days} unit="days" tone={tone} icon={<Gauge size={15} />}
          hint={outlook ? `range ${fmtDays(outlook.fuel.daysEarliest)}–${fmtDays(outlook.fuel.daysLatest)} d` : fuelL > 0 ? 'loading model…' : 'no fuel level yet'} />
        <Tile label="Run-out date" value={outlook ? fmtDate(outlook.fuel.runoutDate) : '—'} tone={tone} icon={<Fuel size={15} />} hint={outlook?.fuel.daysToReserve != null ? `reorder level in ${outlook.fuel.daysToReserve} d` : 'at expected burn'} />
        <Kpi label="Expected burn" value={avgBurn || null} unit="L/day" tone="warn" icon={<Fuel size={15} />}
          hint={outlook?.calibration && calibrate ? `calibrated ×${outlook.calibration.factor.toFixed(2)}` : 'model, uncalibrated'} />
        <Kpi label="Electrical demand" value={avgKw || null} unit="kW avg" tone="primary" icon={<Zap size={15} />} hint="next 30 days, from weather & crew" />
      </div>

      <div className="grid xl:grid-cols-[1.6fr_1fr] gap-5">
        <Panel eyebrow="Projection" title="Fuel level until run-out"
          right={<SegTabs size="sm" value={horizon} onChange={setHorizon} options={[{ value: '30', label: '30d' }, { value: '90', label: '90d' }, { value: '180', label: '180d' }, { value: '365', label: '1y' }]} />}>
          {outlook ? (
            <BandChart data={fuelChart} color={color} unit="L" height={290} midName="Projected fuel level" bandName="Heavy ↔ light burn"
              refY={reorderL ? { value: reorderL, label: 'Reorder level', color: CHART.amber } : undefined} refX={refX} yDomain={[0, 'auto']} yFormat={(v) => `${fmtNum(v / 1000)}k`} />
          ) : <Skeleton className="h-[290px]" />}
        </Panel>

        <Panel eyebrow="What-if" title="Forecast drivers" right={<SlidersHorizontal size={15} className="text-white/62" />}>
          <div className="space-y-5">
            <div>
              <label className={labelClass}>Crew on station: <span className="text-cyan font-bold">{crew ?? defaultCrew}</span></label>
              <input type="range" min={8} max={70} value={crew ?? defaultCrew} onChange={(e) => setCrew(Number(e.target.value))} className="w-full accent-[#1D1C93]" />
            </div>
            <div>
              <label className={labelClass}>Temperature vs normal: <span className="text-cyan font-bold">{tempOffset > 0 ? '+' : ''}{tempOffset} °C</span></label>
              <input type="range" min={-10} max={10} value={tempOffset} onChange={(e) => setTempOffset(Number(e.target.value))} className="w-full accent-[#1D1C93]" />
            </div>
            <label className="flex items-start gap-2.5 rounded-xl border border-brand-border bg-brand-surface-2/60 p-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-[#1D1C93]" checked={calibrate} disabled={!outlook?.calibration} onChange={(e) => setCalibrate(e.target.checked)} />
              <span className="text-[12.5px] text-white/80 leading-relaxed">
                <b className="text-white">Calibrate to my manual burn log</b><br />
                {outlook?.calibration
                  ? `You logged ${outlook.calibration.observedAvg.toFixed(0)} L/day over ${outlook.calibration.samples} entries; model expected ${outlook.calibration.modelAvg.toFixed(0)}. Scale ×${outlook.calibration.factor.toFixed(2)}.`
                  : 'Log 3+ daily fuel-use entries on Logistics to enable.'}
              </span>
            </label>
            <p className="font-mono text-[10.5px] text-white/55 leading-relaxed">Expected resupplies added on Logistics appear as green markers and push the run-out date out.</p>
          </div>
        </Panel>
      </div>

      <div className="grid xl:grid-cols-2 gap-5">
        <Panel eyebrow="Fuel" title="Daily burn · actual vs model, then forecast">
          {outlook ? <BandChart data={series('fuel_l', 'fuel_l')} unit="L/day" height={240} yFormat={(v) => fmtNum(v)} /> : <Skeleton className="h-60" />}
        </Panel>
        <Panel eyebrow="Power" title="Electrical demand · actual vs model, then forecast">
          {outlook ? <BandChart data={series('power_kwh', 'power_kwh')} unit="kWh/day" color={CHART.violet} height={240} yFormat={(v) => fmtNum(v)} /> : <Skeleton className="h-60" />}
        </Panel>
      </div>

      {model && (
        <Panel eyebrow="Model card" title="About this forecast" right={<FlaskConical size={15} className="text-white/62" />}>
          <ModelCard model={model} target="fuel_l" />
        </Panel>
      )}
    </div>
  )
}
