'use client'

// Logistics — fleet readiness, the resupply convoy and its go / no-go gate,
// waste streams and stock. The convoy gate mirrors the backend's rule: a convoy
// does not leave without a medical officer and an ambulance escort, and the
// backend's own refusal message is relayed verbatim if the planner tries anyway.
import { useMemo, useState } from 'react'
import { Ambulance, Boxes, Check, Fuel, Route, Trash2, Truck, X } from 'lucide-react'
import { useStationStore } from '@/store/useStationStore'
import { STATION_LABELS } from '@/lib/constants'
import { useBackend } from '@/lib/hooks/usePoll'
import { useFuelEndurance } from '@/lib/hooks/useFuel'
import { Kpi, Panel, PageHead, Pill, Meter, Skeleton, type Tone } from '@/components/ui/kit'
import { fmtNum } from '@/lib/format'

interface Vehicle {
  id: string
  name: string
  subtype: string
  status: string
  spec: Record<string, unknown> | null
}
interface Assignment {
  member_name: string
  vehicle_asset_id: string | null
  equipment_charge: string | null
}
interface Convoy {
  id: string
  station_id: string
  season: string | null
  route_ref: string | null
  distance_km: number | null
  state: string
  medical_officer: string | null
  fuel_planned_l: number | null
  fuel_used_l: number | null
  planned_start: string | null
  eta: string | null
  assignments: Assignment[]
}
interface Waste {
  stream: string
  mass_kg: number | null
  volume_l: number | null
  disposition: string | null
}
interface InventoryItem {
  id: string
  name: string
  quantity: number
  unit: string
  reorder_threshold: number | null
}
interface Endurance {
  isolation_days_remaining: number
}

function refusal(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : ''
  try {
    const j = JSON.parse(text)
    return (j?.error?.message ?? j?.detail ?? text).toString().slice(0, 240)
  } catch {
    return text.slice(0, 240) || 'Backend refused departure.'
  }
}

const vTone = (s: string): Tone => (s === 'ok' ? 'ok' : s === 'degraded' ? 'warn' : s === 'simulating' ? 'primary' : 'mute')

