// src/lib/performance/assetPerformance.ts
//
// Task-Manager-style performance model for the Remote Control page.
//
// IMPORTANT — what this is: a small physical-ish simulator, NOT live sensor
// data. Each asset's metrics follow first-order dynamics toward a target that
// is derived from its commanded state (status / setpoint / mode) and from the
// rest of the station (e.g. generators share the station load, so stopping one
// pushes the other toward overload; a brown-out slows everything that draws
// power). That is what lets the page show "what did my action do to this
// asset's performance" even in mock mode. When a backend streams real
// readings, replace `stepAsset` inputs with them — the charts and the impact
// log work on whatever numbers the history buffer holds.
import type { RemoteAsset } from '@/services/commands.service'

export interface MetricDef {
  key: string
  label: string
  unit: string
  color: string
  /** Fixed axis maximum (omit for auto). */
  max?: number
  decimals?: number
  /** Higher is better? Used to colour impact deltas. null = neutral. */
  goodWhen?: 'up' | 'down' | null
}

const BLUE = '#1D1C93', GREEN = '#0F8A6A', AMBER = '#D4820A', RED = '#C23B3B', VIOLET = '#A04FB8'

export const METRICS: Record<string, MetricDef[]> = {
  power: [
    { key: 'load', label: 'Electrical load', unit: 'kW', color: BLUE, decimals: 1, goodWhen: null },
    { key: 'fuel', label: 'Fuel flow', unit: 'L/h', color: AMBER, decimals: 1, goodWhen: 'down' },
    { key: 'temp', label: 'Coolant temp', unit: '°C', color: RED, max: 120, decimals: 0, goodWhen: 'down' },
    { key: 'eff', label: 'Efficiency', unit: '%', color: GREEN, max: 40, decimals: 1, goodWhen: 'up' },
  ],
  heating: [
    { key: 'temp', label: 'Space temperature', unit: '°C', color: AMBER, decimals: 1, goodWhen: null },
    { key: 'output', label: 'Heat output', unit: 'kW', color: RED, decimals: 1, goodWhen: null },
    { key: 'fuel', label: 'Fuel flow', unit: 'L/h', color: BLUE, decimals: 1, goodWhen: 'down' },
    { key: 'eff', label: 'Efficiency', unit: '%', color: GREEN, max: 100, decimals: 0, goodWhen: 'up' },
  ],
  water: [
    { key: 'flow', label: 'Flow', unit: 'L/min', color: BLUE, decimals: 0, goodWhen: null },
    { key: 'power', label: 'Power draw', unit: 'kW', color: AMBER, decimals: 1, goodWhen: 'down' },
    { key: 'tank', label: 'Product tank', unit: '%', color: GREEN, max: 100, decimals: 0, goodWhen: 'up' },
    { key: 'tds', label: 'Dissolved solids', unit: 'ppm', color: VIOLET, decimals: 0, goodWhen: 'down' },
  ],
  waste: [
    { key: 'flow', label: 'Throughput', unit: 'L/min', color: BLUE, decimals: 1, goodWhen: null },
    { key: 'power', label: 'Power draw', unit: 'kW', color: AMBER, decimals: 1, goodWhen: 'down' },
    { key: 'tank', label: 'Holding tank', unit: '%', color: RED, max: 100, decimals: 0, goodWhen: 'down' },
    { key: 'eff', label: 'Treatment efficiency', unit: '%', color: GREEN, max: 100, decimals: 0, goodWhen: 'up' },
  ],
  comms: [
    { key: 'signal', label: 'Signal level', unit: 'dBm', color: BLUE, decimals: 0, goodWhen: 'up' },
    { key: 'rate', label: 'Throughput', unit: 'Mbps', color: GREEN, decimals: 1, goodWhen: 'up' },
    { key: 'latency', label: 'Latency', unit: 'ms', color: AMBER, decimals: 0, goodWhen: 'down' },
    { key: 'margin', label: 'Link margin', unit: 'dB', color: VIOLET, decimals: 1, goodWhen: 'up' },
  ],
  instrument: [
    { key: 'duty', label: 'Duty cycle', unit: '%', color: BLUE, max: 100, decimals: 0, goodWhen: null },
    { key: 'rate', label: 'Data rate', unit: 'kB/s', color: GREEN, decimals: 0, goodWhen: 'up' },
    { key: 'power', label: 'Power draw', unit: 'W', color: AMBER, decimals: 0, goodWhen: 'down' },
    { key: 'temp', label: 'Sensor temp', unit: '°C', color: RED, decimals: 1, goodWhen: null },
  ],
  vehicle: [
    { key: 'temp', label: 'Coolant temp', unit: '°C', color: RED, max: 110, decimals: 0, goodWhen: null },
    { key: 'rpm', label: 'Engine speed', unit: 'rpm', color: BLUE, decimals: 0, goodWhen: null },
    { key: 'fuel', label: 'Fuel flow', unit: 'L/h', color: AMBER, decimals: 1, goodWhen: 'down' },
    { key: 'load', label: 'Engine load', unit: '%', color: GREEN, max: 100, decimals: 0, goodWhen: null },
  ],
}
const GENERIC: MetricDef[] = [
  { key: 'load', label: 'Activity', unit: '%', color: BLUE, max: 100, decimals: 0, goodWhen: null },
  { key: 'power', label: 'Power draw', unit: 'W', color: AMBER, decimals: 0, goodWhen: 'down' },
  { key: 'temp', label: 'Temperature', unit: '°C', color: RED, decimals: 1, goodWhen: null },
  { key: 'eff', label: 'Health', unit: '%', color: GREEN, max: 100, decimals: 0, goodWhen: 'up' },
]

