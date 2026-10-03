// Display definitions for every telemetry field named in scientific-equipment.json, plus the
// DEMO generator used only when equipment simulation is switched on (see ./telemetry.ts).
// Simulated values are smooth, deterministic functions of time (no randomness) with plausible
// magnitudes for a coastal East-Antarctic site. They are never Bharati measurements and the UI
// labels every one of them SIMULATED.

export interface FieldDef {
  label: string
  unit?: string
  decimals?: number
  /** Formats the raw value; defaults to fixed decimals. */
  format?: (v: number) => string
  /** Demo generator: t = seconds, p = per-equipment phase (0…1). */
  sim: (t: number, p: number) => number | string
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]

const wave = (t: number, period: number, p: number) => Math.sin((t / period + p) * 2 * Math.PI)
const ago = (t: number, every: number) => `${Math.floor(t % every)} s ago`
const coord = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`

// Simulated geomagnetic components (nT). High southern geomagnetic latitude: field mostly vertical.
const magX = (t: number, p: number) => 9_800 + 18 * wave(t, 900, p) + 3 * wave(t, 40, p)
const magY = (t: number, p: number) => -6_200 + 12 * wave(t, 1100, p + 0.2)
const magZ = (t: number, p: number) => -47_500 + 22 * wave(t, 1300, p + 0.4)

export const FIELDS: Record<string, FieldDef> = {
  // ── weather (Open-Meteo regional model when available)
  temperatureC: { label: 'Temperature', unit: '°C', decimals: 1, sim: (t, p) => -12 + 3 * wave(t, 1800, p) + 0.4 * wave(t, 37, p) },
  humidityPct: { label: 'Humidity', unit: '%', decimals: 0, sim: (t, p) => 62 + 8 * wave(t, 1300, p) },
  pressureHpa: { label: 'Pressure', unit: 'hPa', decimals: 1, sim: (t, p) => 984 + 3 * wave(t, 4000, p) },
  windSpeedKmh: { label: 'Wind speed', unit: 'km/h', decimals: 1, sim: (t, p) => 22 + 9 * wave(t, 240, p) + 3 * wave(t, 31, p) },
  windDirectionDeg: { label: 'Wind direction', format: (v) => `${compass(v)} (${Math.round(v)}°)`, sim: (t, p) => (110 + 25 * wave(t, 500, p) + 360) % 360 },
  windGustKmh: { label: 'Wind gust', unit: 'km/h', decimals: 1, sim: (t, p) => 31 + 10 * wave(t, 200, p) },
  conditions: { label: 'Conditions', sim: () => 'Partly cloudy' },

  // ── data loggers
  loggerState: { label: 'Logger', sim: () => 'LOGGING' },
  sampleInterval: { label: 'Sample interval', sim: () => '1 s' },
  connection: { label: 'Connection', sim: () => 'CONNECTED' },
  storageFree: { label: 'Storage free', unit: '%', decimals: 0, sim: (t, p) => 71 - ((t / 3600 + p * 10) % 6) },
  lastTransmission: { label: 'Last transmission', sim: (t) => ago(t, 60) },
  lastReading: { label: 'Last reading', sim: (t) => ago(t, 10) },
  supplyVoltageV: { label: 'Supply', unit: 'V', decimals: 2, sim: (t, p) => 13.2 + 0.3 * wave(t, 3600, p) },

  // ── geomagnetism
  fieldX: { label: 'X (north) component', unit: 'nT', decimals: 1, sim: magX },
  fieldY: { label: 'Y (east) component', unit: 'nT', decimals: 1, sim: magY },
  fieldZ: { label: 'Z (vertical) component', unit: 'nT', decimals: 1, sim: magZ },
  fieldTotal: { label: 'Total field (F)', unit: 'nT', decimals: 1, sim: (t, p) => Math.hypot(magX(t, p), magY(t, p), magZ(t, p)) },
  variationX: { label: 'Variation, X channel', unit: 'nT', decimals: 2, sim: (t, p) => 1.2 * wave(t, 18, p) + 0.4 * wave(t, 5, p) },
  variationY: { label: 'Variation, Y channel', unit: 'nT', decimals: 2, sim: (t, p) => 0.9 * wave(t, 22, p + 0.3) + 0.3 * wave(t, 6, p) },
  frequencyHz: { label: 'Dominant frequency', unit: 'Hz', decimals: 3, sim: (t, p) => 0.055 + 0.01 * wave(t, 600, p) },
  deviceStatus: { label: 'Device status', sim: () => 'OK' },
  measurementStatus: { label: 'Measurement', sim: () => 'MEASURING' },
  acquisitionState: { label: 'Acquisition', sim: () => 'ACQUIRING' },
  signalQuality: { label: 'Signal quality', unit: '%', decimals: 0, sim: (t, p) => 92 + 4 * wave(t, 300, p) },

  // ── GPS / geodesy
  latitude: { label: 'Latitude', format: (v) => coord(v, 'N', 'S'), sim: () => -69.4067 },
  longitude: { label: 'Longitude', format: (v) => coord(v, 'E', 'W'), sim: () => 76.19 },
  altitudeM: { label: 'Altitude', unit: 'm', decimals: 1, sim: (t, p) => 38 + 0.6 * wave(t, 120, p) },
  satellites: { label: 'Satellites', decimals: 0, sim: (t, p) => Math.round(13 + 3 * wave(t, 900, p)) },
  fixType: { label: 'Fix', sim: () => '3D / DGPS' },
  lastSync: { label: 'Last synchronisation', sim: (t) => ago(t, 30) },

  // ── atmospheric electricity
  electricField: { label: 'Electric field', unit: 'V/m', decimals: 1, sim: (t, p) => 118 + 22 * wave(t, 1500, p) + 4 * wave(t, 60, p) },
  voltageV: { label: 'Sensor output', unit: 'V', decimals: 3, sim: (t, p) => 1.18 + 0.22 * wave(t, 1500, p) },

  // ── radiation (µSv/h)
  gammaDoseRate: { label: 'Gamma dose rate', unit: 'µSv/h', decimals: 3, sim: (t, p) => 0.062 + 0.006 * wave(t, 700, p) },
  doseRate: { label: 'Dose rate', unit: 'µSv/h', decimals: 3, sim: (t, p) => 0.065 + 0.007 * wave(t, 650, p) },
  neutronDoseRate: { label: 'Neutron dose-equiv. rate', unit: 'µSv/h', decimals: 4, sim: (t, p) => 0.0045 + 0.0008 * wave(t, 900, p) },
  detectorStatus: { label: 'Detector', sim: () => 'OK' },
  alarmState: { label: 'Alarm', sim: () => 'NORMAL' },

  // ── energy / power conditioning
  operationalStatus: { label: 'Status', sim: () => 'OPERATING' },
  generatedPowerW: { label: 'Generated power', unit: 'W', decimals: 0, sim: (t, p) => 140 + 45 * wave(t, 900, p) },
  batteryPct: { label: 'Battery', unit: '%', decimals: 0, sim: (t, p) => 78 + 6 * wave(t, 5400, p) },
  inputVoltageV: { label: 'Input voltage', unit: 'V', decimals: 1, sim: (t, p) => 28.4 + 0.8 * wave(t, 600, p) },
  outputVoltageV: { label: 'Output voltage', unit: 'V', decimals: 2, sim: (t, p) => 24.1 + 0.05 * wave(t, 300, p) },
  chargingStatus: { label: 'Charging', sim: () => 'FLOAT' },
}

export function formatField(key: string, v: number | string): string {
  const f = FIELDS[key]
  if (typeof v === 'string' || !f) return String(v)
  if (f.format) return f.format(v)
  return v.toFixed(f.decimals ?? 1)
}
