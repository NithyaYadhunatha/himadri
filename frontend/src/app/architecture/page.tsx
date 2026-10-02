'use client'

// Architecture — the real pipeline, with live counters from the deployed
// backend on every stage, and the physical twin (Arduino + Raspberry Pi) that
// feeds it. This page exists so nobody has to take "strong backend" on faith.
import { useMemo } from 'react'
import {
  Activity,
  Bell,
  Boxes,
  Brain,
  Cable,
  Cpu,
  Database,
  GitBranch,
  Lock,
  MonitorSmartphone,
  Network,
  Radio,
  ScrollText,
  ShieldCheck,
  Sigma,
  Waves,
} from 'lucide-react'
import { useStationStore } from '@/store/useStationStore'
import { STATION_LABELS } from '@/lib/constants'
import { useBackend, usePoll } from '@/lib/hooks/usePoll'
import { Panel, PageHead, Pill, LiveDot, type Tone } from '@/components/ui/kit'
import { fmtNum } from '@/lib/format'

interface Hw {
  deviceId: string
  deviceName: string
  deviceType: string
  roomId: string
  value: number
  displayValue: string
  unit: string
  status: string
  timestamp: number
}

function Stage({
  icon,
  title,
  tag,
  metric,
  metricLabel,
  tone = 'primary',
  body,
}: {
  icon: React.ReactNode
  title: string
  tag: string
  metric: string
  metricLabel: string
  tone?: Tone
  body: string
}) {
  return (
    <div className="panel p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between">
        <span className="w-8 h-8 rounded-lg bg-cyan/10 text-cyan flex items-center justify-center">{icon}</span>
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-white/40">{tag}</span>
      </div>
      <p className="font-display text-[17px] text-white leading-tight">{title}</p>
      <p className="text-[12px] text-white/55 leading-snug flex-1">{body}</p>
      <div className="pt-2 border-t border-brand-border/70 flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">{metricLabel}</span>
        <span className={`font-display text-xl num ${tone === 'ok' ? 'text-emerald' : tone === 'warn' ? 'text-amber' : 'text-white'}`}>{metric}</span>
      </div>
    </div>
  )
}

const Arrow = () => (
  <div className="hidden xl:flex items-center justify-center text-cyan/60">
    <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden>
      <path d="M0 7h22M17 2l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3" className="animate-[flow_1.2s_linear_infinite]" />
    </svg>
  </div>
)

