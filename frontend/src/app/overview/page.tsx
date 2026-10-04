'use client'

// Overview — the single dashboard for overall station operations. Everything on it is read
// live from the deployed HIMADRI backend: fleet summary, endurance, generation,
// risk model, alert stream, audit chain, command queue, sync state. The right
// rail ("Backend at work") exists to make the engine behind the UI visible.
import Link from 'next/link'
import { useMemo } from 'react'
import {
  Activity,
  AlertTriangle,
  Boxes,
  Fuel,
  Radio,
  Zap,
} from 'lucide-react'
import { useStationStore } from '@/store/useStationStore'
import { STATIONS, STATION_LABELS, ROUTES, type StationId } from '@/lib/constants'
import { useBackend, usePoll } from '@/lib/hooks/usePoll'
import { useFuelOutlook } from '@/lib/hooks/useFuelOutlook'
import { Kpi, Panel, PageHead, Pill, Meter, LiveDot, Skeleton, type Tone } from '@/components/ui/kit'
import { ago, fmtNum } from '@/lib/format'
import { useForecastModel } from '@/lib/ml/useForecastModel'
import { buildOutlook } from '@/lib/ml/outlook'
import { useLedgerStore, useStockItems, type MergedStockItem } from '@/store/useLedgerStore'
import { BandChart } from '@/components/forecast/ForecastCharts'

interface Summary {
  total_assets: number
  ok_assets: number
  degraded_assets: number
  fault_or_offline_assets: number
  avg_health_score: number
  open_alerts: number
  critical_alerts: number
}
interface Endurance {
  fuel_liters_available: number
  fuel_endurance_days: number
  food_units_available: number
  isolation_days_remaining: number
  fuel_margin_ok: boolean
}
interface EnergySummary {
  generation_kw: number | null
  load_kw: number | null
  efficiency: number | null
}
interface RiskRow {
  id: string
  subsystem: string
  score: number
  factors: { name: string; label: string; score: number; weight: number; evidence: string }[]
}
interface Alert {
  id: string
  asset_id: string | null
  severity: string
  category: string
  message: string
  state: string
  first_seen: string
  last_seen: string
  occurrences: number
}
interface Command {
  id: string
  asset_id: string
  action: string
  issued_by: string
  state: string
  requires_second_approval: boolean
  approved_by: string | null
  expires_at: string
}

const sevTone = (s: string): Tone => (s === 'critical' || s === 'emergency' ? 'crit' : s === 'warning' ? 'warn' : 'primary')
const riskTone = (n: number): Tone => (n >= 66 ? 'crit' : n >= 40 ? 'warn' : 'ok')

