'use client'

import { useState } from 'react'
import { ASSETS, STATUS_COLOR } from '@/lib/twin/config'
import { effectiveStatus, useTwin } from '@/lib/twin/store'
import type { Health } from '@/lib/twin/types'
import { PanelHead } from './primitives'
import { useNow } from './now'

interface N { id: string; label: string; sub: string; x: number; y: number; w: number; st: Health; select?: string }

/** Reflects the REAL data path (see PolarTwinDualBoard/docs/architecture.md): sensors → Uno (USB serial) /
 *  Pi GPIO → Pi gateway → HTTPS ingest → backend (in-memory device store) → WebSocket → Unity twin. */
export function SystemFlow() {
  const latest = useTwin((s) => s.latest)
  const link = useTwin((s) => s.link)
  const scene = useTwin((s) => s.scene)
  const mode = useTwin((s) => s.mode)
  const select = useTwin((s) => s.select)
  const now = useNow()
  const [focus, setFocus] = useState<string | null>(null)

  const group = (pred: (c: string) => boolean): Health => {
    const sts = ASSETS.filter((a) => a.hardware && pred(a.controller)).map((a) => effectiveStatus(latest[a.id], now))
    if (!sts.length || sts.every((s) => s === 'offline')) return 'offline'
    return sts.includes('critical') ? 'critical' : sts.includes('warning') ? 'warning' : 'normal'
  }
  const isUno = (c: string) => c === 'Arduino Uno'
  const isPi = (c: string) => c.startsWith('Raspberry Pi')
  const unoS = group(isUno), piS = group(isPi)
  const demo = mode === 'demo'
  const gw: Health = demo ? 'normal' : link === 'live' ? 'normal' : link === 'stale' ? 'warning' : link === 'gateway-offline' ? 'critical' : 'offline'
  const be: Health = demo ? 'normal' : link === 'backend-offline' ? 'critical' : link === 'connecting' ? 'offline' : 'normal'
  const tw: Health = scene === 'ready' ? 'normal' : scene === 'error' ? 'critical' : 'offline'

  const nodes: N[] = [
    { id: 'uno-s', label: 'Uno sensors', sub: 'DHT · MQ-2 · Hall', x: 8, y: 6, w: 150, st: unoS, select: 'sensor-dht-01' },
    { id: 'pi-s', label: 'Pi GPIO', sub: 'HC-SR04 · IR · Servo', x: 182, y: 6, w: 150, st: piS, select: 'sensor-ultrasonic-01' },
    { id: 'uno', label: 'Arduino Uno', sub: 'USB serial JSON', x: 8, y: 64, w: 150, st: unoS },
    { id: 'gw', label: 'Raspberry Pi gateway', sub: 'merge + HTTPS POST', x: 70, y: 122, w: 200, st: gw },
    { id: 'api', label: 'Backend ingest API', sub: '/api/v1/telemetry/ingest', x: 70, y: 180, w: 200, st: be },
    { id: 'store', label: 'Device state store', sub: 'in-memory', x: 8, y: 238, w: 150, st: be },
    { id: 'rt', label: 'Realtime API', sub: 'WS /ws/digital-twin', x: 182, y: 238, w: 150, st: be },
    { id: 'twin', label: '3D Digital Twin', sub: 'Unity WebGL', x: 70, y: 296, w: 200, st: tw },
  ]
  const by = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const edges: [string, string][] = [['uno-s', 'uno'], ['uno', 'gw'], ['pi-s', 'gw'], ['gw', 'api'], ['api', 'store'], ['api', 'rt'], ['rt', 'twin'], ['store', 'rt']]
  const cls = (a: Health, b: Health) => {
    if (a === 'offline' || b === 'offline' || a === 'critical' || b === 'critical') return 'dead'
    return a === 'warning' || b === 'warning' ? 'warn' : 'live'
  }
  const f = focus ? by[focus] : null

  return (
    <div className="tw-panel">
      <PanelHead title="System flow" />
      <div className="tw-body">
        <svg className="tw-flow" viewBox="0 0 340 342" width="100%" role="img" aria-label="System data flow from sensors to the 3D twin">
          {edges.map(([a, b]) => {
            const A = by[a], B = by[b]
            if (a === 'store' && b === 'rt') return null
            const x1 = A.x + A.w / 2, y1 = A.y + 40, x2 = B.x + B.w / 2, y2 = B.y
            return <path key={a + b} className={`tw-edge ${cls(A.st, B.st)}`} d={`M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`} />
          })}
          {nodes.map((n) => (
            <g key={n.id} transform={`translate(${n.x},${n.y})`} tabIndex={0} role="button" aria-label={`${n.label}: ${n.st}`}
              onClick={() => { setFocus(n.id); if (n.select) select(n.select) }} onKeyDown={(e) => { if (e.key === 'Enter') { setFocus(n.id); if (n.select) select(n.select) } }}>
              <rect className="tw-node" width={n.w} height={40} rx={9} stroke={STATUS_COLOR[n.st]} strokeOpacity={focus === n.id ? 1 : 0.7} fill={focus === n.id ? '#162033' : '#0D111A'} />
              <circle cx={12} cy={20} r={4} fill={STATUS_COLOR[n.st]} />
              <text x={22} y={17} fontSize={10} fontWeight={700} fill="#080330">{n.label}</text>
              <text x={22} y={30} fontSize={8.5} fill="#5A5878">{n.sub}</text>
            </g>
          ))}
        </svg>
        <div className="tw-sub" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(['normal', 'warning', 'critical', 'offline'] as Health[]).map((h) => (
            <span key={h} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><span className="tw-dot" style={{ background: STATUS_COLOR[h] }} />{h === 'normal' ? 'online' : h === 'offline' ? 'unavailable' : h}</span>
          ))}
        </div>
        {f && <div className="tw-card" style={{ marginTop: 8 }}><b>{f.label}</b> · <span style={{ color: STATUS_COLOR[f.st] }}>{f.st === 'normal' ? 'online' : f.st}</span><div className="tw-sub">{f.sub}</div></div>}
      </div>
    </div>
  )
}