export default function ArchitecturePage() {
  const station = useStationStore((s) => s.station)
  const series = useBackend<unknown[]>('series', 120000)
  const rules = useBackend<unknown[]>('alert-rules', 120000)
  const alerts = useBackend<unknown[]>(`alerts?station=${station}&state=open`, 20000)
  const graph = useBackend<{ nodes: unknown[]; edges: unknown[] }>(`stations/${station}/twin-graph`, 60000)
  const commands = useBackend<unknown[]>(`commands?station=${station}`, 30000)
  const chain = useBackend<{ checked: number; valid: boolean }>('audit/verify', 60000)
  const sync = useBackend<{ queue_depth: number; link_state: string }>('sync/status', 20000)
  const acc = useBackend<{ model_version: string }>('model-accuracy/accuracy', 60000)
  const scen = useBackend<Record<string, string>>('scenarios/presets', 300000)
  const hw = usePoll<Hw[]>('/api/hardware', 8000)

  const rooms = useMemo(() => {
    const m = new Map<string, Hw[]>()
    for (const d of hw.data ?? []) m.set(d.roomId, [...(m.get(d.roomId) ?? []), d])
    return [...m.entries()].sort()
  }, [hw.data])
  const online = (hw.data ?? []).filter((d) => d.status === 'ONLINE').length

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto px-6 py-7">
        <PageHead
          eyebrow={`Architecture · ${STATION_LABELS[station]} node`}
          title="A pipeline you can inspect, stage by stage."
          sub="Every reading takes the same path — from a physical sensor or a device agent, through validation, rules, risk and the dependency graph, out to the twin. Each stage below shows what it is doing right now."
          right={<Pill tone="ok" dot>Deployed backend · live counters</Pill>}
        />

        <p className="eyebrow mb-3">Telemetry path</p>
        <div className="grid xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] gap-3 items-stretch">
          <Stage icon={<Cable size={16} />} title="Sensors & agents" tag="edge" body="Arduino + Raspberry Pi gateway, PySide device agents and MQTT publishers. Each device registers a manifest and gets its own key." metric={fmtNum(Array.isArray(series.data) ? series.data.length : null)} metricLabel="series registered" />
          <Arrow />
          <Stage icon={<Cpu size={16} />} title="Ingest engine" tag="FastAPI" body="One shared pipeline for HTTP heartbeats, MQTT and gateway posts: store the reading, then everything below, atomically." metric="1 pipeline" metricLabel="3 transports" />
          <Arrow />
          <Stage icon={<Bell size={16} />} title="Rules & alerts" tag="engine" body="Threshold, out-of-band and staleness rules per asset; alerts bump, escalate on a timer and auto-resolve when data returns." metric={fmtNum(Array.isArray(rules.data) ? rules.data.length : null)} metricLabel="active rules" />
          <Arrow />
          <Stage icon={<GitBranch size={16} />} title="Dependency graph" tag="Neo4j" body="Who depends on whom. A failing generator's blast radius is computed, not guessed; risk is propagated along the edges." metric={graph.data ? `${graph.data.nodes.length} · ${graph.data.edges.length}` : '—'} metricLabel="nodes · edges" />
          <Arrow />
          <Stage icon={<MonitorSmartphone size={16} />} title="Twin & operators" tag="Next.js + WS" body="2D, floor-plan and 3D Unity twins update over WebSocket. Operators act through role-scoped, station-scoped views." metric={fmtNum(Array.isArray(alerts.data) ? alerts.data.length : null)} metricLabel="open alerts" tone={Array.isArray(alerts.data) && alerts.data.length > 0 ? 'warn' : 'ok'} />
        </div>

        <p className="eyebrow mt-8 mb-3">Control, evidence & intelligence</p>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Stage icon={<Lock size={16} />} title="Command engine" tag="state machine" body="queued → co-approved → sent → acked → applied. Life-safety assets need a second, different user inside 15 minutes or the command expires." metric={fmtNum(Array.isArray(commands.data) ? commands.data.length : null)} metricLabel="commands recorded" />
          <Stage icon={<ScrollText size={16} />} title="Audit ledger" tag="SHA-256 chain" body="Every actuation, device registration and reading entry appends a hash-linked event. Verification recomputes the whole chain." metric={chain.data ? fmtNum(chain.data.checked) : '—'} metricLabel={chain.data?.valid ? 'events · intact' : 'events'} tone={chain.data?.valid ? 'ok' : 'warn'} />
          <Stage icon={<Radio size={16} />} title="Store-and-forward sync" tag="priority lanes" body="Alerts first, commands second, bulk last. Content-hashed batches, acked by sequence, bytes budget per batch." metric={sync.data ? fmtNum(sync.data.queue_depth) : '—'} metricLabel="queued for HQ" />
          <Stage icon={<Brain size={16} />} title="Predictive layer" tag="scikit-learn" body="Random-forest failure classifier + time-to-failure regressor, versioned in a registry; plus explainable risk scoring." metric={acc.data ? acc.data.model_version.replace('v_', '') : '—'} metricLabel="model version" />
          <Stage icon={<Sigma size={16} />} title="Scenario engine" tag="what-if" body="A pure day-stepper that never writes live state: resupply failure, generator loss in winter, medical evacuation, stranded convoy, katabatic storm." metric={scen.data ? String(Object.keys(scen.data).length) : '—'} metricLabel="preset scenarios" />
          <Stage icon={<Network size={16} />} title="Operations agent" tag="MCP" body="Natural-language questions answered by calling the backend's own read, report and simulation endpoints. It cannot actuate anything." metric="read-only" metricLabel="by design" />
          <Stage icon={<Database size={16} />} title="Stores" tag="Postgres · Neo4j" body="Postgres for readings, alerts, commands and the ledger; Neo4j for the dependency graph. Station nodes carry only their own state." metric="2 stores" metricLabel="+ MQTT broker" />
          <Stage icon={<ShieldCheck size={16} />} title="Access control" tag="Clerk · RBAC" body="Station-scoped roles enforced at every proxy route: a Maitri engineer cannot read Bharati data even by editing a request." metric="6 roles" metricLabel="station-scoped" />
        </div>

        <Panel
          className="mt-8"
          eyebrow="Physical twin"
          title="Arduino + Raspberry Pi hardware loop"
          right={
            <Pill tone={online > 0 ? 'ok' : 'mute'} dot>
              {online > 0 ? `${online} devices online` : 'hardware idle'}
            </Pill>
          }
        >
          <p className="text-[13px] text-white/60 mb-5 max-w-3xl leading-relaxed">
            Real sensors (DHT, MQ-2, Hall-effect, ADXL335, HC-SR04, IR) are read by an Arduino Uno and a Raspberry Pi, merged by a gateway and posted to the backend, which relays them to the Unity digital twin. Commands flow back the other way — buzzer and servo — through the same approval-gated path as everything else.
          </p>
          {hw.loading && !hw.data ? (
            <div className="animate-shimmer h-28 rounded-lg" />
          ) : rooms.length === 0 ? (
            <p className="text-sm text-white/50">Hardware gateway not reporting.</p>
          ) : (
            <div className="grid md:grid-cols-3 gap-4">
              {rooms.map(([room, devs]) => (
                <div key={room} className="rounded-xl border border-brand-border bg-brand-surface-2/60 p-4">
                  <p className="eyebrow mb-3">{room === 'room-01' ? 'Environment monitoring' : room === 'room-02' ? 'Safety & occupancy' : 'Equipment monitoring'}</p>
                  <ul className="space-y-2">
                    {devs.map((d) => (
                      <li key={d.deviceId} className="flex items-center gap-2 font-mono text-[11.5px]">
                        <LiveDot tone={d.status === 'ONLINE' ? 'ok' : 'mute'} size={7} pulse={d.status === 'ONLINE'} />
                        <span className="text-white flex-1 truncate">{d.deviceName}</span>
                        <span className="text-white/55 num">{d.status === 'ONLINE' ? `${d.displayValue || d.value} ${d.unit}` : 'offline'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="grid md:grid-cols-3 gap-5 mt-6">
          {[
            { icon: <Boxes size={16} />, t: 'Add a station without code', d: 'Stations, zones and assets are data. Maitri-II or any new base is a manifest and a few rows, not a deployment.' },
            { icon: <Waves size={16} />, t: 'Built for a bad link', d: 'Local-first processing with a priority store-and-forward queue; the uplink carries deltas, not dashboards.' },
            { icon: <Activity size={16} />, t: 'One path for every reading', d: 'HTTP agents, MQTT and the hardware gateway converge on one ingest function — one place to test, audit and trust.' },
          ].map((c) => (
            <Panel key={c.t} eyebrow="Design principle" title={c.t} right={<span className="text-cyan">{c.icon}</span>}>
              <p className="text-[13px] text-white/65 leading-relaxed">{c.d}</p>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  )
}