export function metricsFor(category: string): MetricDef[] {
  return METRICS[category] ?? GENERIC
}

export type Sample = { t: number } & Record<string, number>

export const OUTDOOR_C = -14
export const HISTORY = 120 // seconds kept per asset

/** "On" = doing its job. Mode changes overwrite status in the mock engine, so anything but stopped/standby counts. */
export function isOn(a: RemoteAsset): boolean {
  return a.status !== 'stopped' && a.status !== 'standby'
}

export interface StationContext {
  demandKw: number
  /** Share of the station electrical demand that is actually being served (0–1). */
  supply: number
  ratedKw: Map<string, number>
  runningGens: number
}

const gensOf = (assets: RemoteAsset[]) => assets.filter((a) => a.category === 'power')

/** Baselines remember each asset's nominal reading the first time we see it running. */
export function buildContext(assets: RemoteAsset[], baseline: Map<string, number>): StationContext {
  const gens = gensOf(assets)
  const ratedKw = new Map<string, number>()
  let demand = 0
  for (const g of gens) {
    const base = baseline.get(g.id) ?? 45
    ratedKw.set(g.id, base * 1.35)
    demand += base
  }
  const running = gens.filter(isOn)
  const capacity = running.reduce((s, g) => s + (ratedKw.get(g.id) ?? 0), 0)
  return { demandKw: demand, supply: demand > 0 ? Math.min(1, capacity / demand) : 1, ratedKw, runningGens: running.length }
}

function noise(amp: number): number {
  return (Math.random() - 0.5) * 2 * amp
}

/** Where each metric is heading, given the asset's state and the station. */
export function targetsFor(a: RemoteAsset, ctx: StationContext, baseline: number): Record<string, number> {
  const on = isOn(a)
  const sp = a.primaryValue ?? baseline
  switch (a.category) {
    case 'power': {
      const share = on ? ctx.demandKw / Math.max(1, ctx.runningGens) : 0
      const rated = ctx.ratedKw.get(a.id) ?? 60
      const load = on ? Math.min(share, rated * 1.12) : 0
      const lf = rated ? load / rated : 0
      return {
        load,
        fuel: on ? 1.6 + load * 0.27 : 0,
        temp: on ? 38 + 62 * lf + (lf > 1 ? 18 * (lf - 1) * 5 : 0) : 22,
        eff: on ? Math.max(8, 34 - 70 * Math.pow(lf - 0.75, 2)) : 0,
      }
    }
    case 'heating': {
      const reach = on ? 0.35 + 0.65 * ctx.supply : 0
      const target = on ? OUTDOOR_C + (sp - OUTDOOR_C) * (0.55 + 0.45 * ctx.supply) : OUTDOOR_C + 6
      const out = on ? Math.max(0, (sp - OUTDOOR_C) * 1.55 * reach) : 0
      return { temp: target, output: out, fuel: out / 9.6, eff: on ? 90 - 9 * Math.max(0, sp - 20) - (1 - ctx.supply) * 18 : 0 }
    }
    case 'water': {
      const flow = on ? sp * (0.5 + 0.5 * ctx.supply) : 0
      return { flow, power: on ? 0.8 + flow * 0.048 : 0, tank: on ? 82 : 35, tds: on ? 118 + (flow / Math.max(1, baseline) - 1) * 90 : 260 }
    }
    case 'waste': {
      const standby = a.status === 'standby'
      const anaerobic = a.status === 'anaerobic-cycle'
      const flow = on ? sp * (0.5 + 0.5 * ctx.supply) : 0
      return { flow, power: on ? 0.6 + flow * 0.16 : standby ? 0.3 : 0, tank: on ? 38 : 88, eff: on ? (anaerobic ? 78 : 92) : standby ? 20 : 0 }
    }
    case 'comms': {
      const manual = a.status === 'manual-point'
      const sig = on ? (a.primaryValue ?? -62) - (manual ? 5 : 0) - (1 - ctx.supply) * 4 : -110
      return { signal: sig, rate: on ? Math.max(0.5, 20 + (sig + 68) * 1.4) : 0, latency: on ? 580 - (sig + 68) * 4 : 0, margin: on ? Math.max(0, (sig + 95) * 0.45) : 0 }
    }
    case 'instrument': {
      return { duty: on ? 86 : 0, rate: on ? 420 : 0, power: on ? 260 : 8, temp: on ? 21 : OUTDOOR_C + 8 }
    }
    case 'vehicle': {
      return { temp: on ? 84 : OUTDOOR_C + 4, rpm: on ? 1850 : 0, fuel: on ? 12 : 0, load: on ? 52 : 0 }
    }
    default:
      return { load: on ? 60 : 0, power: on ? 120 : 0, temp: on ? 24 : OUTDOOR_C + 6, eff: on ? 95 : 0 }
  }
}

