'use client'

// Energy — the power-generation side of Operations: generators/CHP, fuel
// inventory, and a model-driven fuel outlook (how many days will it last, with
// an uncertainty band). Supply-chain concerns (vehicles, convoys, food/spares,
// manual stock entry) live on /logistics.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Fuel, Zap, Cloud, RefreshCw, Gauge, Flame, SlidersHorizontal, FlaskConical } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorState, InlineLoader, EmptyState } from '@/components/ui/Loader'
import { PageShell, PageHeader, Panel, MetricTile, SegTabs, Bar, SyntheticChip, labelClass } from '@/components/ui/Panel'
import { BandChart, ModelCard, type BandPoint } from '@/components/forecast/ForecastCharts'
import { logisticsService, type InventoryItem } from '@/services/logistics.service'
import { graphService } from '@/services/graph.service'
import type { GraphNode } from '@/types/graph'
import { useStationStore } from '@/store/useStationStore'
import { useLedgerStore } from '@/store/useLedgerStore'
import { useForecastModel } from '@/lib/forecast/useForecastModel'
import { buildOutlook, endurance_color, fmtDate, fmtDays } from '@/lib/forecast/outlook'
import { STATION_LABELS, HEALTH_COLORS } from '@/lib/constants'
import { CHART, fmtNum } from '@/lib/chartTheme'

const EMISSION_FACTOR_ATF_KG_PER_L = 2.52

