// DEMO data source + scenario injector. Active only in DEMO mode; the store
// refuses to mix it with live telemetry. This is a SCENARIO INJECTOR (ramps a
// variable from baseline toward a stressed value), not a physics simulation.
import { ASSET_BY_ID, ASSETS } from './config'
import type { Health, Reading } from './types'

export type SimVariable = 'temperature' | 'humidity' | 'gas' | 'proximity' | 'occupancy'
export type SimStatus = 'stopped' | 'running' | 'paused'

export interface SimConfig { variable: SimVariable; roomId: string | 'all' }
export const SIM_RAMP_MS = 60_000

const sim = { status: 'stopped' as SimStatus, cfg: { variable: 'temperature', roomId: 'all' } as SimConfig, startedAt: 0, elapsed: 0 }

export const simControls = {
  get status() { return sim.status },
  get cfg() { return sim.cfg },
  progress(now = Date.now()) {
    const e = sim.status === 'running' ? sim.elapsed + (now - sim.startedAt) : sim.elapsed
    return Math.min(1, e / SIM_RAMP_MS)
  },
  start(cfg: SimConfig) { sim.cfg = cfg; sim.elapsed = 0; sim.startedAt = Date.now(); sim.status = 'running' },
  pause() { if (sim.status === 'running') { sim.elapsed += Date.now() - sim.startedAt; sim.status = 'paused' } },
  resume() { if (sim.status === 'paused') { sim.startedAt = Date.now(); sim.status = 'running' } },
  stop() { sim.status = 'stopped'; sim.elapsed = 0 },
  reset() { sim.elapsed = 0; sim.startedAt = Date.now() },
}

function status(id: string, v: number): Health {
  const a = ASSET_BY_ID[id]
  if (a.boolean) return id === 'sensor-ir-01' || id === 'buzzer-01' ? (v ? 'warning' : 'normal') : 'normal'
  if (a.warning === undefined || a.critical === undefined) return 'normal'
  if (a.inverse) return v <= a.critical ? 'critical' : v <= a.warning ? 'warning' : 'normal'
  return v >= a.critical ? 'critical' : v >= a.warning ? 'warning' : 'normal'
}

export function demoFrame(tMs: number): Reading[] {
  const t = tMs / 1000
  const p = sim.status === 'stopped' ? 0 : simControls.progress(tMs)
  const hit = (id: string) => sim.cfg.roomId === 'all' || ASSET_BY_ID[id].roomId === sim.cfg.roomId
  const v = sim.cfg.variable
  const vals: Record<string, number> = {
    'sensor-dht-01': 18.6 + 1.2 * Math.sin(t / 40) + 0.2 * Math.sin(t) + (v === 'temperature' && hit('sensor-dht-01') ? 14 * p : 0),
    'sensor-humidity-01': 47 + 4 * Math.sin(t / 55) + (v === 'humidity' && hit('sensor-humidity-01') ? 30 * p : 0),
    'sensor-mq2-01': 230 + 25 * Math.sin(t / 9) + (v === 'gas' && hit('sensor-mq2-01') ? 520 * p : 0),
    'sensor-ultrasonic-01': 90 + 40 * Math.sin(t / 13) - (v === 'proximity' && hit('sensor-ultrasonic-01') ? 75 * p : 0),
    'sensor-ir-01': v === 'occupancy' && hit('sensor-ir-01') && p > 0.3 ? 1 : Math.sin(t / 17) > 0.8 ? 1 : 0,
    'servo-01': 90 + 60 * Math.sin(t / 8),
    'sensor-door-01': Math.sin(t / 29) > 0.2 ? 1 : 0,
  }
  vals['occupancy-indicator-01'] = vals['sensor-ir-01']
  vals['buzzer-01'] = vals['sensor-mq2-01'] >= 700 ? 1 : 0
  return ASSETS.map((a) => {
    const val = Math.round(vals[a.id] * 10) / 10
    return { assetId: a.id, key: a.type, value: val, display: '', unit: a.unit, timestamp: tMs, receivedAt: tMs, quality: 'good', status: status(a.id, val) }
  })
}
