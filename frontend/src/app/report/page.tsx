'use client'

// Station report — a one-page, print-ready briefing assembled from live data:
// situation, fuel, alerts, convoy gate, top risks, link, ledger. "Print / Save
// as PDF" uses the browser's print dialog with a print stylesheet, so the
// artefact works with no server-side PDF dependency and no link to HQ.
import { useMemo } from 'react'
import { Printer } from 'lucide-react'
import { useStationStore } from '@/store/useStationStore'
import { STATION_LABELS } from '@/lib/constants'
import { useBackend, usePoll } from '@/lib/hooks/usePoll'
import { useFuelEndurance } from '@/lib/hooks/useFuel'
import { PageHead, Pill, Skeleton, type Tone } from '@/components/ui/kit'
import { ago, fmtBytes, fmtNum } from '@/lib/format'

interface Summary { total_assets: number; ok_assets: number; degraded_assets: number; fault_or_offline_assets: number; open_alerts: number; critical_alerts: number }
interface Alert { severity: string; message: string; asset_id: string; first_seen: string }
interface Risk { subsystem: string; score: number; factors: { label: string; score: number; weight: number; evidence: string }[] }
interface Convoy { route_ref: string | null; state: string; medical_officer: string | null; assignments: { vehicle_asset_id: string | null }[] }
interface Vehicle { id: string; subtype: string; status: string }
interface Sync { link_state: string; queue_depth: number; last_sync: string | null; bytes_budget: number }
interface Chain { valid: boolean; checked: number }
interface Wx { temperatureC: number; windSpeedKmh: number; windGustKmh: number; weatherLabel: string }
interface Fc { points: { t: number; gust: number }[] }

function Row({ k, v, tone }: { k: string; v: string; tone?: Tone }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2 border-b border-brand-border/70">
      <span className="text-[13px] text-white/75">{k}</span>
      <span className={`font-mono text-[13px] num font-semibold ${tone === 'ok' ? 'text-emerald' : tone === 'warn' ? 'text-amber' : tone === 'crit' ? 'text-crimson' : 'text-white'}`}>{v}</span>
    </div>
  )
}

