// src/lib/forecast/engine.ts
//
// Browser-side inference for the models trained by backend/ml/train_forecast.py
// (public/models/forecast-model.json). Pure functions, no React, no `@/` imports
// — so it can also be exercised from plain Node (see the parity check noted in
// backend/ml/README.md).
//
// The models were trained on SYNTHETIC data. Every number this module returns is
// a projection from that model, never a measurement.

export type StationKey = 'maitri' | 'bharati'
export type ConsumptionTarget = 'fuel_l' | 'power_kwh' | 'food_kg' | 'water_l'

interface Tree { f: number[]; t: number[]; l: number[]; r: number[]; v: number[] }
type RegressionModel =
  | { type: 'gbm'; init: number; lr: number; trees: Tree[] }
  | { type: 'linear'; intercept: number; coef: number[] }

interface ModelMetrics { mae: number; mape_pct: number; r2: number }

export interface ConsumptionModelInfo {
  model: RegressionModel
  metrics: { gbm: ModelMetrics; ridge: ModelMetrics; seasonal_naive: ModelMetrics }
  exported: 'gbm' | 'ridge'
  interval: { q10: number; q90: number; nominal: number; test_coverage: number }
  importance: Record<string, number>
}

export interface MachineHistory {
  station: StationKey
  category: string
  category_code: number
  dates: string[]
  health: number[]
  load_pct: number[]
  temp_c: number[]
  vibration_mm_s: number[]
  fuel_lph: number[]
  since: number[]
  maintenance: number[]
}

export interface StationHistory {
  dates: string[]
  fuel_l: number[]; power_kwh: number[]; food_kg: number[]; water_l: number[]
  fuel_l_pred: number[]; power_kwh_pred: number[]; food_kg_pred: number[]; water_l_pred: number[]
  temp_c: number[]; wind_kph: number[]; headcount: number[]
  fuel_stock_l: number[]; food_stock_kg: number[]
}

export interface ForecastModel {
  meta: {
    synthetic: boolean
    trained_on: string
    algorithm: string
    data_range: [string, string]
    train_end: string
    calibration_end: string
    n_logistics_rows: number
    n_asset_rows: number
    validated: string
  }
  features: string[]
  consumption: Record<ConsumptionTarget, ConsumptionModelInfo>
  climatology: Record<StationKey, Record<'temp_c' | 'wind_kph' | 'blizzard' | 'science_activity' | 'vehicle_hours' | 'headcount', number[]>>
  health: {
    model: RegressionModel
    metrics: { gbm: ModelMetrics; persistence: ModelMetrics }
    interval_by_h: { q10: number[]; q90: number[]; nominal: number; test_coverage: number }
    importance: Record<string, number>
    features: string[]
    horizon: number
    n_train_rows: number
  }
  history: Record<StationKey, StationHistory>
  machines: Record<string, MachineHistory>
  parity: Array<{ x: number[] } & Record<ConsumptionTarget, number>>
}

// ─── Model evaluation ───────────────────────────────────────────────────────

export function evaluate(model: RegressionModel, x: number[]): number {
  if (model.type === 'linear') {
    let s = model.intercept
    for (let i = 0; i < model.coef.length; i++) s += model.coef[i] * x[i]
    return s
  }
  let total = model.init
  for (const tree of model.trees) {
    let i = 0
    while (tree.f[i] >= 0) i = x[tree.f[i]] <= tree.t[i] ? tree.l[i] : tree.r[i]
    total += model.lr * tree.v[i]
  }
  return total
}

// ─── Consumption projection ─────────────────────────────────────────────────

export interface Drivers {
  /** Crew on station; defaults to the seasonal climatology. */
  headcount?: number
  /** Added to the climatological air temperature (°C). Negative = colder. */
  tempOffset?: number
  /** Multiplies the climatological wind speed. */
  windScale?: number
  /** Scales every consumption forecast (e.g. calibration against manual logs). */
  calibration?: number
}

export interface Band { mid: number; lo: number; hi: number }

export interface DayForecast {
  day: number
  date: string
  temp_c: number
  wind_kph: number
  headcount: number
  fuel_l: Band
  power_kwh: Band
  food_kg: Band
  water_l: Band
}

const DAY_MS = 86_400_000

export function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / DAY_MS)
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS)
}

const TARGETS: ConsumptionTarget[] = ['fuel_l', 'power_kwh', 'food_kg', 'water_l']