export default function EnergyPage() {
  const station = useStationStore((s) => s.station)
  const entries = useLedgerStore((s) => s.entries)
  const deliveries = useLedgerStore((s) => s.deliveries)
  const { model, error: modelError } = useForecastModel()

  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [liveCarbonKg, setLiveCarbonKg] = useState<number | null>(null)
  const [powerAssets, setPowerAssets] = useState<GraphNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // what-if knobs for the forecast
  const [horizon, setHorizon] = useState<'30' | '60' | '90' | '180' | '365'>('90')
  const [crew, setCrew] = useState<number | null>(null)
  const [tempOffset, setTempOffset] = useState(0)
  const [useCalibration, setUseCalibration] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [inv, carbon, graph] = await Promise.allSettled([
        logisticsService.getInventory(station),
        logisticsService.getDailyCarbonKg(station),
        graphService.getLiveGraph(station),
      ])
      setInventory(inv.status === 'fulfilled' ? inv.value : [])
      setLiveCarbonKg(carbon.status === 'fulfilled' ? carbon.value : null)
      setPowerAssets(graph.status === 'fulfilled' ? graph.value.nodes.filter((n) => n.type === 'power') : [])
      if (inv.status === 'rejected' && graph.status === 'rejected') setError('Energy backend unavailable')
    } finally {
      setLoading(false)
    }
  }, [station])

  useEffect(() => { load() }, [load])
  useEffect(() => { setCrew(null); setTempOffset(0) }, [station])

  const fuelItems = useMemo(() => inventory.filter((i) => i.category === 'fuel'), [inventory])
  const foodItems = useMemo(() => inventory.filter((i) => i.category === 'food'), [inventory])
  const fuelL = fuelItems.reduce((s, i) => s + i.quantity, 0)
  const foodKg = foodItems.reduce((s, i) => s + i.quantity, 0)
  const reorderL = fuelItems.reduce((s, i) => s + (i.reorder_threshold ?? 0), 0)

  const outlook = useMemo(() => {
    if (!model) return null
    return buildOutlook(model, station, { fuelL, foodKg, fuelReserveL: reorderL || undefined }, {
      drivers: { headcount: crew ?? undefined, tempOffset },
      deliveries, entries, useCalibration,
    })
  }, [model, station, fuelL, foodKg, reorderL, crew, tempOffset, deliveries, entries, useCalibration])

  const horizonDays = Number(horizon)
  const defaultCrew = outlook?.forecast[0].headcount ?? 25

  const fuelChart: BandPoint[] = useMemo(() => {
    if (!outlook) return []
    return outlook.fuel.trajectory.slice(0, horizonDays + 1).map((p) => ({ x: p.date, mid: p.mid, lo: p.lo, hi: p.hi }))
  }, [outlook, horizonDays])

  const burnChart: BandPoint[] = useMemo(() => {
    if (!outlook || !model) return []
    const h = model.history[station]
    const lastHist = h.dates[h.dates.length - 1]
    const past: BandPoint[] = h.dates.map((d, i) => ({ x: d, actual: h.fuel_l[i], fit: h.fuel_l_pred[i] })).slice(-60)
    const future: BandPoint[] = outlook.forecast.filter((f) => f.date > lastHist).slice(0, 45)
      .map((f) => ({ x: f.date, mid: f.fuel_l.mid, lo: f.fuel_l.lo, hi: f.fuel_l.hi }))
    return [...past, ...future]
  }, [outlook, model, station])

  const powerChart: BandPoint[] = useMemo(() => {
    if (!outlook || !model) return []
    const h = model.history[station]
    const lastHist = h.dates[h.dates.length - 1]
    const past: BandPoint[] = h.dates.map((d, i) => ({ x: d, actual: h.power_kwh[i], fit: h.power_kwh_pred[i] })).slice(-60)
    const future: BandPoint[] = outlook.forecast.filter((f) => f.date > lastHist).slice(0, 45)
      .map((f) => ({ x: f.date, mid: f.power_kwh.mid, lo: f.power_kwh.lo, hi: f.power_kwh.hi }))
    return [...past, ...future]
  }, [outlook, model, station])

  const stationDeliveries = deliveries.filter((d) => d.station === station && d.resource === 'fuel')
  const refX = stationDeliveries
    .filter((d) => fuelChart.some((p) => p.x === d.date))
    .map((d) => ({ x: d.date, label: `+${fmtNum(d.amount)} L`, color: CHART.green }))

  const fuel = outlook?.fuel
  const days = fuel?.daysMid ?? null
  const color = endurance_color(days)
  const avgBurn = outlook?.fuel.avgDailyBurn ?? 0
  const avgKw = outlook ? outlook.forecast.slice(0, 30).reduce((s, f) => s + f.power_kwh.mid, 0) / 30 / 24 : 0
  const carbonKg = liveCarbonKg ?? (outlook ? avgBurn * EMISSION_FACTOR_ATF_KG_PER_L : null)
  const peakTodayKwh = outlook?.forecast[0].power_kwh.mid ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<Zap size={20} />}
        eyebrow="Operations"
        title={`Energy — ${STATION_LABELS[station]}`}
        subtitle="Generators and CHP, fuel on hand, and a model-driven outlook for how long the fuel will last under the weather and crew you expect."
        actions={
          <>
            <SyntheticChip />
            <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={load}>Refresh</Button>
          </>
        }
      />

      {loading && <div className="flex justify-center py-16"><InlineLoader text="Loading energy data…" /></div>}
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      {modelError && <ErrorState message={modelError} />}

      {!loading && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <MetricTile label="Fuel on hand" value={fmtNum(fuelL)} unit="L" icon={<Fuel size={15} />}
              hint={reorderL ? `Reorder level ${fmtNum(reorderL)} L` : undefined} />
            <MetricTile label="Fuel endurance" value={fuel ? fmtDays(days) : '…'} unit="days" color={color} icon={<Gauge size={15} />}
              hint={fuel ? `Range ${fmtDays(fuel.daysEarliest)}–${fmtDays(fuel.daysLatest)} d` : undefined} />
            <MetricTile label="Projected run-out" value={fuel ? fmtDate(fuel.runoutDate) : '…'} color={color} icon={<Flame size={15} />}
              hint={fuel && fuel.daysToReserve != null ? `Hits reorder level in ${fuel.daysToReserve} d` : 'No resupply scheduled'} />
            <MetricTile label="Avg burn (forecast)" value={fmtNum(avgBurn)} unit="L/day" icon={<Fuel size={15} />}
              hint={outlook?.calibration && useCalibration ? `Calibrated ×${outlook.calibration.factor.toFixed(2)}` : 'Model, uncalibrated'} />
            <MetricTile label="Electrical demand" value={fmtNum(avgKw, 0)} unit="kW avg" icon={<Zap size={15} />}
              hint={`${fmtNum(peakTodayKwh)} kWh expected today`} />
            <MetricTile label="Carbon output" value={carbonKg != null ? (carbonKg / 1000).toFixed(2) : '—'} unit="t CO₂e/day" icon={<Cloud size={15} />}
              hint={liveCarbonKg != null ? 'From live telemetry' : 'Modelled from burn × 2.52 kg/L'} />
          </div>

          {/* Fuel outlook + drivers */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4">
            <Panel
              title="Fuel outlook" icon={<Fuel size={14} />}
              subtitle={fuel ? (
                days === null
                  ? `Stock lasts beyond the ${fuel.horizon}-day horizon at the expected burn.`
                  : `At the expected burn the fuel runs out around ${fmtDate(fuel.runoutDate)} — between day ${fmtDays(fuel.daysEarliest)} (heavy burn) and day ${fmtDays(fuel.daysLatest)} (light burn).`
              ) : 'Loading model…'}
              actions={<SegTabs value={horizon} onChange={setHorizon} size="sm"
                options={[{ value: '30', label: '30d' }, { value: '60', label: '60d' }, { value: '90', label: '90d' }, { value: '180', label: '180d' }, { value: '365', label: '1y' }]} />}
            >
              {outlook ? (
                <BandChart
                  data={fuelChart} color={color === '#1F9E6D' ? CHART.blue : color} unit="L" height={300}
                  midName="Projected fuel level" bandName="Heavy ↔ light burn"
                  refY={reorderL ? { value: reorderL, label: 'Reorder level', color: CHART.amber } : undefined}
                  refX={refX} yDomain={[0, 'auto']} yFormat={(v) => `${fmtNum(v / 1000)}k`}
                />
              ) : <div className="h-[300px] flex items-center justify-center"><InlineLoader text="Loading forecast model…" /></div>}
            </Panel>

            <Panel title="Forecast drivers" icon={<SlidersHorizontal size={14} />} subtitle="Change what you expect — the outlook updates instantly.">
              <div className="space-y-5">
                <div>
                  <label className={labelClass}>Crew on station: <span className="text-cyan font-bold">{crew ?? defaultCrew}</span></label>
                  <input type="range" min={8} max={70} value={crew ?? defaultCrew} onChange={(e) => setCrew(Number(e.target.value))} className="w-full accent-cyan" />
                  <div className="flex justify-between font-mono text-[10px] text-white/55"><span>8</span><span>seasonal default {defaultCrew}</span><span>70</span></div>
                </div>
                <div>
                  <label className={labelClass}>Temperature vs normal: <span className="text-cyan font-bold">{tempOffset > 0 ? '+' : ''}{tempOffset} °C</span></label>
                  <input type="range" min={-10} max={10} step={1} value={tempOffset} onChange={(e) => setTempOffset(Number(e.target.value))} className="w-full accent-cyan" />
                  <div className="flex justify-between font-mono text-[10px] text-white/55"><span>colder</span><span>normal</span><span>warmer</span></div>
                </div>
                <label className="flex items-start gap-2.5 cursor-pointer rounded-md border border-brand-border bg-brand-surface-2 p-3">
                  <input type="checkbox" className="accent-cyan mt-0.5" checked={useCalibration} disabled={!outlook?.calibration}
                    onChange={(e) => setUseCalibration(e.target.checked)} />
                  <span className="font-sans text-xs text-white/80 leading-relaxed">
                    <span className="font-semibold text-white">Calibrate to manual burn log</span><br />
                    {outlook?.calibration
                      ? `You logged ${outlook.calibration.observedAvg.toFixed(0)} L/day on average over ${outlook.calibration.samples} entries; the model expected ${outlook.calibration.modelAvg.toFixed(0)}. Scale forecast ×${outlook.calibration.factor.toFixed(2)}.`
                      : 'Log at least 3 daily fuel-consumption entries on the Logistics page to enable this.'}
                  </span>
                </label>
                <p className="font-sans text-[11px] text-white/62 leading-relaxed">
                  Scheduled resupplies you add on <span className="font-semibold">Logistics → Expected resupply</span> appear on the chart as green markers and extend the run-out date.
                </p>
              </div>
            </Panel>
          </div>

          {/* Burn + load charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="Daily fuel burn" subtitle="Last 60 days: synthetic actuals vs. model fit, then the next 45 days with an 80% band." icon={<Fuel size={14} />}>
              {outlook ? <BandChart data={burnChart} unit="L/day" height={250} yFormat={(v) => fmtNum(v)} /> : null}
            </Panel>
            <Panel title="Electrical demand" subtitle="Energy the generators must supply per day (kWh) — heating load climbs as it gets colder and windier." icon={<Zap size={14} />}>
              {outlook ? <BandChart data={powerChart} unit="kWh/day" color={CHART.violet} height={250} yFormat={(v) => fmtNum(v)} /> : null}
            </Panel>
          </div>

          {/* Generators + inventory */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="Generators / CHP / power assets" icon={<Zap size={14} />}>
              {powerAssets.length === 0 ? (
                <EmptyState message="No power assets found" />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {powerAssets.map((a) => (
                    <div key={a.id} className="rounded-md border border-brand-border bg-brand-surface-2 p-3">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-sm font-sans font-medium text-white leading-snug">{a.label}</span>
                        <Badge variant={a.health === 'healthy' ? 'healthy' : a.health === 'critical' ? 'critical' : a.health === 'unreachable' ? 'neutral' : 'warning'} size="sm">{a.health}</Badge>
                      </div>
                      <p className="font-mono text-[11px] text-white/62 uppercase mb-2">{a.subtype ?? a.type}</p>
                      <Bar value={a.healthScore} color={HEALTH_COLORS[a.health]} />
                      <p className="font-mono text-xs mt-1.5" style={{ color: HEALTH_COLORS[a.health] }}>{a.healthScore} health</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Fuel inventory" icon={<Fuel size={14} />} subtitle="Counts are entered manually — see Logistics → Manual entry.">
              {fuelItems.length === 0 ? (
                <EmptyState message="No fuel inventory records" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="font-mono text-[11px] uppercase tracking-wider text-white/62 text-left">
                        <th className="py-1.5 pr-3 font-semibold">Tank / cache</th>
                        <th className="py-1.5 pr-3 font-semibold text-right">Quantity</th>
                        <th className="py-1.5 pr-3 font-semibold text-right">Cover</th>
                        <th className="py-1.5 font-semibold text-right">Reorder at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fuelItems.map((item) => {
                        const low = item.reorder_threshold !== null && item.quantity <= item.reorder_threshold
                        return (
                          <tr key={item.id} className="border-t border-brand-border">
                            <td className="py-2 pr-3 font-sans text-white">{item.name}</td>
                            <td className={`py-2 pr-3 font-mono text-right ${low ? 'text-crimson font-bold' : 'text-white'}`}>{fmtNum(item.quantity)} {item.unit}</td>
                            <td className="py-2 pr-3 font-mono text-right text-white/80">{avgBurn ? `${fmtNum(item.quantity / avgBurn, 0)} d` : '—'}</td>
                            <td className="py-2 font-mono text-right text-white/70">{item.reorder_threshold?.toLocaleString() ?? '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          {model && (
            <Panel title="About this forecast" icon={<FlaskConical size={14} />}
              subtitle={`${model.meta.algorithm}. Features: season, crew, air temperature, wind, blizzard, science activity, vehicle hours.`}>
              <ModelCard model={model} target="fuel_l" />
            </Panel>
          )}
        </>
      )}
    </PageShell>
  )
}
