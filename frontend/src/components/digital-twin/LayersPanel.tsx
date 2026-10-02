'use client'

import { useEffect } from 'react'
import { ASSETS, HEAT_VARIABLES, ROOMS, STATUS_COLOR } from '@/lib/twin/config'
import { digitalTwinBridge } from '@/lib/twin/bridge'
import { effectiveStatus, roomStatus, useTwin } from '@/lib/twin/store'
import type { Health, Reading } from '@/lib/twin/types'
import { Field, PanelHead } from './primitives'
import { useNow } from './now'

const RANK: Record<Health, number> = { normal: 0.15, offline: 0, warning: 0.6, critical: 1 }

/** 0 (cold/low) … 1 (hot/high) for a room under the chosen heat variable, or null if unknown. */
export function heatValue(latest: Record<string, Reading>, roomId: string, variable: string, now: number): number | null {
  if (variable === 'health' || variable === 'severity') {
    const s = roomStatus(latest, roomId, now)
    return s === 'offline' ? null : RANK[s]
  }
  const def = HEAT_VARIABLES.find((v) => v.id === variable)
  const a = ASSETS.find((x) => x.roomId === roomId && x.type === def?.assetType)
  const r = a && latest[a.id]
  if (!a || !r || effectiveStatus(r, now) === 'offline') return null
  // Scale between 0 and the (display) critical line; the sensor's real status still comes from the backend.
  return Math.max(0, Math.min(1, r.value / ((a.critical ?? 1) * 1.1)))
}

export function heatColor(v: number | null): string {
  if (v === null) return STATUS_COLOR.offline
  const stops = ['#3B82F6', '#22C55E', '#F59E0B', '#EF4444']
  const i = Math.min(2, Math.floor(v * 3)), f = v * 3 - i
  const p = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16))
  const A = p(stops[i]), B = p(stops[i + 1])
  return `rgb(${A.map((c, k) => Math.round(c + (B[k] - c) * f)).join(',')})`
}

export function LayersPanel() {
  const hm = useTwin((s) => s.heatmap)
  const setHeatmap = useTwin((s) => s.setHeatmap)
  const layers = useTwin((s) => s.layers)
  const setLayer = useTwin((s) => s.setLayer)
  const latest = useTwin((s) => s.latest)
  const now = useNow()
  const supported = digitalTwinBridge.supports('setHeatmapMode')

  const roomVals = Object.fromEntries(ROOMS.map((r) => [r.id, heatValue(latest, r.id, hm.variable, now)]))
  useEffect(() => { digitalTwinBridge.setHeatmap(hm.on, hm.variable, hm.opacity) }, [hm.on, hm.variable, hm.opacity])
  const key = JSON.stringify(roomVals)
  useEffect(() => {
    if (hm.on) digitalTwinBridge.setHeatmapValues(Object.fromEntries(Object.entries(JSON.parse(key) as Record<string, number | null>).filter(([, v]) => v !== null) as [string, number][]))
  }, [key, hm.on])

  return (
    <div className="tw-panel grow">
      <PanelHead title="Layers & heat map" />
      <div className="tw-body tw-scroll">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span className="tw-k" style={{ flex: 1 }}>Heat map</span>
          <button className={`tw-btn ${hm.on ? 'on' : ''}`} aria-pressed={hm.on} onClick={() => setHeatmap({ on: !hm.on })}>{hm.on ? 'ON' : 'OFF'}</button>
        </div>
        <Field label="Variable">
          <select className="tw-sel" value={hm.variable} onChange={(e) => setHeatmap({ variable: e.target.value as typeof hm.variable })}>
            {HEAT_VARIABLES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </Field>
        <Field label={`Opacity · ${hm.opacity}%`}>
          <input className="tw-range" type="range" min={0} max={100} value={hm.opacity} onChange={(e) => setHeatmap({ opacity: Number(e.target.value) })} />
        </Field>
        <div className="tw-legend" />
        <div className="tw-sub" style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0 10px' }}><span>LOW</span><span>NORMAL</span><span>HIGH</span></div>
        {hm.on && !supported && (
          <div className="tw-banner info" style={{ marginBottom: 8 }}>The loaded 3D build has no WebBridge, so the overlay cannot be drawn in the scene yet. Room values below are live.</div>
        )}
        <div className="tw-k" style={{ marginBottom: 4 }}>Rooms</div>
        {ROOMS.map((r) => {
          const v = roomVals[r.id]
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: heatColor(v), opacity: hm.on ? hm.opacity / 100 * 0.6 + 0.4 : 1 }} />
              <span style={{ flex: 1 }}>{r.short} · {r.name}</span>
              <span className="tw-mono tw-sub">{v === null ? 'n/a' : `${Math.round(v * 100)}%`}</span>
            </div>
          )
        })}
        <div className="tw-k" style={{ margin: '12px 0 4px' }}>Scene layers</div>
        {Object.keys(layers).map((k) => (
          <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', textTransform: 'capitalize' }}>
            <input type="checkbox" checked={layers[k]} onChange={(e) => { setLayer(k, e.target.checked); digitalTwinBridge.toggleLayer(k, e.target.checked) }} style={{ accentColor: '#84CC16' }} /> {k}
          </label>
        ))}
      </div>
    </div>
  )
}
