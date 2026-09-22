// src/lib/mockData/mockCommands.ts
//
// Controllable-asset overlay for Remote Control (FR-9…14) mock mode.
// backend/models/tables.py's Asset has `controllable`/`life_safety` columns,
// but the real GET /assets list endpoint (AssetListItem, see
// backend/schemas/schemas.py) deliberately doesn't expose them — only the
// single-asset GET (AssetDetail) does. So this is a small, self-contained
// mock dataset layered on top of the SAME asset ids lib/mockData/mockGraph.ts
// already defines (not a duplicate universe) — spans every category a real
// HIMADRI operator would plausibly remote-actuate: generators and load
// mode (power), heating/AHU setpoints (heating), water plant flow targets
// (water), the STP's treatment cycle (waste), the VSAT uplink's
// auto-track/manual-point mode (comms), the MARA radar's sweep (instrument),
// and vehicles. Exactly one asset per station is marked life_safety
// (Maitri's Central Heating Plant, Bharati's Air Handling Unit 1 — which the
// same mockGraph.ts wires as a dependency of the Operation Theatre, b-e9) so
// the FR-11 second-approver flow has something real to demonstrate.
import type { NodeType } from '@/types/graph'

export type CommandActionKind = 'start' | 'stop' | 'setpoint' | 'mode'

export interface ControllableAssetDef {
  id: string
  name: string
  stationId: string
  category: NodeType
  subtype: string
  lifeSafety: boolean
  /** Starting status/value for the mock engine's in-memory state. */
  status: string
  primaryValue: number
  primaryUnit: string
  /** Value primaryValue snaps to once a 'start' command is applied. */
  nominalValue: number
  actions: CommandActionKind[]
  /** For a 'setpoint' action: the payload field name, unit, and slider bounds. */
  setpointField?: string
  setpointUnit?: string
  setpointMin?: number
  setpointMax?: number
  /** For a 'mode' action: the selectable operating modes. */
  modeOptions?: string[]
}