export function projectConsumption(
  model: ForecastModel,
  station: StationKey,
  start: Date,
  days: number,
  drivers: Drivers = {},
): DayForecast[] {
  const clim = model.climatology[station]
  const stationCode = station === 'maitri' ? 0 : 1
  const cal = drivers.calibration ?? 1
  const out: DayForecast[] = []
  for (let k = 0; k < days; k++) {
    const date = addDays(start, k)
    const doy = Math.min(dayOfYear(date), 365)
    const i = doy - 1
    const temp = clim.temp_c[i] + (drivers.tempOffset ?? 0)
    const wind = clim.wind_kph[i] * (drivers.windScale ?? 1)
    const headcount = drivers.headcount ?? Math.round(clim.headcount[i])
    const x = [
      stationCode,
      Math.sin((2 * Math.PI * doy) / 365.25),
      Math.cos((2 * Math.PI * doy) / 365.25),
      headcount,
      temp,
      wind,
      clim.blizzard[i],
      clim.science_activity[i],
      clim.vehicle_hours[i],
    ]
    const row: Partial<DayForecast> = { day: k, date: isoDate(date), temp_c: temp, wind_kph: wind, headcount }
    for (const t of TARGETS) {
      const info = model.consumption[t]
      const mid = Math.max(0, evaluate(info.model, x)) * cal
      row[t] = { mid, lo: mid * (1 + info.interval.q10), hi: mid * (1 + info.interval.q90) }
    }
    out.push(row as DayForecast)
  }
  return out
}

// ─── Run-out ("how many days will it last") ─────────────────────────────────

export interface Delivery { day: number; amount: number }

export interface RunoutPoint { day: number; date: string; mid: number; lo: number; hi: number }

export interface Runout {
  /** Days until the stock reaches zero, central estimate. null → lasts past the horizon. */
  daysMid: number | null
  /** Earliest plausible run-out (consumption at the upper end of the interval). */
  daysEarliest: number | null
  /** Latest plausible run-out (consumption at the lower end of the interval). */
  daysLatest: number | null
  runoutDate: string | null
  /** Days until the stock hits `reserve` (e.g. the reorder threshold). */
  daysToReserve: number | null
  horizon: number
  trajectory: RunoutPoint[]
  avgDailyBurn: number
}

/**
 * Walks `stock` forward through the projected daily consumption (+ scheduled
 * deliveries). The band is deliberately conservative: it assumes the high (or
 * low) end of the daily 80 % interval applies on EVERY day, i.e. perfectly
 * correlated errors, which is wider than the true uncertainty of a cumulative
 * total — so the "earliest" run-out is a pessimistic bound, not a likelihood.
 */
export function runout(
  stock: number,
  forecast: DayForecast[],
  key: 'fuel_l' | 'food_kg' | 'water_l',
  opts: { deliveries?: Delivery[]; reserve?: number } = {},
): Runout {
  const deliveries = opts.deliveries ?? []
  let mid = stock, lo = stock, hi = stock
  const found: { mid: number | null; lo: number | null; hi: number | null; res: number | null } = { mid: null, lo: null, hi: null, res: null }
  const trajectory: RunoutPoint[] = [{ day: 0, date: forecast[0]?.date ?? '', mid, lo, hi }]
  let burnSum = 0
  for (const f of forecast) {
    const add = deliveries.filter((d) => d.day === f.day).reduce((s, d) => s + d.amount, 0)
    mid += add - f[key].mid
    lo += add - f[key].hi // high burn → lowest stock
    hi += add - f[key].lo
    burnSum += f[key].mid
    const day = f.day + 1
    trajectory.push({ day, date: f.date, mid: Math.max(0, mid), lo: Math.max(0, lo), hi: Math.max(0, hi) })
    if (found.mid === null && mid <= 0) found.mid = day
    if (found.lo === null && lo <= 0) found.lo = day
    if (found.hi === null && hi <= 0) found.hi = day
    if (found.res === null && opts.reserve != null && mid <= opts.reserve) found.res = day
  }
  const runDate = found.mid !== null ? forecast[Math.min(found.mid, forecast.length) - 1]?.date ?? null : null
  return {
    daysMid: found.mid,
    daysEarliest: found.lo,
    daysLatest: found.hi,
    runoutDate: runDate,
    daysToReserve: found.res,
    horizon: forecast.length,
    trajectory,
    avgDailyBurn: forecast.length ? burnSum / forecast.length : 0,
  }
}

