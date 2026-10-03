// src/lib/forecast/outlook.ts
//
// Glue between the raw model (engine.ts), the station's current stock levels
// and the manual-entry ledger: one call returns everything the Energy,
// Logistics and Overview pages need to say "how long will it last".
import {
  projectConsumption, runout, isoDate,
  type DayForecast, type Drivers, type ForecastModel, type Runout, type StationKey, type Delivery,
} from './engine'
import type { ExpectedDelivery, LedgerEntry } from '@/store/useLedgerStore'

export const MAX_HORIZON_DAYS = 900

export interface StationStocks {
  fuelL: number
  foodKg: number
  fuelReserveL?: number
}

export interface Calibration {
  factor: number
  samples: number
  observedAvg: number
  modelAvg: number
}

export interface Outlook {
  start: Date
  forecast: DayForecast[]
  fuel: Runout
  food: Runout
  calibration: Calibration | null
}

const DAY_MS = 86_400_000

export function todayUtc(): Date {
  const n = new Date()
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()))
}

export function dayOffset(isoDay: string, start: Date): number {
  return Math.round((new Date(isoDay + 'T00:00:00Z').getTime() - start.getTime()) / DAY_MS)
}

/**
 * Compares the last week or so of manually logged daily fuel burn with what the
 * model would have predicted for those same dates. Needs ≥3 entries; the factor
 * is clamped to 0.6–1.6 so one typo cannot swing the forecast wildly.
 */
export function fuelCalibration(model: ForecastModel, station: StationKey, entries: LedgerEntry[]): Calibration | null {
  const cutoff = Date.now() - 14 * DAY_MS
  const logged = entries
    .filter((e) => e.station === station && e.kind === 'consumption' && e.resource === 'fuel' && new Date(e.date).getTime() >= cutoff)
    .slice(0, 7)
  if (logged.length < 3) return null
  let obs = 0, pred = 0
  for (const e of logged) {
    obs += e.quantity
    pred += projectConsumption(model, station, new Date(e.date + 'T00:00:00Z'), 1)[0].fuel_l.mid
  }
  const n = logged.length
  const raw = obs / pred
  return { factor: Math.max(0.6, Math.min(1.6, raw)), samples: n, observedAvg: obs / n, modelAvg: pred / n }
}

export function buildOutlook(
  model: ForecastModel,
  station: StationKey,
  stocks: StationStocks,
  opts: { drivers?: Drivers; deliveries?: ExpectedDelivery[]; entries?: LedgerEntry[]; useCalibration?: boolean } = {},
): Outlook {
  const start = todayUtc()
  const calibration = opts.entries ? fuelCalibration(model, station, opts.entries) : null
  const drivers: Drivers = { ...opts.drivers }
  if (opts.useCalibration && calibration) drivers.calibration = calibration.factor
  const forecast = projectConsumption(model, station, start, MAX_HORIZON_DAYS, drivers)

  const mine = (opts.deliveries ?? []).filter((d) => d.station === station)
  const toDeliveries = (res: 'fuel' | 'food'): Delivery[] =>
    mine.filter((d) => d.resource === res).map((d) => ({ day: dayOffset(d.date, start), amount: d.amount })).filter((d) => d.day >= 0)

  return {
    start,
    forecast,
    fuel: runout(stocks.fuelL, forecast, 'fuel_l', { deliveries: toDeliveries('fuel'), reserve: stocks.fuelReserveL }),
    food: runout(stocks.foodKg, forecast, 'food_kg', { deliveries: toDeliveries('food') }),
    calibration,
  }
}

export function fmtDays(d: number | null, horizon = MAX_HORIZON_DAYS): string {
  return d === null ? `>${horizon}` : String(d)
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function endurance_color(days: number | null): string {
  if (days === null) return '#0F8A6A'
  return days < 30 ? '#C23B3B' : days < 90 ? '#D4820A' : '#0F8A6A'
}

export { isoDate }
