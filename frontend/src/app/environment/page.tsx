'use client'

// Environment — real conditions around the station (Open-Meteo, keyless), a
// 7-day storm watch derived from the hourly forecast, and what that weather
// means for the station: outdoor work, convoy windows and heating load.
import { useMemo } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Droplets, Gauge, Navigation, Snowflake, Thermometer, Wind } from 'lucide-react'
import { useStationStore } from '@/store/useStationStore'
import { STATION_LABELS } from '@/lib/constants'
import { usePoll, useBackend } from '@/lib/hooks/usePoll'
import { Kpi, Panel, PageHead, Pill, Provenance, Skeleton, type Tone } from '@/components/ui/kit'
import { ago, fmtNum } from '@/lib/format'

interface Weather {
  temperatureC: number
  feelsLikeC: number
  windSpeedKmh: number
  windGustKmh: number
  windDirectionDeg: number
  humidityPct: number
  pressureHpa: number
  snowfallCm: number
  weatherLabel: string
  observedAt: string
  isDay: boolean
}
interface Pt {
  t: number
  temp: number
  wind: number
  gust: number
  pressure: number
  snow: number
}
interface Forecast {
  points: Pt[]
}
interface Asset {
  id: string
  name: string
  category: string
  status: string
  last_seen: string | null
  primary_value: number | null
}

const compass = (deg: number) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(deg / 22.5) % 16]

// Operational wind bands (km/h gusts) — the thresholds the advice below keys off
const BANDS: { max: number; label: string; tone: Tone; advice: string }[] = [
  { max: 40, label: 'Calm', tone: 'ok', advice: 'Normal outdoor operations and convoy movement.' },
  { max: 70, label: 'Watch', tone: 'warn', advice: 'Limit exposed work; secure loose equipment; buddy rule outdoors.' },
  { max: 100, label: 'Warning', tone: 'crit', advice: 'Hold convoys. Outdoor work only if essential and tethered.' },
  { max: Infinity, label: 'Severe', tone: 'crit', advice: 'Station lockdown. Indoor only; pre-position fuel & check heat trace.' },
]
const band = (g: number) => BANDS.find((b) => g < b.max) ?? BANDS[BANDS.length - 1]

