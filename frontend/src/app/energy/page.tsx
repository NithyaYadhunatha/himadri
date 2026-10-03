'use client'

// Energy — generation, fuel and how long the station can last. Fuel numbers
// are derived from the live tank-level sensors (litres on hand, fitted burn
// rate, or the trained model's burn when the tanks give no usable drawdown);
// the what-if panel re-runs the model for crew, weather and load changes.
import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Cloud, Fuel, Gauge, Zap } from 'lucide-react'
import { useStationStore } from '@/store/useStationStore'
import { STATION_LABELS } from '@/lib/constants'
import { useBackend } from '@/lib/hooks/usePoll'
import { useFuelOutlook } from '@/lib/hooks/useFuelOutlook'
import { Kpi, Panel, PageHead, Pill, Meter, Provenance, Skeleton, Spark, type Tone } from '@/components/ui/kit'
import { fmtNum, naiveUtc, toMs } from '@/lib/format'
import { EnergyOutlook } from '@/components/forecast/EnergyOutlook'
import { EnergyWhatIf } from '@/components/forecast/EnergyWhatIf'

interface SeriesRow {
  key: string
  asset_id: string
  station_id: string
  label: string
  unit: string
}
interface Bucket {
  ts: string
  value: number
}
interface Latest {
  [k: string]: { value: number; ts: string } | null
}
interface Endurance {
  isolation_days_remaining: number
}
interface Rule {
  asset_id: string | null
  series_key: string
  type: string
  params: { threshold?: number }
  severity: string
}

const CO2_KG_PER_LITRE_DIESEL = 2.68 // IPCC default emission factor for diesel/gasoil combustion

const COLORS = ['#1D1C93', '#0F8A6A', '#D4820A', '#A04FB8', '#C23B3B']

