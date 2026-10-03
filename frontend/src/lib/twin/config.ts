// ONE place for twin metadata. Device ids/rooms mirror the backend catalog in
// backend/backend/services/digitaltwin_bridge.py (DEVICE_CATALOG) and the Unity
// scene's object names. Warning/critical values below are DISPLAY reference
// lines for charts only — they are configurable demo thresholds, not safety
// standards. The status shown everywhere is the one the backend computes.

import type { AssetDef, HeatVariable, RoomDef } from './types'

export interface MaitriNavigationRoom extends RoomDef {
  wing: 'North' | 'South'
  /** Existing monitored room hosted in this physical room, if any. */
  monitoredRoomId?: string
}

/** Every physical room reached from Maitri's main corridor. */
export const MAITRI_ROOMS: MaitriNavigationRoom[] = [
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `maitri-north-${i + 1}`,
    name: `North Room ${String(i + 1).padStart(2, '0')}`,
    short: `N${String(i + 1).padStart(2, '0')}`,
    wing: 'North' as const,
    ...(i === 3 ? { monitoredRoomId: 'room-01' } : i === 4 ? { monitoredRoomId: 'room-02' } : {}),
  })),
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `maitri-south-${i + 1}`,
    name: `South Room ${String(i + 1).padStart(2, '0')}`,
    short: `S${String(i + 1).padStart(2, '0')}`,
    wing: 'South' as const,
    ...(i === 3 ? { monitoredRoomId: 'room-03' } : {}),
  })),
]

export const ROOMS: RoomDef[] = [
  { id: 'room-01', name: 'Environmental Monitoring', short: 'Room 1' },
  { id: 'room-02', name: 'Safety & Occupancy', short: 'Room 2' },
  { id: 'room-03', name: 'Machine / Actuator Monitoring', short: 'Room 3' },
]

const UNO = 'Arduino Uno'
const PI = 'Raspberry Pi gateway'

export const ASSETS: AssetDef[] = [
  { id: 'sensor-dht-01', name: 'Temperature Sensor', type: 'temperature', roomId: 'room-01', hardware: true, role: 'sensor', controller: UNO, gateway: PI, connection: 'USB serial → HTTPS', unit: '°C', warning: 28, critical: 32, note: 'DHT11' },
  { id: 'sensor-humidity-01', name: 'Humidity Sensor', type: 'humidity', roomId: 'room-01', hardware: true, role: 'sensor', controller: UNO, gateway: PI, connection: 'USB serial → HTTPS', unit: '%', warning: 65, critical: 75, note: 'DHT11' },
  { id: 'sensor-mq2-01', name: 'MQ-2 Gas Sensor', type: 'gas', roomId: 'room-01', hardware: true, role: 'sensor', controller: UNO, gateway: PI, connection: 'USB serial → HTTPS', unit: 'ADC', warning: 400, critical: 700, note: 'Raw ADC counts, not calibrated ppm' },
  { id: 'buzzer-01', name: 'Alarm Buzzer', type: 'buzzer', roomId: 'room-01', hardware: true, role: 'actuator', controller: UNO, gateway: PI, connection: 'Command queue → serial', unit: 'state', boolean: true, stateLabels: ['OFF', 'ON'] },
  { id: 'sensor-ultrasonic-01', name: 'HC-SR04 Distance Sensor', type: 'distance', roomId: 'room-02', hardware: true, role: 'sensor', controller: 'Raspberry Pi GPIO', gateway: PI, connection: 'GPIO → HTTPS', unit: 'cm', warning: 120, critical: 40, inverse: true },
  { id: 'sensor-ir-01', name: 'IR Presence Sensor', type: 'ir', roomId: 'room-02', hardware: true, role: 'sensor', controller: 'Raspberry Pi GPIO', gateway: PI, connection: 'GPIO → HTTPS', unit: 'state', boolean: true, stateLabels: ['NO OBJECT', 'OBJECT'] },
  { id: 'occupancy-indicator-01', name: 'Occupancy Indicator', type: 'occupancy', roomId: 'room-02', hardware: false, role: 'indicator', controller: 'Backend (derived from IR)', gateway: 'n/a', connection: 'Derived', unit: 'state', boolean: true, stateLabels: ['VACANT', 'OCCUPIED'] },
  { id: 'servo-01', name: 'Position Servo', type: 'servo', roomId: 'room-03', hardware: true, role: 'actuator', controller: 'Raspberry Pi PWM (BCM18)', gateway: PI, connection: 'GPIO PWM', unit: 'deg', note: 'Read-only here: the backend command API only accepts buzzer-01' },
  { id: 'sensor-door-01', name: 'Hall Effect Sensor', type: 'hall-effect', roomId: 'room-03', hardware: true, role: 'sensor', controller: UNO, gateway: PI, connection: 'USB serial → HTTPS', unit: 'state', boolean: true, stateLabels: ['NO MAGNET', 'MAGNET'], note: 'Uno D10; legacy id sensor-door-01 kept for the Unity build' },
]

// Backend catalog also lists virtual/legacy devices (motor-01, relay-01,
// derived indicators, vibration). They have no hardware on the current rig, so
// the console hides them rather than present them as monitored hardware.
export const ASSET_BY_ID: Record<string, AssetDef> = Object.fromEntries(ASSETS.map((a) => [a.id, a]))
export const roomOf = (id: string) => ROOMS.find((r) => r.id === id)
export const maitriRoomOf = (id: string) => MAITRI_ROOMS.find((r) => r.id === id)
export const assetsInRoom = (roomId: string) => ASSETS.filter((a) => a.roomId === roomId)

/** Controls offered per asset. Only what the existing command API accepts. */
export const CONTROLLABLE: Record<string, { kind: 'toggle'; confirm: boolean }> = {
  'buzzer-01': { kind: 'toggle', confirm: false },
}

export const FRESHNESS = {
  /** reading older than this (ms) is flagged stale */
  staleMs: 15_000,
  /** WebSocket silence before falling back to polling */
  wsSilentMs: 20_000,
  pollMs: 2_000,
}

export const HISTORY_CAP = 1800 // ≈ 1 h at 2 s
export const WINDOWS: { id: string; label: string; ms: number }[] = [
  { id: 'live', label: 'LIVE', ms: 60_000 },
  { id: '1m', label: '1m', ms: 60_000 },
  { id: '5m', label: '5m', ms: 300_000 },
  { id: '15m', label: '15m', ms: 900_000 },
  { id: '1h', label: '1h', ms: 3_600_000 },
  { id: '24h', label: '24h', ms: 86_400_000 },
]

export const HEAT_VARIABLES: { id: HeatVariable; label: string; assetType?: string }[] = [
  { id: 'temperature', label: 'Temperature', assetType: 'temperature' },
  { id: 'humidity', label: 'Humidity', assetType: 'humidity' },
  { id: 'gas', label: 'Gas / Air quality', assetType: 'gas' },
  { id: 'health', label: 'Equipment health' },
  { id: 'severity', label: 'Alert severity' },
]

export const STATUS_COLOR = {
  normal: '#22C55E',
  warning: '#F59E0B',
  critical: '#EF4444',
  offline: '#6B7280',
} as const

/** Unity WebGL build per station; only Maitri receives the live rig telemetry. */
export const STATION_HAS_RIG: Record<string, boolean> = { maitri: true, bharati: false }
