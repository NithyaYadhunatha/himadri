// Normalised frontend telemetry model for the 3D digital-twin console.
// Everything in the UI reads these types; only adapter.ts knows the backend shape.

export type Health = 'normal' | 'warning' | 'critical' | 'offline'
export type Quality = 'good' | 'stale' | 'bad'
export type DataMode = 'live' | 'demo'
export type LinkState = 'live' | 'stale' | 'gateway-offline' | 'backend-offline' | 'connecting'

export interface Reading {
  assetId: string
  key: string
  value: number
  display: string
  unit: string
  /** epoch ms the backend stamped the reading */
  timestamp: number
  /** epoch ms the browser received it (used for freshness) */
  receivedAt: number
  quality: Quality
  status: Health
}

export interface Sample {
  t: number
  v: number
}

export interface RoomDef {
  id: string
  name: string
  short: string
}

export interface AssetDef {
  id: string
  name: string
  type: string
  roomId: string
  /** hardware on the physical rig (vs virtual / derived indicators) */
  hardware: boolean
  controller: string
  gateway: string
  connection: string
  /** 'sensor' | 'actuator' | 'indicator' */
  role: 'sensor' | 'actuator' | 'indicator'
  unit: string
  /** display-only reference lines; backend status is authoritative */
  warning?: number
  critical?: number
  inverse?: boolean
  /** boolean-state devices render as text, not a trend line */
  boolean?: boolean
  stateLabels?: [string, string]
  note?: string
}

export interface SelectedAsset {
  id: string
  name: string
  type: string
  room: string
  status: Health
  telemetry: Reading | null
  specifications: Record<string, string>
}

export interface TwinAlert {
  id: string
  level: 'info' | 'warning' | 'critical'
  assetId: string
  roomId: string
  title: string
  at: number
  acknowledged: boolean
  demo: boolean
}

export type HeatVariable = 'temperature' | 'humidity' | 'gas' | 'health' | 'severity'

export interface HeatmapState {
  on: boolean
  opacity: number
  variable: HeatVariable
}

export type CommandState = 'idle' | 'sending' | 'accepted' | 'failed' | 'timeout'