function PowerChart({ station, keys }: { station: string; keys: SeriesRow[] }) {
  const [rows, setRows] = useState<Record<string, number | string>[] | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const from = naiveUtc(Date.now() - 36 * 3600 * 1000)
      const per = await Promise.all(
        keys.map((k) =>
          fetch(`/api/backend/series/${encodeURIComponent(k.key)}/readings?from=${encodeURIComponent(from)}&bucket=1h`)
            .then((r) => (r.ok ? r.json() : []))
            .then((b: Bucket[]) => ({ k, b })),
        ),
      )
      const m = new Map<number, Record<string, number | string>>()
      for (const { k, b } of per) {
        for (const p of b) {
          const t = toMs(p.ts)
          const row = m.get(t) ?? { t }
          row[k.asset_id] = Number(p.value.toFixed(1))
          m.set(t, row)
        }
      }
      if (alive) setRows([...m.values()].sort((a, b) => Number(a.t) - Number(b.t)))
    })()
    return () => {
      alive = false
    }
  }, [station, keys])
  if (!rows) return <Skeleton className="h-64" />
  if (rows.length < 2) return <p className="font-mono text-[12px] text-white/70">Not enough power history yet.</p>
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#8E8EB0" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => new Date(t).toISOString().slice(11, 16)} tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#626079' }} axisLine={false} tickLine={false} minTickGap={36} />
          <YAxis tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#626079' }} axisLine={false} tickLine={false} width={40} unit=" kW" />
          <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #8E8EB0', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 11 }} labelFormatter={(t) => new Date(Number(t)).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'} />
          {keys.map((k, i) => (
            <Area key={k.asset_id} dataKey={k.asset_id} name={k.asset_id.replace(`${station}-power-`, '')} type="monotone" stackId="p" stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.18} strokeWidth={1.8} isAnimationActive={false} connectNulls />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function EnergyPage() {
  const station = useStationStore((s) => s.station)
  const series = useBackend<SeriesRow[]>('series', 120000)
  const endurance = useBackend<Endurance>(`logistics/endurance?station=${station}`, 60000)
  const rules = useBackend<Rule[]>('alert-rules', 120000)
  const fuel = useFuelOutlook(station)
  const isolation = endurance.data?.isolation_days_remaining ?? 150

  const powerKeys = useMemo(() => (series.data ?? []).filter((s) => s.station_id === station && s.label === 'power_kw'), [series.data, station])
  const powerLatest = useBackend<Latest>(powerKeys.length ? `readings/latest?keys=${powerKeys.map((k) => encodeURIComponent(k.key)).join(',')}` : null, 15000)
  const totalKw = powerKeys.reduce((a, k) => a + (powerLatest.data?.[k.key]?.value ?? 0), 0)
  const vals = powerKeys.map((k) => powerLatest.data?.[k.key]?.value ?? 0)
  const imbalance = vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : 0

  const thresholds = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rules.data ?? []) if (r.type === 'below' && r.asset_id && r.params.threshold) m.set(r.asset_id, r.params.threshold)
    return m
  }, [rules.data])

  const scaledBurn = fuel.burnUsedLph
  const days = fuel.daysUsed
  const margin = days !== null ? days - isolation : null
  const marginTone: Tone = margin === null ? 'mute' : margin >= 30 ? 'ok' : margin >= 0 ? 'warn' : 'crit'
  const co2PerDay = scaledBurn * 24 * CO2_KG_PER_LITRE_DIESEL

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto px-6 py-7">
        <PageHead
          eyebrow={`Energy & fuel · ${STATION_LABELS[station]}`}
          title="How long can we keep the lights on?"
          sub="Generation from the live power assets, fuel on hand from the tank sensors, and the margin between endurance and the days of isolation still ahead."
          right={<Provenance kind="derived" />}
        />

        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 stagger">
          <Kpi label="Generation now" value={totalKw || null} unit="kW" digits={1} tone="primary" icon={<Zap size={15} />} hint={`${powerKeys.length} power assets reporting`} />
          <Kpi label="Fuel on hand" value={fuel.totalL ? fuel.totalL / 1000 : null} unit="kL" digits={0} tone="ink" icon={<Fuel size={15} />} hint={`${fuel.tanks.length} tanks & caches · live levels`} spark={fuel.history.map((h) => h.litres)} />
          <Kpi label="Burn rate" value={scaledBurn || null} unit="L/h" digits={0} tone="warn" icon={<Gauge size={15} />} hint={fuel.source === 'telemetry' ? 'fitted from recent tank data' : fuel.source === 'model' ? 'model estimate — tank history too flat/stale' : 'collecting history…'} />
          <Kpi label="Endurance" value={days !== null ? Math.round(days) : null} unit="days" tone={marginTone} hint={margin !== null ? `${margin >= 0 ? '+' : ''}${fmtNum(margin)} d vs ${isolation} d isolation${fuel.source === 'model' ? ' · model' : ''}` : 'needs burn-rate history'} />
          <Kpi label="CO₂e per day" value={scaledBurn ? co2PerDay / 1000 : null} unit="t" digits={1} tone="ink" icon={<Cloud size={15} />} hint={`${CO2_KG_PER_LITRE_DIESEL} kg/L diesel (IPCC default)`} />
        </div>

        <div className="grid xl:grid-cols-[1.5fr_1fr] gap-5 mt-5">
          <Panel eyebrow="Last 36 hours" title="Power generation by asset" right={imbalance > 25 ? <Pill tone="warn">load imbalance {imbalance.toFixed(0)} kW</Pill> : <Pill tone="ok">balanced</Pill>}>
            {powerKeys.length ? <PowerChart station={station} keys={powerKeys} /> : <Skeleton className="h-64" />}
          </Panel>

        </div>

        <Panel className="mt-5" eyebrow="Live tank levels" title="Fuel tanks & caches" right={<span className="font-mono text-[10.5px] text-white/65">{fuel.measuredTanks} tank(s) measured · others extrapolated</span>}>
          {fuel.loading && fuel.tanks.length === 0 ? (
            <Skeleton className="h-40" />
          ) : fuel.tanks.length === 0 ? (
            <p className="text-sm text-white/70">No tank-level series registered for this station.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...fuel.tanks].sort((a, b) => b.litres - a.litres).map((t) => {
                const th = thresholds.get(t.asset_id)
                const max = Math.max(60000, t.litres * 1.15)
                const low = th !== undefined && t.litres < th * 1.5
                return (
                  <div key={t.key} className="rounded-xl border border-brand-border bg-brand-surface-2/50 p-3.5">
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-[11px] text-white truncate">{t.asset_id.replace(`${station}-storage-`, '')}</p>
                      {t.isStore ? <Pill tone="mute">store</Pill> : low ? <Pill tone="crit">low</Pill> : <Pill tone="ok">ok</Pill>}
                    </div>
                    <p className="font-display text-2xl text-white num mt-1">{fmtNum(t.litres)} <span className="text-[11px] font-mono text-white/62">L</span></p>
                    <div className="relative mt-2">
                      <Meter value={t.litres} max={max} tone={low ? 'crit' : 'primary'} height={6} />
                      {th !== undefined && <span className="absolute top-[-3px] w-px h-[12px] bg-crimson" style={{ left: `${Math.min(100, (th / max) * 100)}%` }} title={`alert below ${th} L`} />}
                    </div>
                    <div className="mt-2 -mb-1"><Spark values={t.spark} tone="primary" height={26} /></div>
                    <p className="font-mono text-[10px] text-white/62 mt-1">{t.isStore ? 'strategic reserve — not drawn daily' : t.burnLph ? `burn ${t.burnLph.toFixed(1)} L/h` : 'burn extrapolated'}</p>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <div className="mt-8"><EnergyWhatIf station={station} fuelL={fuel.totalL} isolationDays={isolation} /></div>
        <EnergyOutlook station={station} fuelL={fuel.totalL} />
      </div>
    </div>
  )
}
