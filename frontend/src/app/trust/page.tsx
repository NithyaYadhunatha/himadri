'use client'

// Trust Center — the evidence layer. What can be proven about the data
// (provenance on every fact), about the actions taken on the station (the
// two-person command pipeline) and about the record itself (the hash-chained
// audit ledger, verified by the backend on demand).
import { useMemo, useState } from 'react'
import { CheckCircle2, Fingerprint, Lock, ShieldCheck, Users } from 'lucide-react'
import { useStationStore } from '@/store/useStationStore'
import { STATION_LABELS } from '@/lib/constants'
import { useBackend } from '@/lib/hooks/usePoll'
import { Kpi, Panel, PageHead, Pill, Provenance, Meter, Skeleton, type Tone } from '@/components/ui/kit'
import { ago, fmtNum } from '@/lib/format'

interface AuditRow {
  seq: number
  ts: string
  user_id: string | null
  role: string | null
  station_id: string | null
  action: string
  resource: string | null
  detail: Record<string, unknown> | null
}
interface Verify {
  valid: boolean
  checked: number
  first_break_seq: number | null
}
interface Command {
  id: string
  station_id: string
  asset_id: string
  action: string
  issued_by: string
  issued_role: string
  requires_second_approval: boolean
  approved_by: string | null
  state: string
  expires_at: string
  created_at: string
}
interface Asset {
  id: string
  provenance: string
}

const STAGES = [
  { id: 'queued', label: 'Queued', note: 'Issued; waiting' },
  { id: 'approved', label: 'Co-approved', note: 'A different person signs off' },
  { id: 'sent', label: 'Sent', note: 'Delivered to the device' },
  { id: 'acked', label: 'Acked', note: 'Device confirms receipt' },
  { id: 'applied', label: 'Applied', note: 'Telemetry shows the change' },
]

function stageIndex(c: Command): number {
  if (c.state === 'applied') return 4
  if (c.state === 'acked') return 3
  if (c.state === 'sent') return 2
  if (c.requires_second_approval && c.approved_by) return 1
  return c.state === 'queued' ? 0 : 2
}

const actionTone = (a: string): Tone => (a.startsWith('command') ? 'warn' : a.startsWith('device') ? 'primary' : a.startsWith('alert') ? 'crit' : 'ink')