function StationCompare({ id, active }: { id: StationId; active: boolean }) {
  const s = useBackend<Summary>(`stations/${id}/summary`, 20000)
  const setStation = useStationStore((st) => st.setStation)
  const d = s.data
  const reporting = d ? Math.round((d.ok_assets / Math.max(1, d.total_assets)) * 100) : 0
  return (
    <button
      type="button"
      onClick={() => setStation(id)}
      className={`text-left panel p-4 transition-all hover:-translate-y-0.5 ${active ? 'ring-2 ring-cyan/60' : ''}`}
    >
      <div className="flex items-center justify-between">
        <p className="font-display text-xl text-white">{STATION_LABELS[id]}</p>
        {active && <Pill tone="primary">Viewing</Pill>}
      </div>
      {d ? (
        <>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[
              ['Assets', d.total_assets, 'ink'],
              ['Reporting', d.ok_assets, d.ok_assets === 0 ? 'crit' : 'ok'],
              ['Alerts', d.open_alerts, d.critical_alerts > 0 ? 'crit' : 'ok'],
            ].map(([l, v, t]) => (
              <div key={l as string}>
                <p className="eyebrow">{l}</p>
                <p className={`font-display text-2xl num ${t === 'crit' ? 'text-crimson' : t === 'ok' ? 'text-emerald' : 'text-white'}`}>{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Meter value={reporting} tone={reporting > 80 ? 'ok' : reporting > 40 ? 'warn' : 'crit'} label="Telemetry coverage" right={`${reporting}%`} />
          </div>
        </>
      ) : (
        <Skeleton className="h-16 mt-3" />
      )}
    </button>
  )
}

export default function MissionControlPage() {
  const station = useStationStore((s) => s.station)
  const summary = useBackend<Summary>(`stations/${station}/summary`, 15000)
  const endurance = useBackend<Endurance>(`logistics/endurance?station=${station}`, 30000)
  const fuel = useFuelOutlook(station)
  const energy = useBackend<EnergySummary>(`energy/summary?station=${station}`, 20000)
  const risk = useBackend<RiskRow[]>(`analytics/risk?station=${station}`, 30000)
  const alerts = useBackend<Alert[]>(`alerts?station=${station}&state=open`, 15000)
  const commands = useBackend<Command[]>(`commands?station=${station}`, 15000)
  const forecast = usePoll<{ points: { t: number; gust: number; wind: number }[] }>(`/api/environment/forecast?station=${station}`, 900000)
  const convoys = useBackend<{ id: string; route_ref: string | null; state: string; medical_officer: string | null; assignments: { vehicle_asset_id: string | null }[] }[]>(`convoys?station=${station}`, 30000)
  const vehicles = useBackend<{ id: string; subtype: string; status: string }[]>(`vehicles?station=${station}`, 30000)
  const inventory = useBackend<MergedStockItem[]>(`inventory?station=${station}`, 60000)
  const stock = useStockItems(station, inventory.data ?? [])
  const { model } = useForecastModel()
  const deliveries = useLedgerStore((st) => st.deliveries)
  const entries = useLedgerStore((st) => st.entries)
  const foodKg = stock.filter((i) => i.kind === 'food').reduce((a, i) => a + i.quantity, 0)
  const stockFuelL = fuel.totalL || stock.filter((i) => i.kind === 'fuel').reduce((a, i) => a + i.quantity, 0)
  const outlook = useMemo(
    () => (model ? buildOutlook(model, station, { fuelL: stockFuelL, foodKg }, { deliveries, entries }) : null),
    [model, station, stockFuelL, foodKg, deliveries, entries],
  )

  const s = summary.data
  const e = endurance.data
  const isolation = e?.isolation_days_remaining ?? 150
  const margin = fuel.daysUsed !== null ? fuel.daysUsed - isolation : null
  const sortedRisk = useMemo(() => [...(risk.data ?? [])].sort((a, b) => b.score - a.score), [risk.data])
  const topAlerts = useMemo(
    () =>
      [...(alerts.data ?? [])]
        .sort((a, b) => (a.severity === b.severity ? b.last_seen.localeCompare(a.last_seen) : a.severity === 'critical' ? -1 : 1))
        .slice(0, 6),
    [alerts.data],
  )
  const pending = (commands.data ?? []).filter((c) => !['applied', 'failed', 'expired'].includes(c.state))

  const next72 = (forecast.data?.points ?? []).filter((p) => p.t >= Date.now() && p.t <= Date.now() + 72 * 3600000)
  const peakGust = next72.length ? Math.max(...next72.map((p) => p.gust)) : null
  const wxBand = peakGust === null ? null : peakGust < 40 ? { l: 'Calm', t: 'ok' as Tone } : peakGust < 70 ? { l: 'Watch', t: 'warn' as Tone } : peakGust < 100 ? { l: 'Warning', t: 'crit' as Tone } : { l: 'Severe', t: 'crit' as Tone }
  const convoy = convoys.data?.[0]
  const ambulanceIds = new Set((vehicles.data ?? []).filter((v) => v.subtype === 'ambulance').map((v) => v.id))
  const convoyHasAmbulance = !!convoy && convoy.assignments.some((a) => a.vehicle_asset_id && ambulanceIds.has(a.vehicle_asset_id))
  const convoyGo = !!convoy && !!convoy.medical_officer && convoyHasAmbulance
  const coverage = s ? Math.round((s.ok_assets / Math.max(1, s.total_assets)) * 100) : null

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto px-6 py-7">
        <PageHead
          eyebrow={`Overview · ${STATION_LABELS[station]} Station`}
          title="Every system, every dependency, one picture."
          sub="Live state of the station — telemetry, alerts, fuel and food outlook, convoy readiness and the weakest systems — on one screen."
          right={
            <>
              <Pill tone="ok" dot>
                Deployed backend · live
              </Pill>
            </>
          }
        />

        {/* KPI row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
          <Kpi
            label="Telemetry coverage"
            value={coverage}
            unit="%"
            tone={coverage === null ? 'mute' : coverage > 80 ? 'ok' : coverage > 40 ? 'warn' : 'crit'}
            icon={<Activity size={15} />}
            hint={s ? `${s.ok_assets} of ${s.total_assets} assets reporting fresh data` : 'loading…'}
          />
          <Kpi
            label="Open alerts"
            value={s?.open_alerts ?? null}
            tone={!s ? 'mute' : s.critical_alerts > 0 ? 'crit' : s.open_alerts > 0 ? 'warn' : 'ok'}
            icon={<AlertTriangle size={15} />}
            hint={s ? `${s.critical_alerts} critical · escalate on timer` : 'loading…'}
          />
          <Kpi
            label="Fuel endurance"
            value={fuel.daysUsed !== null ? Math.round(fuel.daysUsed) : null}
            unit="days"
            tone={fuel.daysUsed === null ? "mute" : margin !== null && margin >= 0 ? "ok" : "crit"}
            icon={<Fuel size={15} />}
            spark={fuel.history.map((h) => h.litres)}
            hint={fuel.daysUsed !== null ? `${margin !== null && margin >= 0 ? "+" : ""}${fmtNum(margin)} d vs ${isolation} d isolation · ${fuel.source === "model" ? (fuel.synthetic ? "synthetic fuel-farm dataset" : "model estimate, tank history flat/stale") : `derived from ${fuel.tanks.length} tank sensors`}` : fuel.loading ? "reading tank sensors…" : "no burn-rate data yet"}
          />
          <Kpi
            label="Generation"
            value={energy.data?.generation_kw ?? null}
            unit="kW"
            digits={1}
            tone="primary"
            icon={<Zap size={15} />}
            hint={energy.data?.load_kw != null ? `load ${fmtNum(energy.data.load_kw, 1)} kW` : 'from latest asset values'}
          />
          <Kpi
            label="Food endurance"
            value={outlook && foodKg > 0 ? (outlook.food.daysMid ?? null) : null}
            unit="days"
            tone={outlook?.food.daysMid != null && outlook.food.daysMid < 90 ? 'warn' : 'ok'}
            icon={<Boxes size={15} />}
            hint={outlook && foodKg > 0 ? `model range ${outlook.food.daysEarliest ?? ">"}–${outlook.food.daysLatest ?? ">"} d · ${fmtNum(foodKg)} kg ${stock.some((i) => i.kind === "food" && i.synthetic) ? "in store (synthetic dataset)" : "counted"}` : "loading stock…"}
          />
          <Kpi
            label="Predicted fuel run-out"
            value={outlook ? (outlook.fuel.daysMid ?? null) : null}
            unit="days"
            tone={outlook?.fuel.daysMid != null && outlook.fuel.daysMid < 30 ? 'crit' : outlook?.fuel.daysMid != null && outlook.fuel.daysMid < 90 ? 'warn' : 'ok'}
            icon={<Fuel size={15} />}
            hint={outlook ? `model, synthetic-trained · ${outlook.fuel.runoutDate ?? 'beyond horizon'}` : 'loading model…'}
          />
        </div>

        {/* Cross-domain situation board — weather × logistics × fuel × power in one sentence */}
        <Panel className="mt-5" eyebrow="Cross-domain correlation" title="Situation board" right={<Pill tone="primary">weather × convoy × fuel × power</Pill>}>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { k: "Weather · next 72 h", v: peakGust !== null ? `${peakGust.toFixed(0)} km/h` : "—", s: wxBand ? wxBand.l : "loading", tone: (wxBand?.t ?? "mute") as Tone, href: ROUTES.ENVIRONMENT, d: "peak gust forecast at the station" },
              { k: "Resupply convoy", v: convoy ? (convoyGo ? "GO" : "NO-GO") : "none", s: convoy ? (convoyGo ? "crew & escort complete" : !convoy.medical_officer ? "no medical officer" : "ambulance not assigned") : "no convoy planned", tone: (convoy ? (convoyGo ? "ok" : "crit") : "mute") as Tone, href: ROUTES.LOGISTICS, d: "medical officer + ambulance escort" },
              { k: "Fuel margin", v: margin !== null ? `${margin >= 0 ? "+" : ""}${fmtNum(margin)} d` : "—", s: margin === null ? "reading tanks" : margin >= 30 ? "comfortable" : margin >= 0 ? "thin" : "shortfall", tone: (margin === null ? "mute" : margin >= 30 ? "ok" : margin >= 0 ? "warn" : "crit") as Tone, href: ROUTES.ENERGY, d: `endurance vs ${isolation} d isolation` },
              { k: "Power", v: energy.data?.generation_kw != null ? `${fmtNum(energy.data.generation_kw, 0)} kW` : "—", s: s && s.critical_alerts === 0 ? "all generators reporting" : "attention", tone: (s && s.critical_alerts === 0 ? "ok" : "warn") as Tone, href: ROUTES.ENERGY, d: "current generation" },
            ].map((c) => (
              <Link key={c.k} href={c.href} className="group rounded-xl border border-brand-border bg-brand-surface-2/60 p-4 hover:border-cyan transition">
                <p className="eyebrow">{c.k}</p>
                <p className={`font-display text-[34px] leading-none mt-1.5 num ${c.tone === "ok" ? "text-emerald" : c.tone === "warn" ? "text-amber" : c.tone === "crit" ? "text-crimson" : "text-white"}`}>{c.v}</p>
                <p className="font-mono text-[11px] text-white mt-2">{c.s}</p>
                <p className="font-mono text-[10px] text-white/65">{c.d}</p>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-[13.5px] text-white/75 leading-relaxed rounded-xl bg-brand-surface-2/70 border border-brand-border px-4 py-3">
            <b className="text-white">Briefing:</b>{" "}
            {convoy ? (convoyGo ? "The resupply convoy is crewed and escorted. " : `The resupply convoy is NO-GO — ${!convoy.medical_officer ? "no medical officer is assigned" : "the ambulance escort is not assigned"}. `) : ""}
            {wxBand ? (wxBand.t === "ok" ? "Weather is calm for the next 72 hours. " : `Gusts to ${peakGust?.toFixed(0)} km/h are forecast within 72 hours (${wxBand.l.toLowerCase()}) — hold outdoor work and convoy movement. `) : ""}
            {margin !== null ? (margin >= 0 ? `Fuel covers the isolation window with ${fmtNum(margin)} days to spare.` : `Fuel falls ${fmtNum(-margin)} days short of the isolation window.`) : ""}
          </p>
        </Panel>

        <Panel className="mt-5" eyebrow="Prediction layer" title="How long will the fuel last?"
          right={<Pill tone="warn">model trained on synthetic data</Pill>}>
          {outlook ? (
            <>
              <p className="text-[13.5px] text-white/75 mb-3">
                {outlook.fuel.daysMid === null ? 'Fuel lasts beyond the model horizon.' : `At the forecast burn the fuel runs out in about ${outlook.fuel.daysMid} days (${outlook.fuel.daysEarliest ?? '>'}–${outlook.fuel.daysLatest ?? '>'} d range).`}{' '}
                <Link href={ROUTES.ENERGY} className="text-cyan hover:underline">Details on Energy →</Link>
              </p>
              <BandChart
                data={outlook.fuel.trajectory.filter((_, i) => i <= 120 && i % 2 === 0).map((p) => ({ x: p.date, mid: p.mid, lo: p.lo, hi: p.hi }))}
                unit="L" height={230} yDomain={[0, 'auto']} yFormat={(v) => `${fmtNum(v / 1000)}k`} midName="Projected fuel level" bandName="Heavy ↔ light burn"
              />
            </>
          ) : <Skeleton className="h-56" />}
        </Panel>

        <div className="grid xl:grid-cols-[1.35fr_1fr] gap-5 mt-5">
          {/* LEFT COLUMN */}
          <div className="space-y-5">
            <Panel
              eyebrow="Predictive risk model"
              title="Where the station is weakest right now"
              right={<Link href={ROUTES.RISK} className="font-mono text-[10.5px] uppercase tracking-wider text-cyan hover:underline">Heatmap →</Link>}
            >
              {risk.loading && !risk.data ? (
                <Skeleton className="h-40" />
              ) : sortedRisk.length === 0 ? (
                <p className="text-sm text-white/70">No risk cells computed for this station yet.</p>
              ) : (
                <ul className="space-y-3.5">
                  {sortedRisk.slice(0, 6).map((r) => (
                    <li key={r.id}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-mono text-[12px] uppercase tracking-wider text-white">{r.subsystem}</span>
                        <span className="font-display text-xl num" style={{ color: riskTone(r.score) === 'crit' ? '#C23B3B' : riskTone(r.score) === 'warn' ? '#D4820A' : '#0F8A6A' }}>
                          {r.score.toFixed(0)}
                        </span>
                      </div>
                      <Meter value={r.score} tone={riskTone(r.score)} height={6} />
                      <p className="font-mono text-[10.5px] text-white/65 mt-1 truncate">
                        driver: {[...r.factors].sort((a, b) => b.score * b.weight - a.score * a.weight)[0]?.evidence}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              eyebrow="Alert stream"
              title="What needs a human"
              right={<Link href={ROUTES.ALERTS} className="font-mono text-[10.5px] uppercase tracking-wider text-cyan hover:underline">All alerts →</Link>}
              pad={false}
            >
              {alerts.loading && !alerts.data ? (
                <div className="p-5"><Skeleton className="h-32" /></div>
              ) : topAlerts.length === 0 ? (
                <p className="p-5 text-sm text-white/70 inline-flex items-center gap-2"><LiveDot tone="ok" /> No open alerts at {STATION_LABELS[station]}.</p>
              ) : (
                <ul className="divide-y divide-brand-border/70">
                  {topAlerts.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                      <Pill tone={sevTone(a.severity)}>{a.severity}</Pill>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-white truncate">{a.message}</p>
                        <p className="font-mono text-[10.5px] text-white/65 truncate">
                          {a.category} · {a.asset_id ?? 'station-wide'} · last {ago(a.last_seen)}
                        </p>
                      </div>
                      {a.asset_id && (
                        <Link href={`${ROUTES.TWIN}?asset=${encodeURIComponent(a.asset_id)}`} className="font-mono text-[10.5px] uppercase tracking-wider text-cyan hover:underline shrink-0">
                          Locate →
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <div className="grid sm:grid-cols-2 gap-4">
              {STATIONS.map((id) => (
                <StationCompare key={id} id={id} active={id === station} />
              ))}
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-5">
            <Panel eyebrow="Remote actuation" title="Command queue" right={<Link href={ROUTES.REMOTE_CONTROL} className="font-mono text-[10.5px] uppercase tracking-wider text-cyan hover:underline">Open →</Link>}>
              {commands.loading && !commands.data ? (
                <Skeleton className="h-20" />
              ) : (commands.data ?? []).length === 0 ? (
                <p className="text-sm text-white/70">No commands issued for this station.</p>
              ) : (
                <ul className="space-y-3">
                  {(commands.data ?? []).slice(0, 4).map((c) => (
                    <li key={c.id} className="flex items-start gap-3">
                      <Pill tone={c.state === 'applied' ? 'ok' : c.state === 'failed' || c.state === 'expired' ? 'crit' : 'warn'}>{c.state}</Pill>
                      <div className="min-w-0">
                        <p className="text-[13px] text-white truncate">
                          {c.action.toUpperCase()} · {c.asset_id}
                        </p>
                        <p className="font-mono text-[10.5px] text-white/65">
                          by {c.issued_by}
                          {c.requires_second_approval ? (c.approved_by ? ` · approved by ${c.approved_by}` : ' · awaiting 2nd approver') : ' · single-approver class'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

          </div>
        </div>
      </div>
    </div>
  )
}
