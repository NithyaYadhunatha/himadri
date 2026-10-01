// src/components/layout/StatusBar.tsx
//
// The always-visible integrity strip under the nav: link state, sync queue,
// audit-chain verdict, fleet health and open alerts for the active station.
// Every figure is read from the live backend, nothing here is decorative.
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useStationStore } from '@/store/useStationStore'
import { STATION_LABELS, ROUTES } from '@/lib/constants'
import { useBackend } from '@/lib/hooks/usePoll'
import { LiveDot, type Tone } from '@/components/ui/kit'
import { fmtBytes, ago } from '@/lib/format'

interface SyncStatus {
  link_state: string
  paused: boolean
  queue_depth: number
  last_sync: string | null
  bytes_budget: number
}
interface AuditVerify {
  valid: boolean
  checked: number
  first_break_seq: number | null
}
interface Summary {
  total_assets: number
  ok_assets: number
  degraded_assets: number
  fault_or_offline_assets: number
  avg_health_score: number
  open_alerts: number
  critical_alerts: number
}

function Cell({
  href,
  label,
  value,
  tone,
  sub,
  pulse,
}: {
  href: string
  label: string
  value: string
  tone: Tone
  sub?: string
  pulse?: boolean
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 px-4 py-2 border-r border-brand-border/70 last:border-r-0 hover:bg-brand-surface-2 transition-colors min-w-0"
    >
      <LiveDot tone={tone} size={7} pulse={!!pulse} />
      <div className="leading-tight min-w-0">
        <p className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-white/40">{label}</p>
        <p className="font-mono text-[11.5px] font-semibold text-white num truncate">
          {value}
          {sub && <span className="font-normal text-white/45"> · {sub}</span>}
        </p>
      </div>
    </Link>
  )
}

export function StatusBar() {
  const station = useStationStore((s) => s.station)
  const sync = useBackend<SyncStatus>('sync/status', 12000)
  const audit = useBackend<AuditVerify>('audit/verify', 30000)
  const sum = useBackend<Summary>(`stations/${station}/summary`, 15000)

  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const link = sync.data?.link_state ?? 'unknown'
  const linkTone: Tone = sync.error ? 'crit' : link === 'up' ? 'ok' : link === 'degraded' ? 'warn' : link === 'down' ? 'crit' : 'warn'
  const linkLabel = sync.error ? 'UNREACHABLE' : link === 'unknown' ? 'MONITORING' : link.toUpperCase()

  const chainTone: Tone = audit.error ? 'mute' : audit.data?.valid ? 'ok' : 'crit'
  const s = sum.data
  const healthy = s ? s.ok_assets : null
  const healthTone: Tone = !s ? 'mute' : s.fault_or_offline_assets > s.total_assets * 0.5 ? 'crit' : s.degraded_assets + s.fault_or_offline_assets > 0 ? 'warn' : 'ok'
  const alertTone: Tone = !s ? 'mute' : s.critical_alerts > 0 ? 'crit' : s.open_alerts > 0 ? 'warn' : 'ok'

  return (
    <div className="bg-brand-surface border-b border-brand-border flex items-stretch overflow-x-auto">
      <div className="flex items-center gap-2 px-4 border-r border-brand-border/70 shrink-0 bg-white text-brand-surface">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] opacity-60">Station</span>
        <span className="font-display text-[15px] leading-none">{STATION_LABELS[station]}</span>
      </div>
      <Cell
        href={ROUTES.RESILIENCE}
        label="Uplink to HQ"
        value={linkLabel}
        tone={linkTone}
        sub={sync.data ? `${sync.data.queue_depth} queued` : undefined}
        pulse={linkTone === 'ok'}
      />
      <Cell
        href={ROUTES.RESILIENCE}
        label="Sync budget"
        value={sync.data ? fmtBytes(sync.data.bytes_budget) : '—'}
        tone={sync.data?.paused ? 'warn' : 'primary'}
        sub={sync.data ? (sync.data.last_sync ? ago(sync.data.last_sync) : 'never synced') : undefined}
      />
      <Cell
        href={ROUTES.TRUST}
        label="Audit chain"
        value={audit.error ? 'UNAVAILABLE' : audit.data ? (audit.data.valid ? 'VERIFIED' : 'BROKEN') : '…'}
        tone={chainTone}
        sub={audit.data ? `${audit.data.checked} events` : undefined}
      />
      <Cell
        href={ROUTES.ASSETS}
        label="Assets reporting"
        value={s ? `${healthy}/${s.total_assets}` : '—'}
        tone={healthTone}
        sub={s ? (s.fault_or_offline_assets > 0 ? `${s.fault_or_offline_assets} offline` : `${s.degraded_assets} degraded`) : undefined}
      />
      <Cell
        href={ROUTES.ALERTS}
        label="Open alerts"
        value={s ? String(s.open_alerts) : '—'}
        tone={alertTone}
        sub={s ? `${s.critical_alerts} critical` : undefined}
        pulse={alertTone === 'crit'}
      />
      <div className="ml-auto flex items-center px-4 shrink-0 font-mono text-[11px] text-white/55 num border-l border-brand-border/70">
        {now ? `${now.toISOString().slice(11, 19)} UTC` : '--:--:-- UTC'}
      </div>
    </div>
  )
}
