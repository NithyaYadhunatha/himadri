'use client'

// Resilience — how HIMADRI keeps working when the satellite link doesn't.
// The top half is the REAL sync node (queue, budget, pause, last sync) read
// from the backend. The lower half is an interactive link simulator that runs
// the same priority-lane store-and-forward policy the backend's SyncItem queue
// uses, so a judge can cut the link and watch the queue build and drain.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Antenna, Building2, Cpu, Radio, Satellite, Wifi, WifiOff } from 'lucide-react'
import { useBackend } from '@/lib/hooks/usePoll'
import { Kpi, Panel, PageHead, Pill, Meter, LiveDot, Tile, type Tone } from '@/components/ui/kit'
import { ago, fmtBytes, fmtNum } from '@/lib/format'

interface SyncStatus {
  node_id: string
  link_state: string
  paused: boolean
  queue_depth: number
  last_sync: string | null
  bytes_budget: number
}

type Link = 'up' | 'degraded' | 'down'
type Lane = 'alerts' | 'commands' | 'telemetry'

const LANES: { id: Lane; label: string; prio: number; bytes: number; blurb: string; tone: Tone }[] = [
  { id: 'alerts', label: 'P0 · Alerts & audit', prio: 0, bytes: 420, blurb: 'Life-safety first. Always sent before anything else.', tone: 'crit' },
  { id: 'commands', label: 'P1 · Commands & acks', prio: 1, bytes: 310, blurb: 'Two-person approvals and device acknowledgements.', tone: 'warn' },
  { id: 'telemetry', label: 'P2 · Bulk telemetry', prio: 2, bytes: 190, blurb: 'Gzip-batched readings; dropped to hourly means if budget is tight.', tone: 'primary' },
]

// items drained per 500 ms tick for each link state (≈ the story we tell, not a benchmark)
const DRAIN: Record<Link, number> = { up: 60, degraded: 6, down: 0 }
// items produced per tick by the station (alerts are rare, telemetry is constant)
const PRODUCE: Record<Lane, number> = { alerts: 0.12, commands: 0.05, telemetry: 3.2 }

function useSimulator() {
  const [link, setLink] = useState<Link>('up')
  const [queue, setQueue] = useState<Record<Lane, number>>({ alerts: 0, commands: 0, telemetry: 0 })
  const [sent, setSent] = useState({ items: 0, bytes: 0 })
  const [log, setLog] = useState<{ id: number; t: number; text: string; tone: Tone }[]>([])
  const seq = useRef(0)
  const [downSince, setDownSince] = useState<number | null>(null)
  const acc = useRef<Record<Lane, number>>({ alerts: 0, commands: 0, telemetry: 0 })
  const queueRef = useRef<Record<Lane, number>>({ alerts: 0, commands: 0, telemetry: 0 })
  const linkRef = useRef<Link>('up')
  linkRef.current = link

  const push = useCallback((text: string, tone: Tone = 'ink') => {
    setLog((l) => [{ id: ++seq.current, t: Date.now(), text, tone }, ...l].slice(0, 9))
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      const next = { ...queueRef.current }
      // station keeps producing no matter what the link is doing
      for (const lane of LANES) {
        acc.current[lane.id] += PRODUCE[lane.id]
        const whole = Math.floor(acc.current[lane.id])
        acc.current[lane.id] -= whole
        next[lane.id] += whole
      }
      // drain strictly by priority
      let budget = DRAIN[linkRef.current]
      let items = 0
      let bytes = 0
      for (const lane of LANES) {
        const take = Math.min(budget, next[lane.id])
        next[lane.id] -= take
        budget -= take
        items += take
        bytes += take * (lane.id === "telemetry" ? lane.bytes * 0.34 : lane.bytes)
      }
      queueRef.current = next
      setQueue(next)
      if (items > 0) setSent((s) => ({ items: s.items + items, bytes: s.bytes + Math.round(bytes) }))
    }, 500)
    return () => clearInterval(id)
  }, [])

  const set = useCallback(
    (next: Link) => {
      const prev = linkRef.current
      if (prev === next) return
      setLink(next)
      linkRef.current = next
      if (next === "down") {
        setDownSince(Date.now())
        push("Satellite link lost — station switches to store-and-forward", "crit")
      } else if (prev === "down") {
        setDownSince(null)
        push(next === "up" ? "Link restored — draining queue, alerts first" : "Link back at reduced bandwidth — alerts first, bulk later", "ok")
      } else {
        push(next === "degraded" ? "Link degraded — bulk telemetry batched & thinned" : "Link nominal", next === "degraded" ? "warn" : "ok")
      }
    },
    [push],
  )

  const injectAlert = useCallback(() => {
    queueRef.current = { ...queueRef.current, alerts: queueRef.current.alerts + 1 }
    setQueue(queueRef.current)
    push('Critical alert raised locally — queued at P0, local response unaffected', 'crit')
  }, [push])

  const reset = useCallback(() => {
    queueRef.current = { alerts: 0, commands: 0, telemetry: 0 }
    setQueue(queueRef.current)
    setSent({ items: 0, bytes: 0 })
    setLog([])
    setLink('up')
    setDownSince(null)
  }, [])

  return { link, set, queue, sent, log, injectAlert, reset, downSince }
}

