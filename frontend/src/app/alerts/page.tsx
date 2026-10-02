'use client'

// Alerts — the operator's worklist. Severity-first, live (15 s poll), every
// alert one click from the asset on the twin, with its blast radius pulled
// from the dependency graph so the operator sees what else is at stake before
// acknowledging.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, ChevronDown, Crosshair, Stethoscope } from 'lucide-react'
import { alertsService } from '@/services/alerts.service'
import { useStationStore } from '@/store/useStationStore'
import { ASSET_CATEGORIES, ROUTES, STATION_LABELS } from '@/lib/constants'
import type { BackendAlertDetail } from '@/lib/backendAdapters'
import { Kpi, Panel, PageHead, Pill, Skeleton, LiveDot, type Tone } from '@/components/ui/kit'
import { ago } from '@/lib/format'

type Sev = BackendAlertDetail['severity']
const SEV_ORDER: Record<Sev, number> = { emergency: 0, critical: 1, warning: 2, info: 3 }
const SEV_TONE: Record<Sev, Tone> = { emergency: 'crit', critical: 'crit', warning: 'warn', info: 'primary' }
const SEV_BAR: Record<Sev, string> = { emergency: '#C23B3B', critical: '#C23B3B', warning: '#D4820A', info: '#1D1C93' }
const STATES: BackendAlertDetail['state'][] = ['open', 'acked', 'resolved']

interface Blast {
  affected_count: number
  affected_assets: { asset_id: string; name: string; category: string; status: string; depth: number }[]
}

