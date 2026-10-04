// Scientific equipment of the Bharati 3D twin. ONE source of truth for both sides:
// public/unity/bharati/StreamingAssets/scientific-equipment.json. The Unity scene loads the
// same file at runtime (positions, rotation, scale, models, teleport anchors, zones); the
// dashboard reads names, descriptions and telemetry bindings from it here. Edit the JSON, not
// this module. Field definitions (labels, units, demo simulation) live in ./fields.ts.
import raw from '../../../../public/unity/bharati/StreamingAssets/scientific-equipment.json'

/** Where a telemetry field can come from besides simulation. See ./telemetry.ts. */
export type TelemetrySource = 'regional-weather' | 'station-reference'

export interface EquipmentZone {
  id: string
  name: string
  color: string
  glyph: string
  /** minX, minZ, maxX, maxZ (Unity world metres) */
  bounds: number[]
}

export interface EquipmentDef {
  id: string
  name: string
  shortName: string
  category: string
  zone: string
  description?: string
  purpose?: string
  /** 'equipment' (default) or 'prop' (scenery, never shown in the dashboard) */
  kind?: string
  model: string
  variant?: string
  prefab?: string
  position: number[]
  rotation?: number[]
  scale?: number[]
  interactive?: boolean
  navigable?: boolean
  minimap?: boolean
  teleport?: { position?: number[]; yaw?: number }
  telemetry?: { sources?: string[]; fields?: string[] }
}

interface EquipmentConfig {
  version: number
  station: string
  disclaimer: string
  zones: EquipmentZone[]
  equipment: EquipmentDef[]
}

const config = raw as EquipmentConfig

export const EQUIPMENT_DISCLAIMER = config.disclaimer
export const EQUIPMENT_ZONES: EquipmentZone[] = config.zones
export const ZONE_BY_ID: Record<string, EquipmentZone> = Object.fromEntries(config.zones.map((z) => [z.id, z]))
/** Selectable equipment (props excluded), in JSON order. */
export const EQUIPMENT: EquipmentDef[] = config.equipment.filter((e) => e.kind !== 'prop' && e.interactive !== false)
export const EQUIPMENT_BY_ID: Record<string, EquipmentDef> = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e]))

export const sourcesOf = (e: EquipmentDef): TelemetrySource[] =>
  (e.telemetry?.sources ?? []).filter((s): s is TelemetrySource => s === 'regional-weather' || s === 'station-reference')
export const fieldsOf = (e: EquipmentDef): string[] => e.telemetry?.fields ?? []