/** Time constant (s) per metric: heat is slow, electrical quantities fast. */
const TAU: Record<string, number> = {
  temp: 28, load: 5, fuel: 5, output: 9, eff: 6, flow: 6, power: 4, tank: 40, tds: 12,
  signal: 4, rate: 4, latency: 4, margin: 4, duty: 4, rpm: 5,
}
const NOISE: Record<string, number> = {
  load: 0.012, fuel: 0.02, temp: 0.004, output: 0.015, eff: 0.01, flow: 0.012, power: 0.02, tank: 0.001,
  tds: 0.02, signal: 0.004, rate: 0.04, latency: 0.03, margin: 0.02, duty: 0.015, rpm: 0.01,
}

export function stepAsset(prev: Record<string, number>, targets: Record<string, number>, dtSec = 1): Record<string, number> {
  const next: Record<string, number> = {}
  for (const k of Object.keys(targets)) {
    const cur = prev[k] ?? targets[k]
    const tau = TAU[k] ?? 6
    const alpha = 1 - Math.exp(-dtSec / tau)
    const scale = Math.max(1, Math.abs(targets[k]))
    next[k] = cur + (targets[k] - cur) * alpha + noise((NOISE[k] ?? 0.01) * scale)
  }
  if ('tank' in next) next.tank = Math.max(0, Math.min(100, next.tank))
  if ('eff' in next && next.eff < 0) next.eff = 0
  return next
}

export function mean(samples: Sample[], key: string): number {
  if (!samples.length) return 0
  return samples.reduce((s, x) => s + (x[key] ?? 0), 0) / samples.length
}

export interface ImpactRow {
  assetId: string
  assetName: string
  metricKey: string
  label: string
  unit: string
  before: number
  after: number | null
  decimals: number
  goodWhen: 'up' | 'down' | null | undefined
  /** true for the commanded asset, false for another asset that moved as a side-effect. */
  primary: boolean
}

export interface ImpactEvent {
  id: string
  assetId: string
  assetName: string
  action: string
  detail: string
  t0: number
  settled: boolean
  rows: ImpactRow[]
  /** Pre-command averages of every asset's metrics, keyed assetId → metric. */
  snap: Record<string, Record<string, number>>
}

export const DEFAULT_NOMINAL: Record<string, number> = { power: 45, heating: 21, water: 180, waste: 12, comms: -62, instrument: 1, vehicle: 45 }

export interface PredictedChange {
  assetId: string
  assetName: string
  label: string
  unit: string
  from: number
  to: number
  decimals: number
  goodWhen: 'up' | 'down' | null | undefined
  primary: boolean
}

/** The state an asset would be in if `action` were applied. */
export function hypothetical(a: RemoteAsset, action: string, payload: Record<string, unknown>, baseline: number | undefined): RemoteAsset {
  if (action === 'start') return { ...a, status: 'running', primaryValue: a.primaryValue && a.primaryValue > 0 ? a.primaryValue : baseline ?? DEFAULT_NOMINAL[a.category] ?? 1 }
  if (action === 'stop') return { ...a, status: 'stopped', primaryValue: 0 }
  if (action === 'setpoint') {
    const v = Object.values(payload).find((x) => typeof x === 'number') as number | undefined
    return { ...a, primaryValue: v ?? a.primaryValue }
  }
  if (action === 'mode' && typeof payload.mode === 'string') return { ...a, status: payload.mode }
  return a
}

/** Steady-state comparison "now" vs "after the command" — what the confirm dialog shows. */
export function predictChanges(
  assets: RemoteAsset[], target: RemoteAsset, action: string, payload: Record<string, unknown>, baseline: Map<string, number>,
): PredictedChange[] {
  const after = assets.map((a) => (a.id === target.id ? hypothetical(a, action, payload, baseline.get(a.id)) : a))
  const ctxNow = buildContext(assets, baseline)
  const ctxAfter = buildContext(after, baseline)
  const out: PredictedChange[] = []
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i]
    const primary = a.id === target.id
    const tNow = targetsFor(a, ctxNow, baseline.get(a.id) ?? Math.abs(a.primaryValue ?? 1))
    const tAft = targetsFor(after[i], ctxAfter, baseline.get(a.id) ?? Math.abs(after[i].primaryValue ?? 1))
    const defs = metricsFor(a.category)
    for (const m of primary ? defs : defs.slice(0, 1)) {
      const from = tNow[m.key] ?? 0, to = tAft[m.key] ?? 0
      if (Math.abs(to - from) / Math.max(1, Math.abs(from), Math.abs(to)) < 0.06) continue
      out.push({ assetId: a.id, assetName: a.name, label: m.label, unit: m.unit, from, to, decimals: m.decimals ?? 1, goodWhen: m.goodWhen, primary })
    }
  }
  return out
}