export default function EnvironmentPage() {
  const station = useStationStore((s) => s.station)
  const wx = usePoll<Weather>(`/api/environment/weather?station=${station}`, 300000)
  const fc = usePoll<Forecast>(`/api/environment/forecast?station=${station}`, 900000)
  const assets = useBackend<Asset[]>(`assets?station=${station}`, 60000)

  const pts = fc.data?.points ?? []
  const now = Date.now()
  const future = pts.filter((p) => p.t >= now - 3600000)
  const next72 = future.filter((p) => p.t <= now + 72 * 3600000)
  const maxGust = next72.length ? Math.max(...next72.map((p) => p.gust)) : null
  const peak = next72.find((p) => p.gust === maxGust)
  const outlook = maxGust !== null ? band(maxGust) : null
  const nextLull = future.find((p) => p.t > now && p.gust < 40)
  const aws = (assets.data ?? []).filter((a) => a.category === 'instrument').slice(0, 8)
  const w = wx.data

  const chart = useMemo(() => pts.filter((p) => p.t >= now - 24 * 3600000), [pts, now])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto px-6 py-7">
        <PageHead
          eyebrow={`Environment · ${STATION_LABELS[station]}`}
          title={w ? `${w.temperatureC.toFixed(0)}°C and ${w.weatherLabel.toLowerCase()}.` : 'Reading the sky…'}
          sub="Real conditions at the station's coordinates, a seven-day storm watch, and what the weather means for work outdoors, the convoy and the heating load."
          right={
            <>
              <Provenance kind="live" />
              <span className="font-mono text-[10.5px] text-white/65">Open-Meteo · {w ? `observed ${ago(w.observedAt)}` : '…'}</span>
            </>
          }
        />

        <div className="grid grid-cols-2 xl:grid-cols-6 gap-4 stagger">
          <Kpi label="Temperature" value={w?.temperatureC ?? null} unit="°C" digits={1} tone="primary" icon={<Thermometer size={15} />} hint={w ? `feels like ${w.feelsLikeC.toFixed(0)}°C` : ''} />
          <Kpi label="Wind" value={w?.windSpeedKmh ?? null} unit="km/h" digits={0} tone="ink" icon={<Wind size={15} />} hint={w ? `from ${compass(w.windDirectionDeg)} · gusts ${w.windGustKmh.toFixed(0)}` : ''} />
          <Kpi label="Humidity" value={w?.humidityPct ?? null} unit="%" digits={0} tone="ink" icon={<Droplets size={15} />} hint="relative" />
          <Kpi label="Pressure" value={w?.pressureHpa ?? null} unit="hPa" digits={0} tone="ink" icon={<Gauge size={15} />} hint="surface" />
          <Kpi label="Snowfall" value={w?.snowfallCm ?? null} unit="cm/h" digits={1} tone="ink" icon={<Snowflake size={15} />} hint={w ? (w.isDay ? 'daylight' : 'polar night / dark') : ''} />
          <Kpi label="Peak gust · 72 h" value={maxGust} unit="km/h" digits={0} tone={outlook?.tone ?? 'mute'} icon={<Navigation size={15} />} hint={peak ? `at ${new Date(peak.t).toISOString().slice(5, 16).replace('T', ' ')} UTC` : ''} />
        </div>

        <div className="grid xl:grid-cols-[1.6fr_1fr] gap-5 mt-5">
          <Panel eyebrow="Storm watch" title="Wind & gusts · yesterday → next 7 days" right={outlook && <Pill tone={outlook.tone} dot>{outlook.label} next 72 h</Pill>}>
            {fc.loading && !fc.data ? (
              <Skeleton className="h-64" />
            ) : (
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={pts} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#8E8EB0" strokeDasharray="3 5" vertical={false} />
                    <ReferenceArea y1={70} y2={100} fill="#D4820A" fillOpacity={0.07} />
                    <ReferenceArea y1={100} y2={200} fill="#C23B3B" fillOpacity={0.08} />
                    <ReferenceLine y={70} stroke="#D4820A" strokeDasharray="4 4" />
                    <ReferenceLine y={100} stroke="#C23B3B" strokeDasharray="4 4" />
                    <ReferenceLine x={now} stroke="#080330" strokeDasharray="2 3" label={{ value: 'now', fontSize: 10, fill: '#080330', position: 'insideTopRight' }} />
                    <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#626079' }} axisLine={false} tickLine={false} minTickGap={50} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#626079' }} axisLine={false} tickLine={false} width={42} unit="" domain={[0, (d: number) => Math.max(110, Math.ceil(d / 10) * 10)]} />
                    <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #8E8EB0', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 11 }} labelFormatter={(t) => new Date(Number(t)).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'} formatter={(v, n) => [`${Number(v).toFixed(0)} km/h`, n === 'gust' ? 'Gust' : 'Wind']} />
                    <Area dataKey="gust" stroke="#C23B3B" strokeWidth={1.4} fill="#C23B3B" fillOpacity={0.12} isAnimationActive={false} />
                    <Line dataKey="wind" stroke="#080330" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex flex-wrap gap-4 mt-2 font-mono text-[10.5px] text-white/70">
              <span><i className="inline-block w-2.5 h-0.5 bg-white align-middle mr-1.5" />sustained wind</span>
              <span><i className="inline-block w-2.5 h-2.5 bg-crimson/30 align-middle mr-1.5" />gusts</span>
              <span><i className="inline-block w-2.5 h-0.5 bg-amber align-middle mr-1.5" />70 km/h warning</span>
              <span><i className="inline-block w-2.5 h-0.5 bg-crimson align-middle mr-1.5" />100 km/h severe</span>
            </div>
          </Panel>

          <Panel eyebrow="Derived advice" title="What this means on the ground" right={<Provenance kind="derived" />}>
            {outlook ? (
              <div className="space-y-4">
                <div className={`rounded-xl border-2 p-4 ${outlook.tone === 'ok' ? 'border-emerald/40 bg-emerald/5' : outlook.tone === 'warn' ? 'border-amber/40 bg-amber/5' : 'border-crimson/40 bg-crimson/5'}`}>
                  <p className="eyebrow">Next 72 hours</p>
                  <p className="font-display text-3xl text-white">{outlook.label}</p>
                  <p className="text-[13px] text-white/70 mt-1 leading-relaxed">{outlook.advice}</p>
                </div>
                <ul className="space-y-3 text-[13px] text-white/75">
                  <li className="flex gap-2.5"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan shrink-0" />Convoy window: {maxGust !== null && maxGust < 70 ? 'open — gusts stay under 70 km/h for the next 72 h.' : nextLull ? `holds until gusts fall below 40 km/h (≈ ${new Date(nextLull.t).toISOString().slice(5, 13).replace('T', ' ')}h UTC).` : 'no calm window in the 7-day outlook.'}</li>
                  <li className="flex gap-2.5"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan shrink-0" />Heating load: {w && w.temperatureC < -25 ? 'high — boilers and heat trace working hard; watch fuel burn.' : 'moderate at current temperatures.'}</li>
                  <li className="flex gap-2.5"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan shrink-0" />Wind chill now: {w ? `${w.feelsLikeC.toFixed(0)}°C equivalent — exposed skin risk ${w.feelsLikeC < -35 ? 'within minutes' : 'in under an hour'}.` : '—'}</li>
                </ul>
                <p className="font-mono text-[10px] text-white/62">Thresholds are operational conventions for this platform, not an official meteorological warning.</p>
              </div>
            ) : (
              <Skeleton className="h-40" />
            )}
          </Panel>
        </div>

        <div className="grid xl:grid-cols-2 gap-5 mt-5">
          <Panel eyebrow="Next 7 days" title="Temperature">
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart.length ? pts : pts} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#8E8EB0" strokeDasharray="3 5" vertical={false} />
                  <ReferenceLine x={now} stroke="#080330" strokeDasharray="2 3" />
                  <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#626079' }} axisLine={false} tickLine={false} minTickGap={50} />
                  <YAxis tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#626079' }} axisLine={false} tickLine={false} width={36} unit="°" />
                  <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #8E8EB0', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 11 }} labelFormatter={(t) => new Date(Number(t)).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'} formatter={(v) => [`${Number(v).toFixed(1)} °C`, 'Temp']} />
                  <Area dataKey="temp" stroke="#1D1C93" strokeWidth={2} fill="#1D1C93" fillOpacity={0.1} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel eyebrow="On-site sensing" title="Science instruments" right={<Pill tone="warn">station telemetry · simulated feed</Pill>}>
            {assets.loading && !assets.data ? (
              <Skeleton className="h-40" />
            ) : (
              <ul className="divide-y divide-brand-border/70">
                {aws.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <span className={`w-2 h-2 rounded-full ${a.status === 'ok' ? 'bg-emerald' : a.status === 'degraded' ? 'bg-amber' : 'bg-white/30'}`} />
                    <span className="text-[13px] text-white flex-1 truncate">{a.name}</span>
                    <span className="font-mono text-[11px] text-white/65">{a.last_seen ? ago(a.last_seen) : 'never'}</span>
                    <span className="font-mono text-[11px] text-white/70 num w-16 text-right">{a.primary_value !== null ? fmtNum(a.primary_value, 1) : '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
