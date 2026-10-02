'use client'

// Replay — scrub or play back the station's last day: key signals on one time
// axis with every alert marked where it fired. Reads the same series history the
// forecasts use, so what you replay is what the system actually recorded.
import { useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { useStationStore } from '@/store/useStationStore'
import { STATION_LABELS } from '@/lib/constants'
import { useBackend } from '@/lib/hooks/usePoll'
import { Kpi, Panel, PageHead, Pill, Skeleton } from '@/components/ui/kit'
import { fmtNum, naiveUtc, toMs } from '@/lib/format'

interface SeriesRow { key: string; asset_id: string; station_id: string; label: string; unit: string }
interface Bucket { ts: string; value: number }
interface Alert { id: string; severity: string; message: string; first_seen: string; state: string; asset_id: string }

const PICKS: { match: RegExp; name: string; unit: string; color: string }[] = [
  { match: /power-generator-01\.power_kw$/, name: 'Generator 1', unit: 'kW', color: '#1D1C93' },
  { match: /fuel-tank-01\.level_l$/, name: 'Fuel Tank 01', unit: 'L', color: '#0F8A6A' },
  { match: /instrument-aws-01\.temp_c$/, name: 'Air temperature', unit: '°C', color: '#D4820A' },
  { match: /storage-freezer-01\.temp_c$/, name: 'Freezer 1', unit: '°C', color: '#A04FB8' },
]

export default function ReplayPage() {
  const station = useStationStore((s) => s.station)
  const series = useBackend<SeriesRow[]>('series', 300000)
  const alerts = useBackend<Alert[]>(`alerts?station=${station}`, 60000)
  const [data, setData] = useState<Record<string, number | string>[] | null>(null)
  const [picked, setPicked] = useState<{ key: string; name: string; unit: string; color: string }[]>([])
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!series.data) return
    const chosen = PICKS.map((p) => {
      const s = series.data!.find((x) => x.station_id === station && p.match.test(x.key))
      return s ? { key: s.key, name: p.name, unit: p.unit, color: p.color } : null
    }).filter((x): x is { key: string; name: string; unit: string; color: string } => !!x)
    setPicked(chosen)
    let alive = true
    ;(async () => {
      const from = naiveUtc(Date.now() - 30 * 3600 * 1000)
      const per = await Promise.all(
        chosen.map((c) =>
          fetch(`/api/backend/series/${encodeURIComponent(c.key)}/readings?from=${encodeURIComponent(from)}&bucket=1h`)
            .then((r) => (r.ok ? r.json() : []))
            .then((b: Bucket[]) => ({ c, b })),
        ),
      )
      const m = new Map<number, Record<string, number | string>>()
      for (const { c, b } of per) {
        for (const p of b) {
          const t = toMs(p.ts)
          const row = m.get(t) ?? { t }
          row[c.key] = Number(p.value.toFixed(1))
          m.set(t, row)
        }
      }
      if (alive) {
        const rows = [...m.values()].sort((a, b) => Number(a.t) - Number(b.t))
        // each series gets a 0–1 normalised twin so unlike units share one axis
        for (const c of chosen) {
          const vals = rows.map((r) => r[c.key]).filter((v): v is number => typeof v === 'number')
          const lo = Math.min(...vals)
          const hi = Math.max(...vals)
          for (const r of rows) if (typeof r[c.key] === 'number') r[`${c.key}__n`] = hi === lo ? 0.5 : (((r[c.key] as number) - lo) / (hi - lo))
        }
        setData(rows)
        setIdx(Math.max(0, rows.length - 1))
      }
    })()
    return () => { alive = false }
  }, [series.data, station])

  useEffect(() => {
    if (!playing || !data) return
    timer.current = setInterval(() => {
      setIdx((i) => {
        if (i >= data.length - 1) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, 450)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [playing, data])

  const row = data?.[idx]
  const t = row ? Number(row.t) : null
  const marks = useMemo(() => {
    if (!data || !data.length) return []
    const lo = Number(data[0].t)
    const hi = Number(data[data.length - 1].t) + 3600000
    return (alerts.data ?? []).map((a) => ({ ...a, t: toMs(a.first_seen) })).filter((a) => a.t >= lo && a.t <= hi)
  }, [alerts.data, data])
  const seen = marks.filter((a) => t !== null && a.t <= t + 3600000)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1300px] mx-auto px-6 py-7">
        <PageHead
          eyebrow={`Replay · ${STATION_LABELS[station]}`}
          title="Rewind the station."
          sub="Scrub or play back the last day of key signals, with every alert marked where it fired — for post-incident review and for showing how a fault unfolded."
          right={row ? <Pill tone="primary">{new Date(Number(row.t)).toISOString().slice(0, 16).replace('T', ' ')} UTC</Pill> : undefined}
        />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {picked.map((p) => (
            <Kpi key={p.key} label={p.name} value={row && typeof row[p.key] === 'number' ? Number(row[p.key]) : null} unit={p.unit} digits={p.unit === 'L' ? 0 : 1} tone="ink" hint="at the selected hour" />
          ))}
          {picked.length === 0 && <Skeleton className="h-28 col-span-4" />}
        </div>

        <Panel className="mt-5" eyebrow="Last 30 hours" title="Signals & incidents" right={<Pill tone={seen.length ? 'warn' : 'ok'}>{seen.length} alert{seen.length === 1 ? '' : 's'} so far</Pill>}>
          {!data ? (
            <Skeleton className="h-72" />
          ) : data.length < 3 ? (
            <p className="font-mono text-[12px] text-white/50">Not enough history to replay yet.</p>
          ) : (
            <>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#8E8EB0" strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => new Date(v).toISOString().slice(11, 16)} tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#626079' }} axisLine={false} tickLine={false} minTickGap={40} />
                    <YAxis hide domain={[0, 1]} />
                    <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #8E8EB0', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 11 }} labelFormatter={(v) => new Date(Number(v)).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'} />
                    {picked.map((p) => (
                      <Line key={p.key} dataKey={`${p.key}__n`} name={p.name} stroke={p.color} strokeWidth={2} dot={false} yAxisId={0} isAnimationActive={false} connectNulls />
                    ))}
                    {t !== null && <ReferenceLine x={t} stroke="#080330" strokeWidth={2} />}
                    {marks.map((a) => (
                      <ReferenceDot key={a.id} x={a.t} y={0.02} r={5} fill={a.severity === 'critical' || a.severity === 'emergency' ? '#C23B3B' : '#D4820A'} stroke="#fff" ifOverflow="extendDomain" />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <button onClick={() => (idx >= data.length - 1 ? (setIdx(0), setPlaying(true)) : setPlaying((p) => !p))} className="inline-flex items-center gap-2 rounded-xl bg-white text-brand-surface px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider">
                  {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pause' : 'Play'}
                </button>
                <button onClick={() => { setPlaying(false); setIdx(0) }} className="p-2 text-white/50 hover:text-white" aria-label="Restart"><RotateCcw size={15} /></button>
                <input type="range" min={0} max={data.length - 1} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)) }} className="flex-1 accent-[#1D1C93]" />
                <span className="font-mono text-[11px] text-white/55 num w-16 text-right">{idx + 1}/{data.length}</span>
              </div>
            </>
          )}
        </Panel>

        <Panel className="mt-5" eyebrow="Incident log" title="Alerts in this window" pad={false}>
          {marks.length === 0 ? (
            <p className="p-5 text-sm text-white/55">No alerts fired in this window.</p>
          ) : (
            <ul className="divide-y divide-brand-border/70">
              {[...marks].sort((a, b) => b.t - a.t).slice(0, 12).map((a) => (
                <li key={a.id} className={`flex items-center gap-3 px-5 py-3 ${t !== null && a.t > t + 3600000 ? 'opacity-35' : ''}`}>
                  <Pill tone={a.severity === 'critical' || a.severity === 'emergency' ? 'crit' : 'warn'}>{a.severity}</Pill>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-white truncate">{a.message}</p>
                    <p className="font-mono text-[10.5px] text-white/45">{a.asset_id} · {new Date(a.t).toISOString().slice(0, 16).replace('T', ' ')} UTC · {a.state}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <p className="font-mono text-[10.5px] text-white/40 mt-4">Hourly means from the recorded series; values in different units share one time axis (scales hidden), so read the cards above for exact figures at the cursor.</p>
        <p className="hidden">{fmtNum(0)}</p>
      </div>
    </div>
  )
}
