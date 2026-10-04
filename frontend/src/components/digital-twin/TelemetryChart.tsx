'use client'

import { memo, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ASSET_BY_ID, WINDOWS } from '@/lib/twin/config'
import { getHistory, useTwin } from '@/lib/twin/store'
import { useNow } from './now'

const MAX_POINTS = 120

function windowed(assetId: string, windowId: string, now: number) {
  const buf = getHistory(assetId)
  if (windowId === 'live') return buf.slice(-40)
  const ms = WINDOWS.find((w) => w.id === windowId)?.ms ?? 60_000
  const out = buf.filter((s) => s.t >= now - ms)
  if (out.length <= MAX_POINTS) return out
  const step = out.length / MAX_POINTS
  return Array.from({ length: MAX_POINTS }, (_, i) => out[Math.floor(i * step)])
}

export const TelemetryChart = memo(function TelemetryChart({ assetId, height = 130 }: { assetId: string; height?: number }) {
  useTwin((s) => s.tick)
  const now = useNow()
  const [win, setWin] = useState('live')
  const a = ASSET_BY_ID[assetId]
  const data = windowed(assetId, win, now)
  const stats = useMemo(() => {
    if (!data.length) return null
    let min = Infinity, max = -Infinity, sum = 0
    for (const d of data) { min = Math.min(min, d.v); max = Math.max(max, d.v); sum += d.v }
    return { min, max, avg: sum / data.length, cur: data[data.length - 1].v }
  }, [data])
  const full = getHistory(assetId)
  const coverMs = full.length > 1 ? full[full.length - 1].t - full[0].t : 0
  const wantMs = WINDOWS.find((w) => w.id === win)?.ms ?? 0
  const f = (n: number) => (a.boolean ? String(Math.round(n)) : n.toFixed(1))

  return (
    <div>
      <div style={{ display: 'flex', gap: 3, marginBottom: 6, flexWrap: 'wrap' }}>
        {WINDOWS.map((w) => (
          <button key={w.id} className={`tw-btn ${win === w.id ? 'on' : ''}`} style={{ height: 22, padding: '0 7px' }} onClick={() => setWin(w.id)}>{w.label}</button>
        ))}
      </div>
      {data.length < 2 ? (
        <div className="tw-sub" style={{ height, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          {full.length ? 'Collecting samples…' : 'No telemetry received yet'}
        </div>
      ) : (
        <div style={{ height }} role="img" aria-label={`${a.name} trend`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="rgba(8,3,48,.1)" vertical={false} />
              <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => new Date(t).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })} tick={{ fontSize: 9, fill: '#5A5878' }} stroke="rgba(8,3,48,.15)" minTickGap={34} />
              <YAxis tick={{ fontSize: 9, fill: '#5A5878' }} stroke="rgba(8,3,48,.15)" domain={a.boolean ? [0, 1] : ['auto', 'auto']} ticks={a.boolean ? [0, 1] : undefined} width={42} />
              {a.warning !== undefined && !a.boolean && <ReferenceLine y={a.warning} stroke="#F59E0B" strokeDasharray="3 3" strokeOpacity={0.6} />}
              {a.critical !== undefined && !a.boolean && <ReferenceLine y={a.critical} stroke="#EF4444" strokeDasharray="3 3" strokeOpacity={0.6} />}
              <Tooltip
                contentStyle={{ background: '#080330', border: '1px solid rgba(8,3,48,.2)', borderRadius: 8, fontSize: 10 }}
                labelFormatter={(t) => new Date(Number(t)).toLocaleTimeString()}
                formatter={(v) => [`${v} ${a.unit}`, a.name]}
              />
              <Line type={a.boolean ? 'stepAfter' : 'monotone'} dataKey="v" stroke="#1D1C93" strokeWidth={1.8} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {stats && (
        <div className="tw-grid2" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginTop: 6 }}>
          {([['CUR', stats.cur], ['MIN', stats.min], ['MAX', stats.max], ['AVG', stats.avg]] as const).map(([k, v]) => (
            <div key={k}><div className="tw-k">{k}</div><div className="tw-mono" style={{ fontSize: 12 }}>{f(v)}</div></div>
          ))}
        </div>
      )}
      {win !== 'live' && wantMs > coverMs + 5000 && (
        <div className="tw-sub" style={{ marginTop: 6 }}>
          Buffer holds {Math.max(1, Math.round(coverMs / 60000))} min since this page loaded; the backend does not keep a history API for these devices yet.
        </div>
      )}
    </div>
  )
})