export default function TrustPage() {
  const station = useStationStore((s) => s.station)
  const chain = useBackend<Verify>('audit/verify', 0)
  const audit = useBackend<AuditRow[]>('audit?limit=300', 30000)
  const cmds = useBackend<Command[]>(`commands?station=${station}`, 15000)
  const assets = useBackend<Asset[]>(`assets?station=${station}`, 120000)
  const [filter, setFilter] = useState<string>('ops')
  const [verifying, setVerifying] = useState(false)

  const rows = audit.data ?? []
  const byAction = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.action, (m.get(r.action) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])
  const shown = rows.filter((r) => (filter === 'all' ? true : filter === 'ops' ? r.action !== 'reading.manual' : r.action === filter)).slice(0, 14)

  const prov = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of assets.data ?? []) m[a.provenance] = (m[a.provenance] ?? 0) + 1
    return m
  }, [assets.data])
  const provTotal = Object.values(prov).reduce((a, b) => a + b, 0)

  async function reverify() {
    setVerifying(true)
    chain.refresh()
    setTimeout(() => setVerifying(false), 900)
  }

  const valid = chain.data?.valid
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto px-6 py-7">
        <PageHead
          eyebrow={`Trust center · ${STATION_LABELS[station]}`}
          title="Nothing happens here without a witness."
          sub="Every number carries its provenance, every actuation needs two people, and every event is chained so the record cannot be quietly rewritten."
        />

        {/* verdict */}
        <div className={`panel p-6 flex flex-wrap items-center gap-6 border-2 ${valid === undefined ? 'border-brand-border' : valid ? 'border-emerald/50' : 'border-crimson/60'}`}>
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${valid ? 'bg-emerald/10 text-emerald' : 'bg-crimson/10 text-crimson'}`}>
            <ShieldCheck size={34} />
          </div>
          <div className="flex-1 min-w-[260px]">
            <p className="eyebrow">Audit ledger verdict</p>
            <p className="font-display text-[34px] leading-tight text-white">
              {valid === undefined ? 'Verifying…' : valid ? 'Chain intact' : `Broken at event #${chain.data?.first_break_seq}`}
            </p>
            <p className="font-mono text-[11.5px] text-white/55 mt-1">
              {chain.data ? `${fmtNum(chain.data.checked)} events re-hashed end-to-end (SHA-256, each row covers the previous row's hash) · checked ${ago(chain.updatedAt)}` : 'Recomputing every link of the chain on the server…'}
            </p>
          </div>
          <button onClick={reverify} className="rounded-lg border border-brand-border bg-brand-surface px-5 py-2.5 font-mono text-[11px] uppercase tracking-wider text-white hover:border-cyan hover:text-cyan transition">
            {verifying ? 'Verifying…' : 'Re-verify now'}
          </button>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-5 stagger">
          <Kpi label="Events in ledger" value={chain.data?.checked ?? null} tone="ok" icon={<Fingerprint size={15} />} hint="append-only, hash-linked" />
          <Kpi label="Commands issued" value={cmds.data?.length ?? null} tone="primary" icon={<Users size={15} />} hint={`${(cmds.data ?? []).filter((c) => c.requires_second_approval).length} required a second approver`} />
          <Kpi label="Approval window" value={15} unit="min" tone="warn" icon={<Lock size={15} />} hint="then the command expires untouched" />
          <Kpi label="Facts with provenance" value={provTotal || null} tone="ink" icon={<CheckCircle2 size={15} />} hint="verified · documentary · simulated · unverified" />
        </div>

        <div className="grid xl:grid-cols-[1.5fr_1fr] gap-5 mt-5">
          <Panel
            eyebrow="Append-only ledger"
            title="Recent events"
            pad={false}
            right={
              <div className="flex flex-wrap gap-1.5 justify-end max-w-[420px]">
                <button onClick={() => setFilter('ops')} className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${filter === 'ops' ? 'bg-white text-brand-surface border-white' : 'border-brand-border text-white/55 hover:text-white'}`}>
                  operations
                </button>
                <button onClick={() => setFilter('all')} className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${filter === 'all' ? 'bg-white text-brand-surface border-white' : 'border-brand-border text-white/55 hover:text-white'}`}>
                  all
                </button>
                {byAction.slice(0, 4).map(([a, n]) => (
                  <button key={a} onClick={() => setFilter(a)} className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${filter === a ? 'bg-white text-brand-surface border-white' : 'border-brand-border text-white/55 hover:text-white'}`}>
                    {a} · {n}
                  </button>
                ))}
              </div>
            }
          >
            {audit.loading && !audit.data ? (
              <div className="p-5"><Skeleton className="h-56" /></div>
            ) : (
              <ul className="divide-y divide-brand-border/70">
                {shown.map((r, i) => (
                  <li key={r.seq} className="flex items-center gap-3 px-5 py-2.5 relative">
                    {i < shown.length - 1 && <span className="absolute left-[33px] top-8 bottom-[-10px] w-px bg-brand-border" />}
                    <span className="w-7 h-7 rounded-full bg-brand-surface-2 border border-brand-border flex items-center justify-center font-mono text-[9.5px] text-white/60 num shrink-0 z-10">
                      {r.seq}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Pill tone={actionTone(r.action)}>{r.action}</Pill>
                        <span className="font-mono text-[11px] text-white truncate">{r.resource ?? '—'}</span>
                      </div>
                      <p className="font-mono text-[10px] text-white/40 mt-0.5 truncate">
                        {r.user_id ?? 'system'}
                        {r.role ? ` (${r.role})` : ''} · {r.station_id ?? 'fleet'} · {ago(r.ts)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="space-y-5">
            <Panel eyebrow="What the data can prove" title="Provenance of station facts">
              {provTotal === 0 ? (
                <Skeleton className="h-28" />
              ) : (
                <ul className="space-y-3">
                  {Object.entries(prov)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, n]) => (
                      <li key={k}>
                        <div className="flex items-center justify-between mb-1">
                          <Provenance kind={k} />
                          <span className="font-mono text-[11px] text-white/70 num">{n} assets</span>
                        </div>
                        <Meter value={n} max={provTotal} tone={k === 'verified' ? 'ok' : k === 'simulated' ? 'warn' : k === 'documentary' ? 'primary' : 'mute'} height={6} />
                      </li>
                    ))}
                </ul>
              )}
              <p className="text-[12px] text-white/50 mt-4 leading-relaxed">
                Figures that were invented to make a demo look full are labelled <b>simulated</b>. Figures taken from NCPOR / MoES material are <b>documentary</b>. Nothing is passed off as measured.
              </p>
            </Panel>
          </div>
        </div>

        {/* two-person pipeline */}
        <Panel className="mt-5" eyebrow="Remote actuation" title="The two-person pipeline" right={<Pill tone="warn">Life-safety assets</Pill>}>
          <ol className="grid grid-cols-5 gap-2 mb-6">
            {STAGES.map((s, i) => (
              <li key={s.id} className="relative">
                <div className="h-1.5 rounded-full bg-cyan/20 mb-2 overflow-hidden"><div className="h-full w-full bg-cyan" style={{ opacity: 0.25 + i * 0.18 }} /></div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-white">{s.label}</p>
                <p className="font-mono text-[10px] text-white/45">{s.note}</p>
              </li>
            ))}
          </ol>
          {cmds.loading && !cmds.data ? (
            <Skeleton className="h-24" />
          ) : (cmds.data ?? []).length === 0 ? (
            <p className="text-sm text-white/50">No commands have been issued for this station yet.</p>
          ) : (
            <ul className="space-y-4">
              {(cmds.data ?? []).slice(0, 5).map((c) => {
                const idx = stageIndex(c)
                const failed = c.state === 'failed' || c.state === 'expired'
                return (
                  <li key={c.id} className="rounded-xl border border-brand-border bg-brand-surface-2/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-[12.5px] text-white">
                        <span className="font-bold">{c.action.toUpperCase()}</span> · {c.asset_id}
                      </p>
                      <div className="flex items-center gap-2">
                        {c.requires_second_approval ? <Pill tone="warn">needs 2nd approver</Pill> : <Pill tone="mute">single approver class</Pill>}
                        <Pill tone={failed ? 'crit' : c.state === 'applied' ? 'ok' : 'primary'}>{c.state}</Pill>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 mt-3">
                      {STAGES.map((s, i) => (
                        <div key={s.id} className={`h-2 rounded-full ${failed ? 'bg-crimson/30' : i <= idx ? 'bg-cyan' : 'bg-brand-surface-3'}`} />
                      ))}
                    </div>
                    <p className="font-mono text-[10.5px] text-white/50 mt-2">
                      issued by <b className="text-white/80">{c.issued_by}</b> ({c.issued_role})
                      {c.approved_by ? <> · co-approved by <b className="text-white/80">{c.approved_by}</b></> : c.requires_second_approval ? ' · waiting for a different authorised user' : ''} · {ago(c.created_at)}
                    </p>
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