export const mockControllableAssets: ControllableAssetDef[] = [
  // ── Maitri ───────────────────────────────────────────────────────────────
  {
    id: 'maitri-genset-1', name: 'Diesel Generator 1', stationId: 'maitri',
    category: 'power', subtype: 'generator', lifeSafety: false,
    status: 'running', primaryValue: 46.2, primaryUnit: 'kW', nominalValue: 46.2,
    actions: ['start', 'stop'],
  },
  {
    id: 'maitri-genset-2', name: 'Diesel Generator 2', stationId: 'maitri',
    category: 'power', subtype: 'generator', lifeSafety: false,
    status: 'running', primaryValue: 33.8, primaryUnit: 'kW', nominalValue: 38.5,
    actions: ['start', 'stop', 'mode'],
    modeOptions: ['auto-load-share', 'manual'],
  },
  {
    id: 'maitri-heating-plant', name: 'Central Heating Plant', stationId: 'maitri',
    category: 'heating', subtype: 'boiler', lifeSafety: true,
    status: 'running', primaryValue: 21.5, primaryUnit: '°C', nominalValue: 21.5,
    actions: ['setpoint', 'stop', 'start'],
    setpointField: 'setpoint_c', setpointUnit: '°C', setpointMin: 16, setpointMax: 24,
  },
  {
    id: 'maitri-water-plant', name: 'Snow-Melt Water Plant', stationId: 'maitri',
    category: 'water', subtype: 'ro_plant', lifeSafety: false,
    status: 'running', primaryValue: 178, primaryUnit: 'L/min', nominalValue: 182,
    actions: ['start', 'stop', 'setpoint'],
    setpointField: 'flow_target_lpm', setpointUnit: 'L/min', setpointMin: 100, setpointMax: 220,
  },
  {
    id: 'maitri-stp', name: 'Sewage Treatment Plant', stationId: 'maitri',
    category: 'waste', subtype: 'stp', lifeSafety: false,
    status: 'running', primaryValue: 11.4, primaryUnit: 'L/min', nominalValue: 12.0,
    actions: ['start', 'stop', 'mode'],
    modeOptions: ['aerobic-cycle', 'anaerobic-cycle', 'standby'],
  },
  {
    id: 'maitri-comms-vsat', name: 'VSAT Satellite Link', stationId: 'maitri',
    category: 'comms', subtype: 'vsat', lifeSafety: false,
    status: 'running', primaryValue: -68, primaryUnit: 'dBm', nominalValue: -62,
    actions: ['start', 'stop', 'mode'],
    modeOptions: ['auto-track', 'manual-point'],
  },
  {
    id: 'maitri-mara-radar', name: 'MARA Atmospheric Radar', stationId: 'maitri',
    category: 'instrument', subtype: 'radar', lifeSafety: false,
    status: 'running', primaryValue: 14, primaryUnit: 'rpm', nominalValue: 14,
    actions: ['start', 'stop'],
  },
  {
    id: 'maitri-pistenbully-1', name: 'PistenBully 1', stationId: 'maitri',
    category: 'vehicle', subtype: 'pistenbully', lifeSafety: false,
    status: 'stopped', primaryValue: -8, primaryUnit: '°C coolant', nominalValue: 45,
    actions: ['start', 'stop'],
  },

  // ── Bharati ──────────────────────────────────────────────────────────────
  {
    id: 'bharati-chp-1', name: 'Combined Heat & Power Unit 1', stationId: 'bharati',
    category: 'power', subtype: 'chp', lifeSafety: false,
    status: 'running', primaryValue: 52.4, primaryUnit: 'kW', nominalValue: 52.4,
    actions: ['start', 'stop'],
  },
  {
    id: 'bharati-chp-2', name: 'Combined Heat & Power Unit 2', stationId: 'bharati',
    category: 'power', subtype: 'chp', lifeSafety: false,
    status: 'running', primaryValue: 41.1, primaryUnit: 'kW', nominalValue: 44.0,
    actions: ['start', 'stop', 'mode'],
    modeOptions: ['auto-load-share', 'manual'],
  },
  {
    id: 'bharati-ahu-1', name: 'Air Handling Unit 1', stationId: 'bharati',
    category: 'heating', subtype: 'ahu', lifeSafety: true,
    status: 'running', primaryValue: 19.8, primaryUnit: '°C', nominalValue: 19.8,
    actions: ['setpoint', 'stop', 'start'],
    setpointField: 'setpoint_c', setpointUnit: '°C', setpointMin: 16, setpointMax: 24,
  },
  {
    id: 'bharati-water-plant', name: 'Desalination Plant', stationId: 'bharati',
    category: 'water', subtype: 'desalination', lifeSafety: false,
    status: 'running', primaryValue: 205, primaryUnit: 'L/min', nominalValue: 210,
    actions: ['start', 'stop', 'setpoint'],
    setpointField: 'flow_target_lpm', setpointUnit: 'L/min', setpointMin: 120, setpointMax: 250,
  },
  {
    id: 'bharati-black-water-tank', name: 'Black Water Transfer Pump', stationId: 'bharati',
    category: 'waste', subtype: 'wastewater_tank', lifeSafety: false,
    status: 'stopped', primaryValue: 0, primaryUnit: 'L/min', nominalValue: 9.5,
    actions: ['start', 'stop'],
  },
  {
    id: 'bharati-comms-vsat', name: 'VSAT Satellite Link', stationId: 'bharati',
    category: 'comms', subtype: 'vsat', lifeSafety: false,
    status: 'running', primaryValue: -61, primaryUnit: 'dBm', nominalValue: -58,
    actions: ['start', 'stop', 'mode'],
    modeOptions: ['auto-track', 'manual-point'],
  },
  {
    id: 'bharati-gsi-instrument', name: 'GSI Geophysical Instrument', stationId: 'bharati',
    category: 'instrument', subtype: 'seismograph', lifeSafety: false,
    status: 'running', primaryValue: 1, primaryUnit: 'active', nominalValue: 1,
    actions: ['start', 'stop'],
  },
  {
    id: 'bharati-pistenbully-vitesta', name: 'PistenBully "Vitesta"', stationId: 'bharati',
    category: 'vehicle', subtype: 'pistenbully', lifeSafety: false,
    status: 'stopped', primaryValue: -11, primaryUnit: '°C coolant', nominalValue: 44,
    actions: ['start', 'stop'],
  },
]