// ─── Machine health ─────────────────────────────────────────────────────────

export interface HealthPoint { h: number; date: string; mid: number; lo: number; hi: number }

export interface HealthForecast {
  machineId: string
  current: number
  points: HealthPoint[]
  /** First horizon (days) at which the central forecast drops under the service threshold. */
  daysToService: number | null
  /** Same, but linearly extrapolated from the last week of the forecast when it falls beyond the model horizon (flagged by `extrapolated`). */
  daysToServiceEst: number | null
  extrapolated: boolean
  /** Probability (0-1) that health is below `failureThreshold` at the end of the horizon. */
  failureRisk: number
  slopePerDay: number
}

export const SERVICE_THRESHOLD = 60
export const FAILURE_THRESHOLD = 50

function mean(a: number[]): number {
  return a.reduce((s, v) => s + v, 0) / (a.length || 1)
}

function normCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}

export function forecastHealth(
  model: ForecastModel,
  machineId: string,
  opts: { horizon?: number; startDate?: Date; loadScale?: number } = {},
): HealthForecast | null {
  const m = model.machines[machineId]
  if (!m) return null
  const n = m.health.length
  const horizon = Math.min(opts.horizon ?? model.health.horizon, model.health.horizon)
  const cur = m.health[n - 1]
  const slope7 = (cur - m.health[n - 8]) / 7
  const vib7 = mean(m.vibration_mm_s.slice(-7))
  const temp7 = mean(m.temp_c.slice(-7))
  const load7 = mean(m.load_pct.slice(-7)) * (opts.loadScale ?? 1)
  const since = m.since[n - 1]
  const start = opts.startDate ?? new Date()
  const points: HealthPoint[] = []
  let daysToService: number | null = null
  let lastSigma = 1
  for (let h = 1; h <= horizon; h++) {
    const delta = evaluate(model.health.model, [cur, slope7, vib7, temp7, load7, since, m.category_code, h])
    const mid = Math.max(0, Math.min(100, cur + delta))
    const lo = Math.max(0, cur + delta + model.health.interval_by_h.q10[h - 1])
    const hi = Math.min(100, cur + delta + model.health.interval_by_h.q90[h - 1])
    points.push({ h, date: isoDate(addDays(start, h)), mid, lo, hi })
    if (daysToService === null && mid < SERVICE_THRESHOLD) daysToService = h
    lastSigma = Math.max(0.3, (model.health.interval_by_h.q90[h - 1] - model.health.interval_by_h.q10[h - 1]) / 2.563)
  }
  const end = points[points.length - 1]
  let daysToServiceEst = daysToService
  let extrapolated = false
  if (daysToService === null && points.length >= 8) {
    const perDay = (points[points.length - 8].mid - end.mid) / 7
    if (perDay > 0.005) {
      daysToServiceEst = Math.round(points.length + (end.mid - SERVICE_THRESHOLD) / perDay)
      extrapolated = true
    }
  }
  const failureRisk = normCdf((FAILURE_THRESHOLD - end.mid) / lastSigma)
  return { machineId, current: cur, points, daysToService, daysToServiceEst, extrapolated, failureRisk, slopePerDay: slope7 }
}

// ─── Convenience ────────────────────────────────────────────────────────────

export const TARGET_LABEL: Record<ConsumptionTarget, { label: string; unit: string }> = {
  fuel_l: { label: 'Fuel burn', unit: 'L/day' },
  power_kwh: { label: 'Electrical energy', unit: 'kWh/day' },
  food_kg: { label: 'Food', unit: 'kg/day' },
  water_l: { label: 'Water', unit: 'L/day' },
}

export const FEATURE_LABEL: Record<string, string> = {
  station_code: 'Station',
  station: 'Station',
  doy_sin: 'Season (sin)',
  doy_cos: 'Season (cos)',
  headcount: 'Crew size',
  temp_c: 'Air temperature',
  wind_kph: 'Wind speed',
  blizzard: 'Blizzard',
  science_activity: 'Science activity',
  vehicle_hours: 'Vehicle hours',
  health: 'Current health',
  slope7: '7-day health trend',
  vib7: 'Vibration (7d)',
  temp7: 'Temperature (7d)',
  load7: 'Load (7d)',
  since: 'Days since service',
  category: 'Machine type',
  h: 'Horizon',
}