function Diagram({ link, queued }: { link: Link; queued: number }) {
  const color = link === 'up' ? '#0F8A6A' : link === 'degraded' ? '#D4820A' : '#C23B3B'
  const dash = link === 'down' ? '2 10' : link === 'degraded' ? '6 6' : '10 6'
  return (
    <svg viewBox="0 0 760 190" className="w-full h-auto" role="img" aria-label="Station to HQ link diagram">
      {/* nodes */}
      <g>
        <rect x="14" y="52" width="190" height="86" rx="16" fill="#FFFEFB" stroke="#DDD5C2" />
        <text x="109" y="86" textAnchor="middle" className="fill-[#1C1F33]" style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>
          Station edge
        </text>
        <text x="109" y="108" textAnchor="middle" fill="#8A8576" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.12em' }}>
          MAITRI · BHARATI
        </text>
        <text x="109" y="124" textAnchor="middle" fill="#8A8576" style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5 }}>
          ingest · alerts · twin · audit
        </text>
      </g>
      <g>
        <circle cx="380" cy="42" r="22" fill="#F7F3EA" stroke="#DDD5C2" />
        <text x="380" y="47" textAnchor="middle" fill="#3A3AB8" style={{ fontSize: 17 }}>
          ✦
        </text>
        <text x="380" y="82" textAnchor="middle" fill="#8A8576" style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.12em' }}>
          SATELLITE
        </text>
      </g>
      <g>
        <rect x="556" y="52" width="190" height="86" rx="16" fill="#1C1F33" />
        <text x="651" y="86" textAnchor="middle" fill="#FFFEFB" style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>
          HQ · NCPOR Goa
        </text>
        <text x="651" y="108" textAnchor="middle" fill="#F2A71B" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.12em' }}>
          MISSION CONTROL
        </text>
        <text x="651" y="124" textAnchor="middle" fill="#B9B4A5" style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5 }}>
          replica · reports · oversight
        </text>
      </g>
      {/* links */}
      <path d="M204 95 Q 292 95 358 52" fill="none" stroke={color} strokeWidth="2.2" strokeDasharray={dash} className={link === 'down' ? '' : 'animate-[flow_1.2s_linear_infinite]'} />
      <path d="M402 52 Q 470 95 556 95" fill="none" stroke={color} strokeWidth="2.2" strokeDasharray={dash} className={link === 'down' ? '' : 'animate-[flow_1.2s_linear_infinite]'} />
      {link === 'down' && (
        <g>
          <circle cx="380" cy="95" r="15" fill="#C23B3B" />
          <path d="M373 88 L387 102 M387 88 L373 102" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}
      {/* local buffer chip */}
      <g>
        <rect x="46" y="150" width="126" height="28" rx="14" fill={queued > 0 ? '#FDF3DF' : '#EDF7F2'} stroke={queued > 0 ? '#D4820A' : '#0F8A6A'} />
        <text x="109" y="168" textAnchor="middle" fill={queued > 0 ? '#9A5D05' : '#0B6B52'} style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
          {queued > 0 ? `buffered · ${fmtNum(queued)} items` : 'buffer empty'}
        </text>
      </g>
    </svg>
  )
}