function BlastRadius({ assetId }: { assetId: string }) {
  const [data, setData] = useState<Blast | null | 'err'>(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/backend/assets/${encodeURIComponent(assetId)}/blast-radius`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => alive && setData(j))
      .catch(() => alive && setData('err'))
    return () => {
      alive = false
    }
  }, [assetId])
  if (data === null) return <Skeleton className="h-10" />
  if (data === 'err') return <p className="font-mono text-[11px] text-white/45">Blast radius unavailable for this asset.</p>
  if (data.affected_count === 0) return <p className="font-mono text-[11px] text-white/55">Nothing else depends on this asset — failure is contained.</p>
  return (
    <div>
      <p className="font-mono text-[11px] text-white/70 mb-2">
        <b className="text-crimson">{data.affected_count}</b> downstream asset{data.affected_count > 1 ? 's' : ''} would be affected:
      </p>
      <div className="flex flex-wrap gap-1.5">
        {data.affected_assets.slice(0, 10).map((a) => (
          <span key={a.asset_id} className="rounded-full border border-brand-border bg-brand-surface px-2.5 py-1 font-mono text-[10.5px] text-white/75">
            {a.name} <span className="text-white/35">· {a.category}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function AlertsPage() {
  const station = useStationStore((s) => s.station)
  const [alerts, setAlerts] = useState<BackendAlertDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [severity, setSeverity] = useState('')
  const [category, setCategory] = useState('')
  const [state, setState] = useState<string>('open')
  const [counts, setCounts] = useState<{ open: number; critical: number; acked: number; resolved: number }>({ open: 0, critical: 0, acked: 0, resolved: 0 })
  const [openId, setOpenId] = useState<string | null>(null)
  const [ackingId, setAckingId] = useState<string | null>(null)
  const [ackNote, setAckNote] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      const [list, all] = await Promise.all([
        alertsService.list({ station, severity: severity || undefined, category: category || undefined, state: state || undefined }),
        alertsService.list({ station }),
      ])
      setAlerts([...list].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.last_seen.localeCompare(a.last_seen)))
      setCounts({
        open: all.filter((a) => a.state === 'open').length,
        critical: all.filter((a) => a.state === 'open' && (a.severity === 'critical' || a.severity === 'emergency')).length,
        acked: all.filter((a) => a.state === 'acked').length,
        resolved: all.filter((a) => a.state === 'resolved').length,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }, [station, severity, category, state])

  useEffect(() => {
    setLoading(true)
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    }
  }

  const grouped = useMemo(() => alerts, [alerts])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-6 py-7">
        <PageHead
          eyebrow={`Alerts · ${STATION_LABELS[station]}`}
          title={counts.open === 0 ? 'All quiet. Keep watching.' : counts.open === 1 ? '1 thing needs a human.' : `${counts.open} things need a human.`}
          sub="Severity-first. Every alert is one click from its asset on the twin and shows what else depends on it before you acknowledge."
          right={
            <Pill tone={counts.critical > 0 ? 'crit' : 'ok'} dot>
              {counts.critical > 0 ? `${counts.critical} critical` : 'no critical alerts'}
            </Pill>
          }
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
          <Kpi label="Open" value={counts.open} tone={counts.open ? 'warn' : 'ok'} icon={<AlertTriangle size={15} />} hint="awaiting acknowledgement" />
          <Kpi label="Critical open" value={counts.critical} tone={counts.critical ? 'crit' : 'ok'} hint="escalate on a timer" />
          <Kpi label="Acknowledged" value={counts.acked} tone="primary" hint="owned by an operator" />
          <Kpi label="Resolved" value={counts.resolved} tone="ink" hint="closed — incl. auto-resolved on data return" />
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-6">
          {['open', 'acked', 'resolved', ''].map((s) => (
            <button
              key={s || 'all'}
              onClick={() => setState(s)}
              className={`rounded-full border px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-wider transition ${state === s ? 'bg-white text-brand-surface border-white' : 'border-brand-border bg-brand-surface text-white/60 hover:text-white'}`}
            >
              {s || 'all states'}
            </button>
          ))}
          <span className="w-px h-5 bg-brand-border mx-1" />
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded-full border border-brand-border bg-brand-surface px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-white/70">
            <option value="">all severities</option>
            {(['emergency', 'critical', 'warning', 'info'] as Sev[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-full border border-brand-border bg-brand-surface px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-white/70">
            <option value="">all categories</option>
            {ASSET_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {error && <p className="mt-4 font-mono text-[12px] text-crimson">{error}</p>}

        <div className="mt-5 space-y-3">
          {loading && alerts.length === 0 && (
            <>
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </>
          )}
          {!loading && grouped.length === 0 && (
            <Panel>
              <div className="py-8 flex flex-col items-center text-center gap-2">
                <LiveDot tone="ok" size={10} />
                <p className="font-display text-xl text-white">Nothing matches these filters.</p>
                <p className="font-mono text-[11.5px] text-white/50 max-w-md">
                  Alerts auto-resolve when the data that raised them returns to normal, and stale-data alerts clear the moment a device reports again.
                </p>
              </div>
            </Panel>
          )}
          {grouped.map((a) => {
            const open = openId === a.id
            return (
              <div key={a.id} className="panel overflow-hidden">
                <div className="flex">
                  <span className="w-1.5 shrink-0" style={{ background: SEV_BAR[a.severity] }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-4 p-4">
                      <button onClick={() => setOpenId(open ? null : a.id)} className="flex-1 min-w-0 text-left">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <Pill tone={SEV_TONE[a.severity]} dot={a.state === 'open'}>{a.severity}</Pill>
                          <Pill tone={a.state === 'open' ? 'warn' : a.state === 'acked' ? 'primary' : 'ok'}>{a.state}</Pill>
                          <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">{a.category}</span>
                          {a.occurrences > 1 && <span className="font-mono text-[10px] text-white/40">×{a.occurrences}</span>}
                          {a.escalated_at && a.state === 'open' && <Pill tone="crit">escalated</Pill>}
                        </div>
                        <p className="text-[15px] text-white leading-snug">{a.message}</p>
                        <p className="font-mono text-[10.5px] text-white/45 mt-1.5">
                          {a.asset_id} · first {ago(a.first_seen)} · last {ago(a.last_seen)}
                          {a.value !== null && a.value !== undefined ? ` · value ${a.value}` : ''}
                        </p>
                        {a.ack_note && <p className="font-mono text-[11px] text-white/55 mt-1 italic">&ldquo;{a.ack_note}&rdquo; — {a.acked_by}</p>}
                      </button>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`${ROUTES.TWIN}?asset=${encodeURIComponent(a.asset_id)}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-surface px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-cyan hover:border-cyan transition"
                          >
                            <Crosshair size={12} /> Locate
                          </Link>
                          <button onClick={() => setOpenId(open ? null : a.id)} className="p-1.5 text-white/40 hover:text-white">
                            <ChevronDown size={16} className={`transition ${open ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                        {a.state === 'open' &&
                          (ackingId === a.id ? (
                            <div className="flex flex-col items-end gap-1.5">
                              <input value={ackNote} onChange={(e) => setAckNote(e.target.value)} placeholder="Ack note…" className="rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-xs text-white w-48 focus:outline-none focus:border-cyan" />
                              <div className="flex gap-1.5">
                                <button onClick={() => act(() => alertsService.ack(a.id, ackNote).then(() => { setAckingId(null); setAckNote('') }))} className="rounded-lg bg-cyan text-brand-surface px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider">Confirm</button>
                                <button onClick={() => { setAckingId(null); setAckNote('') }} className="px-2 font-mono text-[10.5px] uppercase tracking-wider text-white/45">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setAckingId(a.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-white text-brand-surface px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider hover:opacity-90">
                              <Check size={12} /> Acknowledge
                            </button>
                          ))}
                        {(a.state === 'open' || a.state === 'acked') && (
                          <button onClick={() => act(() => alertsService.resolve(a.id))} className="font-mono text-[10.5px] uppercase tracking-wider text-white/45 hover:text-white">
                            Resolve
                          </button>
                        )}
                      </div>
                    </div>
                    {open && (
                      <div className="border-t border-brand-border/70 bg-brand-surface-2/60 px-5 py-4 grid md:grid-cols-[1fr_auto] gap-5 animate-fade-in">
                        <div>
                          <p className="eyebrow mb-2">What else is at stake</p>
                          <BlastRadius assetId={a.asset_id} />
                        </div>
                        <Link href={ROUTES.DIAGNOSIS} className="self-start inline-flex items-center gap-2 rounded-lg border border-brand-border bg-brand-surface px-3.5 py-2 font-mono text-[10.5px] uppercase tracking-wider text-white/75 hover:text-cyan hover:border-cyan transition">
                          <Stethoscope size={13} /> Guided diagnosis
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