export default function ReportPage() {
  const station = useStationStore((s) => s.station)
  const sum = useBackend<Summary>(`stations/${station}/summary`, 30000)
  const alerts = useBackend<Alert[]>(`alerts?station=${station}&state=open`, 30000)
  const risk = useBackend<Risk[]>(`analytics/risk?station=${station}`, 60000)
  const convoys = useBackend<Convoy[]>(`convoys?station=${station}`, 60000)
  const vehicles = useBackend<Vehicle[]>(`vehicles?station=${station}`, 60000)
  const sync = useBackend<Sync>('sync/status', 30000)
  const chain = useBackend<Chain>('audit/verify', 60000)
  const endurance = useBackend<{ isolation_days_remaining: number }>(`logistics/endurance?station=${station}`, 60000)
  const wx = usePoll<Wx>(`/api/environment/weather?station=${station}`, 600000)
  const fc = usePoll<Fc>(`/api/environment/forecast?station=${station}`, 900000)
  const fuel = useFuelEndurance(station)

  const iso = endurance.data?.isolation_days_remaining ?? 150
  const margin = fuel.days !== null ? fuel.days - iso : null
  const peak = useMemo(() => {
    const now = Date.now()
    const p = (fc.data?.points ?? []).filter((x) => x.t >= now && x.t <= now + 72 * 3600000)
    return p.length ? Math.max(...p.map((x) => x.gust)) : null
  }, [fc.data])
  const convoy = convoys.data?.[0]
  const amb = new Set((vehicles.data ?? []).filter((v) => v.subtype === 'ambulance').map((v) => v.id))
  const hasAmb = !!convoy && convoy.assignments.some((a) => a.vehicle_asset_id && amb.has(a.vehicle_asset_id))
  const go = !!convoy && !!convoy.medical_officer && hasAmb
  const topRisk = [...(risk.data ?? [])].sort((a, b) => b.score - a.score).slice(0, 3)
  const loaded = !!sum.data && !!chain.data

  return (
    <div className="h-full overflow-y-auto print:overflow-visible print:h-auto">
      <div className="max-w-[900px] mx-auto px-6 py-7 print:px-0 print:py-0">
        <div className="print:hidden">
          <PageHead
            eyebrow={`Station report · ${STATION_LABELS[station]}`}
            title="A one-page briefing, from live data."
            sub="Assembled in your browser from the station node — no external service. Print it, or save it as a PDF to carry into a meeting or send over a thin link."
            right={
              <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-white text-brand-surface px-5 py-3 font-mono text-[11px] uppercase tracking-wider hover:opacity-90">
                <Printer size={14} /> Print / Save as PDF
              </button>
            }
          />
        </div>

        <article className="panel p-10 print:shadow-none print:border-0 print:p-0">
          <header className="flex items-start justify-between border-b-2 border-white pb-5">
            <div>
              <p className="eyebrow">Himadri · Station command</p>
              <h2 className="font-display text-[34px] leading-tight text-white mt-1">{STATION_LABELS[station]} Station — situation report</h2>
              <p className="font-mono text-[11px] text-white/70 mt-1.5">Generated {new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · data: deployed HIMADRI backend, provenance on each line</p>
            </div>
            <Pill tone={chain.data?.valid ? 'ok' : 'crit'}>{chain.data?.valid ? 'ledger verified' : 'ledger check pending'}</Pill>
          </header>

          {!loaded ? (
            <div className="mt-6"><Skeleton className="h-64" /></div>
          ) : (
            <div className="grid md:grid-cols-2 gap-x-12 gap-y-8 mt-6">
              <section>
                <h3 className="eyebrow mb-2">1 · Station health</h3>
                <Row k="Assets reporting" v={`${sum.data!.ok_assets} / ${sum.data!.total_assets}`} tone={sum.data!.ok_assets === sum.data!.total_assets ? 'ok' : 'warn'} />
                <Row k="Degraded / offline" v={`${sum.data!.degraded_assets} / ${sum.data!.fault_or_offline_assets}`} tone={sum.data!.fault_or_offline_assets ? 'crit' : 'ok'} />
                <Row k="Open alerts (critical)" v={`${sum.data!.open_alerts} (${sum.data!.critical_alerts})`} tone={sum.data!.critical_alerts ? 'crit' : sum.data!.open_alerts ? 'warn' : 'ok'} />
              </section>

              <section>
                <h3 className="eyebrow mb-2">2 · Fuel & endurance <span className="normal-case tracking-normal text-white/58">(derived from tank sensors)</span></h3>
                <Row k="Fuel on hand" v={`${fmtNum(fuel.totalL)} L`} />
                <Row k="Fitted burn rate" v={fuel.burnLph ? `${fmtNum(fuel.burnLph)} L/h` : '—'} />
                <Row k={`Endurance vs ${iso} d isolation`} v={fuel.days !== null ? `${fmtNum(fuel.days)} d (${margin! >= 0 ? '+' : ''}${fmtNum(margin)} d)` : '—'} tone={margin === null ? undefined : margin >= 30 ? 'ok' : margin >= 0 ? 'warn' : 'crit'} />
              </section>

              <section>
                <h3 className="eyebrow mb-2">3 · Weather <span className="normal-case tracking-normal text-white/58">(live · Open-Meteo)</span></h3>
                <Row k="Now" v={wx.data ? `${wx.data.temperatureC.toFixed(0)}°C · ${wx.data.weatherLabel}` : '—'} />
                <Row k="Wind / gust" v={wx.data ? `${wx.data.windSpeedKmh.toFixed(0)} / ${wx.data.windGustKmh.toFixed(0)} km/h` : '—'} />
                <Row k="Peak gust, next 72 h" v={peak !== null ? `${peak.toFixed(0)} km/h` : '—'} tone={peak === null ? undefined : peak < 40 ? 'ok' : peak < 70 ? 'warn' : 'crit'} />
              </section>

              <section>
                <h3 className="eyebrow mb-2">4 · Resupply convoy</h3>
                <Row k="Route" v={convoy?.route_ref ?? 'none planned'} />
                <Row k="Medical officer" v={convoy?.medical_officer ?? 'not assigned'} tone={convoy?.medical_officer ? 'ok' : 'crit'} />
                <Row k="Ambulance escort" v={hasAmb ? 'assigned' : 'not assigned'} tone={hasAmb ? 'ok' : 'crit'} />
                <Row k="Gate" v={convoy ? (go ? 'GO' : 'NO-GO') : '—'} tone={convoy ? (go ? 'ok' : 'crit') : undefined} />
              </section>

              <section className="md:col-span-2">
                <h3 className="eyebrow mb-2">5 · Highest risks <span className="normal-case tracking-normal text-white/58">(weighted factors, evidence attached)</span></h3>
                <div className="grid md:grid-cols-3 gap-4">
                  {topRisk.map((r) => {
                    const f = [...r.factors].sort((a, b) => b.score * b.weight - a.score * a.weight)[0]
                    return (
                      <div key={r.subsystem} className="rounded-xl border border-brand-border p-4">
                        <p className="font-mono text-[11px] uppercase tracking-wider text-white">{r.subsystem}</p>
                        <p className="font-display text-[32px] text-white num leading-none mt-1">{r.score.toFixed(0)}</p>
                        <p className="font-mono text-[10.5px] text-white/70 mt-2 leading-snug">{f?.evidence}</p>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="md:col-span-2">
                <h3 className="eyebrow mb-2">6 · Open alerts</h3>
                {(alerts.data ?? []).length === 0 ? (
                  <p className="text-[13px] text-white/75">None.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {(alerts.data ?? []).slice(0, 6).map((a, i) => (
                      <li key={i} className="text-[13px] text-white/80"><b className="uppercase text-[11px] font-mono">{a.severity}</b> — {a.message} <span className="text-white/62 font-mono text-[11px]">({a.asset_id}, first {ago(a.first_seen)})</span></li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="md:col-span-2">
                <h3 className="eyebrow mb-2">7 · Link & record</h3>
                <div className="grid md:grid-cols-2 gap-x-12">
                  <Row k="Uplink state" v={sync.data?.link_state ?? '—'} />
                  <Row k="Queued for HQ" v={sync.data ? `${sync.data.queue_depth} items · batch ≤ ${fmtBytes(sync.data.bytes_budget)}` : '—'} />
                  <Row k="Audit ledger" v={chain.data ? `${fmtNum(chain.data.checked)} events · ${chain.data.valid ? 'intact' : 'BROKEN'}` : '—'} tone={chain.data?.valid ? 'ok' : 'crit'} />
                  <Row k="Last HQ acknowledgement" v={sync.data?.last_sync ? ago(sync.data.last_sync) : 'awaiting HQ'} />
                </div>
              </section>
            </div>
          )}

          <footer className="mt-8 pt-4 border-t border-brand-border font-mono text-[10px] text-white/62 leading-relaxed">
            Figures marked derived are computed from live sensors; simulated feeds are labelled as such in the app. Weather thresholds are operational conventions of this platform, not an official warning. Generated by Himadri — PS 26060, ISRO / NCPOR.
          </footer>
        </article>
      </div>
    </div>
  )
}