function Check_({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${ok ? 'bg-emerald/15 text-emerald' : 'bg-crimson/15 text-crimson'}`}>
        {ok ? <Check size={12} /> : <X size={12} />}
      </span>
      <div>
        <p className="text-[13.5px] text-white">{label}</p>
        {detail && <p className="font-mono text-[10.5px] text-white/45">{detail}</p>}
      </div>
    </li>
  )
}

export default function LogisticsPage() {
  const station = useStationStore((s) => s.station)
  const vehicles = useBackend<Vehicle[]>(`vehicles?station=${station}`, 20000)
  const convoys = useBackend<Convoy[]>(`convoys?station=${station}`, 20000)
  const waste = useBackend<Waste[]>(`waste?station=${station}`, 60000)
  const inventory = useBackend<InventoryItem[]>(`inventory?station=${station}`, 60000)
  const endurance = useBackend<Endurance>(`logistics/endurance?station=${station}`, 60000)
  const fuel = useFuelEndurance(station)
  const [departMsg, setDepartMsg] = useState<Record<string, { ok: boolean; text: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const vlist = vehicles.data ?? []
  const byId = useMemo(() => new Map(vlist.map((v) => [v.id, v])), [vlist])
  const readyCount = vlist.filter((v) => v.status === 'ok' || v.status === 'simulating').length
  const ambulances = vlist.filter((v) => v.subtype === 'ambulance')
  const ambulanceReady = ambulances.some((v) => v.status === 'ok' || v.status === 'simulating')

  const wasteByStream = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of waste.data ?? []) m.set(w.stream, (m.get(w.stream) ?? 0) + (w.mass_kg ?? 0))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [waste.data])
  const wasteTotal = wasteByStream.reduce((a, [, n]) => a + n, 0)

  async function depart(id: string) {
    setBusy(id)
    try {
      const r = await fetch(`/api/convoys/${encodeURIComponent(id)}/depart`, { method: 'PATCH' })
      const j = await r.json().catch(() => ({}))
      setDepartMsg((m) => ({ ...m, [id]: r.ok ? { ok: true, text: 'Convoy departed.' } : { ok: false, text: refusal(j.error) } }))
      convoys.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto px-6 py-7">
        <PageHead
          eyebrow={`Logistics · ${STATION_LABELS[station]}`}
          title="Nothing leaves without a doctor and an ambulance."
          sub="Fleet readiness, the resupply convoy and its go / no-go gate, waste streams and stock — with the safety rule enforced by the backend, not just the interface."
          right={endurance.data ? <Pill tone="primary">{endurance.data.isolation_days_remaining} days to next resupply window</Pill> : undefined}
        />

        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 stagger">
          <Kpi label="Vehicles ready" value={vehicles.data ? readyCount : null} tone={vlist.length && readyCount === vlist.length ? 'ok' : 'warn'} icon={<Truck size={15} />} hint={vehicles.data ? `of ${vlist.length} in the fleet` : ''} />
          <Kpi label="Ambulance" value={ambulances.length ? (ambulanceReady ? 1 : 0) : null} unit={ambulanceReady ? 'ready' : 'down'} tone={ambulanceReady ? 'ok' : 'crit'} icon={<Ambulance size={15} />} hint="required escort for any convoy" />
          <Kpi label="Convoys planned" value={convoys.data ? convoys.data.filter((c) => c.state !== 'complete').length : null} tone="primary" icon={<Route size={15} />} hint="this season" />
          <Kpi label="Fuel on hand" value={fuel.totalL ? fuel.totalL / 1000 : null} unit="kL" digits={0} tone="ink" icon={<Fuel size={15} />} hint="live tank sensors · derived" />
          <Kpi label="Waste stored" value={waste.data ? wasteTotal : null} unit="kg" digits={0} tone="ink" icon={<Trash2 size={15} />} hint={`${wasteByStream.length} streams tracked`} />
        </div>

        {/* convoys */}
        <div className="mt-6 space-y-5">
          {convoys.loading && !convoys.data && <Skeleton className="h-48" />}
          {(convoys.data ?? []).map((c) => {
            const asg = c.assignments
            const hasMedical = !!c.medical_officer
            const hasAmbulance = asg.some((a) => a.vehicle_asset_id && byId.get(a.vehicle_asset_id)?.subtype === 'ambulance')
            const vehiclesOk = asg.filter((a) => a.vehicle_asset_id).every((a) => ['ok', 'simulating'].includes(byId.get(a.vehicle_asset_id as string)?.status ?? ''))
            const fuelOk = c.fuel_planned_l === null || fuel.totalL === 0 || c.fuel_planned_l <= fuel.totalL * 0.1
            const go = hasMedical && hasAmbulance && vehiclesOk && fuelOk
            const msg = departMsg[c.id]
            return (
              <Panel
                key={c.id}
                eyebrow={`Convoy · season ${c.season ?? '—'}`}
                title={c.route_ref ?? c.id}
                right={<Pill tone={c.state === 'planned' ? 'primary' : c.state === 'underway' ? 'warn' : 'ok'}>{c.state}</Pill>}
              >
                <div className="grid lg:grid-cols-[1fr_1.3fr] gap-8">
                  <div>
                    <div className={`rounded-2xl p-5 border-2 ${go ? 'border-emerald/50 bg-emerald/5' : 'border-crimson/40 bg-crimson/5'}`}>
                      <p className="eyebrow">Go / no-go</p>
                      <p className={`font-display text-[40px] leading-none mt-1 ${go ? 'text-emerald' : 'text-crimson'}`}>{go ? 'GO' : 'NO-GO'}</p>
                      <ul className="mt-4 space-y-3">
                        <Check_ ok={hasMedical} label="Medical officer assigned" detail={c.medical_officer ?? 'none assigned'} />
                        <Check_ ok={hasAmbulance} label="Ambulance escort in the convoy" detail={hasAmbulance ? 'ambulance vehicle assigned' : ambulances.length ? 'assign the ambulance to a crew member' : 'no ambulance in fleet'} />
                        <Check_ ok={vehiclesOk} label="Every assigned vehicle reporting OK" detail={`${asg.filter((a) => a.vehicle_asset_id).length} vehicles checked live`} />
                        <Check_ ok={fuelOk} label="Planned fuel within safe draw" detail={c.fuel_planned_l ? `${fmtNum(c.fuel_planned_l)} L planned of ${fmtNum(fuel.totalL)} L on hand` : 'no fuel plan recorded'} />
                      </ul>
                      <button
                        disabled={busy === c.id || c.state !== 'planned'}
                        onClick={() => depart(c.id)}
                        className={`mt-5 w-full rounded-xl px-4 py-3 font-mono text-[11.5px] uppercase tracking-wider transition ${go ? 'bg-white text-brand-surface hover:opacity-90' : 'bg-brand-surface border border-crimson/40 text-crimson hover:bg-crimson/5'} disabled:opacity-40`}
                      >
                        {busy === c.id ? 'Asking the backend…' : go ? 'Depart convoy' : 'Try to depart anyway (backend will refuse)'}
                      </button>
                      {msg && <p className={`font-mono text-[11px] mt-3 ${msg.ok ? 'text-emerald' : 'text-crimson'}`}>{msg.ok ? '✓ ' : '✕ Backend: '}{msg.text}</p>}
                    </div>
                  </div>

                  <div>
                    <div className="grid grid-cols-3 gap-3 mb-5">
                      {[
                        ['Distance', c.distance_km ? `${fmtNum(c.distance_km)} km` : '—'],
                        ['Fuel planned', c.fuel_planned_l ? `${fmtNum(c.fuel_planned_l)} L` : '—'],
                        ['Crew & vehicles', `${asg.length} / ${asg.filter((a) => a.vehicle_asset_id).length}`],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-xl bg-brand-surface-2/70 border border-brand-border px-3.5 py-3">
                          <p className="eyebrow">{k}</p>
                          <p className="font-display text-[20px] text-white num mt-0.5">{v}</p>
                        </div>
                      ))}
                    </div>
                    <p className="eyebrow mb-2">Assignments</p>
                    <ul className="divide-y divide-brand-border/70 rounded-xl border border-brand-border overflow-hidden">
                      {asg.map((a, i) => {
                        const v = a.vehicle_asset_id ? byId.get(a.vehicle_asset_id) : null
                        return (
                          <li key={i} className="flex items-center gap-3 px-4 py-2.5 bg-brand-surface">
                            <span className="w-7 h-7 rounded-full bg-cyan/10 text-cyan flex items-center justify-center font-mono text-[10px]">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] text-white truncate">{a.member_name}</p>
                              <p className="font-mono text-[10.5px] text-white/45 truncate">{a.equipment_charge ?? 'no equipment charge'}</p>
                            </div>
                            {v ? <Pill tone={vTone(v.status)}>{v.name}</Pill> : <Pill tone="mute">on foot</Pill>}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </div>
              </Panel>
            )
          })}
          {convoys.data && convoys.data.length === 0 && (
            <Panel>
              <p className="text-sm text-white/55">No convoy is planned for this station this season.</p>
            </Panel>
          )}
        </div>

        <div className="grid xl:grid-cols-[1.4fr_1fr] gap-5 mt-5">
          <Panel eyebrow="Fleet" title="Vehicle readiness" right={<Pill tone={readyCount === vlist.length && vlist.length ? 'ok' : 'warn'}>{readyCount}/{vlist.length} ready</Pill>}>
            {vehicles.loading && !vehicles.data ? (
              <Skeleton className="h-40" />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {vlist.map((v) => (
                  <div key={v.id} className="rounded-xl border border-brand-border bg-brand-surface-2/50 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] text-white truncate">{v.name}</p>
                      <Pill tone={vTone(v.status)}>{v.status}</Pill>
                    </div>
                    <p className="font-mono text-[10.5px] text-white/45 mt-1">{v.subtype}</p>
                    {v.spec?.cold_start_required ? <p className="font-mono text-[10px] text-amber mt-1.5">❄ cold-start procedure required</p> : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="space-y-5">
            <Panel eyebrow="Waste" title="Streams held at station" right={<Trash2 size={16} className="text-white/40" />}>
              {wasteByStream.length === 0 ? (
                <p className="text-sm text-white/50">No waste records.</p>
              ) : (
                <ul className="space-y-3">
                  {wasteByStream.map(([s, n]) => (
                    <li key={s}>
                      <Meter value={n} max={Math.max(...wasteByStream.map(([, x]) => x))} tone="primary" height={6} label={<span className="capitalize">{s}</span>} right={`${fmtNum(n, 1)} kg`} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel eyebrow="Stock" title="Inventory" right={<Boxes size={16} className="text-white/40" />}>
              {(inventory.data ?? []).length === 0 ? (
                <p className="text-[13px] text-white/55 leading-relaxed">No stock records yet. Fuel is tracked live from tank sensors instead (see Energy); food, spares and medical stock appear here once counted.</p>
              ) : (
                <ul className="divide-y divide-brand-border/70">
                  {(inventory.data ?? []).slice(0, 8).map((i) => (
                    <li key={i.id} className="flex items-center justify-between py-2">
                      <span className="text-[13px] text-white">{i.name}</span>
                      <span className={`font-mono text-[12px] num ${i.reorder_threshold !== null && i.quantity <= i.reorder_threshold ? 'text-crimson' : 'text-white/70'}`}>{fmtNum(i.quantity)} {i.unit}</span>
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