export default function ResiliencePage() {
  const sync = useBackend<SyncStatus>('sync/status', 8000)
  const sim = useSimulator()
  const totalQueued = sim.queue.alerts + sim.queue.commands + sim.queue.telemetry
  const peak = useRef(0)
  peak.current = Math.max(peak.current, totalQueued)
  const downFor = sim.downSince ? Math.round((Date.now() - sim.downSince) / 1000) : 0
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const savings = useMemo(() => {
    const raw = sim.sent.items * 260
    return raw > 0 ? Math.max(0, Math.round((1 - sim.sent.bytes / raw) * 100)) : null
  }, [sim.sent])

  const s = sync.data
  const linkTone: Tone = sync.error ? 'crit' : s?.link_state === 'up' ? 'ok' : s?.link_state === 'down' ? 'crit' : 'warn'

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto px-6 py-7">
        <PageHead
          eyebrow="Resilience · store-and-forward"
          title="The station never waits for the satellite."
          sub="Everything on the station — ingest, alerting, the twin, two-person approvals, the audit chain — runs on the local node. The uplink only carries what changed, alerts first."
          right={<Pill tone={linkTone} dot>{sync.error ? 'Sync node unreachable' : `Link ${s?.link_state ?? '…'}`}</Pill>}
        />

        {/* LIVE node status */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 stagger">
                    <Tile label="Sync node" icon={<Cpu size={15} />} value={s?.node_id ?? "…"} hint="edge node identity" />
          <Kpi label="Queued for HQ" value={s?.queue_depth ?? null} unit="items" tone={s && s.queue_depth > 200 ? 'warn' : 'primary'} icon={<Radio size={15} />} hint={s?.paused ? 'sync paused by operator' : 'priority-ordered, content-hashed'} />
          <Kpi label="Bytes budget / batch" value={s ? s.bytes_budget / 1_000_000 : null} unit="MB" digits={1} tone="ink" icon={<Antenna size={15} />} hint="gzip batch is refused above this" />
                    <Tile label="Last HQ acknowledgement" icon={<Satellite size={15} />} value={s ? (s.last_sync ? ago(s.last_sync) : "awaiting HQ") : "…"} hint="batches acked by sequence number" tone={s?.last_sync ? "ok" : "warn"} />
        </div>

        {/* SIMULATOR */}
        <Panel
          className="mt-6"
          eyebrow="Interactive · same policy as the backend queue"
          title="Cut the link. Keep the station running."
          right={<Pill tone="warn">Simulation</Pill>}
        >
          <div className="grid xl:grid-cols-[1.4fr_1fr] gap-8">
            <div>
              <Diagram link={sim.link} queued={totalQueued} />
              <div className="flex flex-wrap gap-2 mt-4">
                <button onClick={() => sim.set('down')} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-[11px] uppercase tracking-wider border transition ${sim.link === 'down' ? 'bg-crimson text-white border-crimson' : 'bg-brand-surface border-brand-border text-white/80 hover:border-crimson hover:text-crimson'}`}>
                  <WifiOff size={14} /> Cut link (blizzard)
                </button>
                <button onClick={() => sim.set('degraded')} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-[11px] uppercase tracking-wider border transition ${sim.link === 'degraded' ? 'bg-amber text-white border-amber' : 'bg-brand-surface border-brand-border text-white/80 hover:border-amber hover:text-amber'}`}>
                  <Wifi size={14} /> Degrade
                </button>
                <button onClick={() => sim.set('up')} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-[11px] uppercase tracking-wider border transition ${sim.link === 'up' ? 'bg-emerald text-white border-emerald' : 'bg-brand-surface border-brand-border text-white/80 hover:border-emerald hover:text-emerald'}`}>
                  <Wifi size={14} /> Restore
                </button>
                <span className="w-px bg-brand-border mx-1" />
                <button onClick={sim.injectAlert} className="rounded-lg px-4 py-2 font-mono text-[11px] uppercase tracking-wider border bg-brand-surface border-brand-border text-white/80 hover:border-cyan hover:text-cyan transition">
                  + Critical alert
                </button>
                <button onClick={sim.reset} className="rounded-lg px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-white/45 hover:text-white transition">
                  Reset
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-5">
                <div className="panel p-3">
                  <p className="eyebrow">Link</p>
                  <p className={`font-display text-2xl ${sim.link === 'up' ? 'text-emerald' : sim.link === 'degraded' ? 'text-amber' : 'text-crimson'}`}>{sim.link.toUpperCase()}</p>
                  <p className="font-mono text-[10px] text-white/45">{sim.link === 'down' ? `down ${downFor}s` : 'nominal path'}</p>
                </div>
                <div className="panel p-3">
                  <p className="eyebrow">Delivered to HQ</p>
                  <p className="font-display text-2xl text-white num">{fmtNum(sim.sent.items)}</p>
                  <p className="font-mono text-[10px] text-white/45">{fmtBytes(sim.sent.bytes)} on the wire</p>
                </div>
                <div className="panel p-3">
                  <p className="eyebrow">Bytes saved</p>
                  <p className="font-display text-2xl text-cyan num">{savings === null ? '—' : `${savings}%`}</p>
                  <p className="font-mono text-[10px] text-white/45">vs. sending raw JSON</p>
                </div>
              </div>
            </div>

            <div>
              <p className="eyebrow mb-3">Priority lanes · strict order</p>
              <ul className="space-y-4">
                {LANES.map((l) => {
                  const n = Math.round(sim.queue[l.id])
                  return (
                    <li key={l.id}>
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-[12px] text-white">{l.label}</span>
                        <span className="font-display text-xl num text-white">{fmtNum(n)}</span>
                      </div>
                      <Meter value={Math.min(n, Math.max(60, peak.current))} max={Math.max(60, peak.current)} tone={l.tone} height={7} />
                      <p className="font-mono text-[10px] text-white/45 mt-1">{l.blurb}</p>
                    </li>
                  )
                })}
              </ul>

              <p className="eyebrow mt-6 mb-2">Event log</p>
              <ul className="space-y-1.5 min-h-[120px]">
                {sim.log.length === 0 && <li className="font-mono text-[11px] text-white/40">Cut the link to see the station keep working…</li>}
                {sim.log.map((e) => (
                  <li key={e.id} className="flex items-start gap-2 font-mono text-[11px]">
                    <LiveDot tone={e.tone} size={6} pulse={false} />
                    <span className="text-white/45 num shrink-0">{new Date(e.t).toISOString().slice(14, 19)}</span>
                    <span className="text-white/80">{e.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>

        {/* WHAT KEEPS WORKING */}
        <div className="grid md:grid-cols-3 gap-5 mt-6">
          {[
            { icon: <Cpu size={16} />, title: 'Runs on the station', items: ['Telemetry ingest & alert rules', 'Risk scoring & dependency graph', 'Scenario / what-if engine', 'The 3D / 2D digital twin'] },
            { icon: <Building2 size={16} />, title: 'Governance stays local', items: ['Two-person approval for life-safety actions', '15-minute approval window, then expiry', 'Hash-chained audit ledger', 'Role-scoped station access'] },
            { icon: <Satellite size={16} />, title: 'Uplink is just a courier', items: ['Content-hashed, idempotent batches', 'Acked by sequence number', 'Pause / resume by operator', 'Bytes budget enforced per batch'] },
          ].map((c) => (
            <Panel key={c.title} eyebrow="Design guarantee" title={c.title} right={<span className="text-cyan">{c.icon}</span>}>
              <ul className="space-y-2">
                {c.items.map((i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-white/80">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald shrink-0" />
                    {i}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  )
}
