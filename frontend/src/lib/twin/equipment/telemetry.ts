// Telemetry adapter for the scientific equipment. The 3D scene and the details panel never
// look at API responses directly: they call getEquipmentTelemetry(), which maps whatever data
// HIMADRI actually has onto each equipment's fields and labels where every value came from.
//
//   Backend / existing APIs ──► getEquipmentTelemetry ──► details panel + 3D state (bridge)
//
// What exists today (no instrument feed from Bharati reaches HIMADRI):
//  • 'regional-weather' — GET /api/environment/weather?station=bharati (Open-Meteo model at the
//    station's coordinates). Real data, but a regional model, NOT the AWS instrument.
//  • 'station-reference' — the station's reference coordinates (lib/constants STATION_COORDS),
//    NOT a receiver fix.
// Everything else is unavailable. Simulated values appear only when equipment simulation is
// on (NEXT_PUBLIC_ENABLE_EQUIPMENT_SIMULATION=true, or the console's DEMO data mode) and every
// one is labelled SIMULATED.
import { STATION_COORDS } from '@/lib/constants'
import type { StationWeather } from '@/services/environment.service'
import type { EquipmentHealth } from '../bridge'
import { EQUIPMENT_BY_ID, fieldsOf, sourcesOf } from './catalog'
import { FIELDS, formatField } from './fields'

export type ValueSource = 'model' | 'reference' | 'simulated' | 'unavailable'
/** Overall data situation of one equipment: drives the status pill. */
export type TelemetryStatus = 'model' | 'reference' | 'simulated' | 'unavailable' | 'none'

export interface TelemetryRow {
  key: string
  label: string
  /** formatted value, or '—' when unavailable */
  value: string
  unit?: string
  raw?: number
  source: ValueSource
}

export interface EquipmentTelemetry {
  equipmentId: string
  status: TelemetryStatus
  rows: TelemetryRow[]
  /** epoch ms of the newest non-simulated data, if any */
  updatedAt: number | null
  /** what the 3D scene shows (LEDs/glow). Only simulation claims a device state. */
  health: EquipmentHealth
  /** human source notes for the panel footer */
  notes: string[]
}

export interface TelemetryContext {
  weather: StationWeather | null
  weatherAt: number | null
  simulation: boolean
  now: number
}

export const SIMULATION_ENV = process.env.NEXT_PUBLIC_ENABLE_EQUIPMENT_SIMULATION === 'true'

const WEATHER_FIELDS: Record<string, (w: StationWeather) => number | string> = {
  temperatureC: (w) => w.temperatureC,
  humidityPct: (w) => w.humidityPct,
  pressureHpa: (w) => w.pressureHpa,
  windSpeedKmh: (w) => w.windSpeedKmh,
  windDirectionDeg: (w) => w.windDirectionDeg,
  windGustKmh: (w) => w.windGustKmh,
  conditions: (w) => w.weatherLabel,
}

const REFERENCE_FIELDS: Record<string, () => number> = {
  latitude: () => STATION_COORDS.bharati.lat,
  longitude: () => STATION_COORDS.bharati.lon,
}

/** Deterministic 0…1 phase per equipment so simulated loggers don't move in lockstep. */
function phase(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return (h % 1000) / 1000
}

export function getEquipmentTelemetry(equipmentId: string, ctx: TelemetryContext): EquipmentTelemetry {
  const def = EQUIPMENT_BY_ID[equipmentId]
  const empty: EquipmentTelemetry = { equipmentId, status: 'none', rows: [], updatedAt: null, health: 'unknown', notes: [] }
  if (!def) return { ...empty, status: 'unavailable' }

  const sources = sourcesOf(def)
  const weather = sources.includes('regional-weather') ? ctx.weather : null
  const t = ctx.now / 1000
  const p = phase(equipmentId)
  const rows: TelemetryRow[] = []
  let updatedAt: number | null = null

  for (const key of fieldsOf(def)) {
    const f = FIELDS[key]
    const base = { key, label: f?.label ?? key, unit: f?.unit }
    let v: number | string | undefined
    let source: ValueSource = 'unavailable'
    if (weather && key in WEATHER_FIELDS) {
      v = WEATHER_FIELDS[key](weather)
      source = 'model'
      updatedAt = ctx.weatherAt
    } else if (sources.includes('station-reference') && key in REFERENCE_FIELDS) {
      v = REFERENCE_FIELDS[key]()
      source = 'reference'
    } else if (ctx.simulation && f) {
      v = f.sim(t, p)
      source = 'simulated'
    }
    if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) {
      rows.push({ ...base, value: '—', source: 'unavailable' })
    } else {
      rows.push({ ...base, value: formatField(key, v), raw: typeof v === 'number' ? v : undefined, source, unit: f?.format ? undefined : base.unit })
    }
  }

  const has = (s: ValueSource) => rows.some((r) => r.source === s)
  const status: TelemetryStatus = !rows.length ? 'none' : has('simulated') ? 'simulated' : has('model') ? 'model' : has('reference') ? 'reference' : 'unavailable'
  const notes: string[] = []
  if (has('model')) notes.push(`Weather values: ${weather?.source ?? 'Open-Meteo'} regional model at the station coordinates — not this instrument's own feed.`)
  if (has('reference')) notes.push('Coordinates: station reference position, not a live receiver fix.')
  if (has('simulated')) notes.push('SIMULATED values for demonstration — not Bharati measurements.')
  if (has('unavailable')) notes.push('No live feed from this instrument reaches HIMADRI yet.')

  return { equipmentId, status, rows, updatedAt, health: has('simulated') ? 'normal' : 'unknown', notes }
}

/** Equipment simulation is on when explicitly enabled by env, or while the console is in DEMO mode. */
export const simulationEnabled = (mode: 'live' | 'demo') => SIMULATION_ENV || mode === 'demo'
