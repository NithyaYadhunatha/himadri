// src/lib/graph/nodeTypes.ts
//
// Single source of truth for how an asset's `type` (category) renders on the
// twin — icon, accent color, human label, and available actions. Every node
// on the canvas (GraphNode) and every filter chip (GraphFilterBar) pulls
// from this, keyed by the same NodeType union `types/graph.ts` defines
// (which mirrors backend/models/tables.py's Asset.category exactly: power |
// heating | water | waste | vehicle | instrument | storage | medical |
// comms | structure | custom). Never hardcode an icon per individual asset
// id — add/adjust a category here instead.
//
// actions[] — the default action palette for each category. IDs are stable
// strings referenced by NodeWorkProfile to customise which subset is
// exposed per asset instance. Executing an action writes an ActivityLog.
// Antarctic station operations content (not IT-ops boilerplate): each
// category's actions reflect what an engineer/scientist on-station would
// actually do, sourced from the project's documented maintenance procedures
// (PistenBully cold-start diagnostics via the 16-pin Mini-Doc connector,
// STP stage checks, AHU filter service, freezer/fuel checks, etc.).

import {
  Battery,
  Droplet,
  Flame,
  HeartPulse,
  Landmark,
  Radio,
  Recycle,
  Sparkles,
  Telescope,
  Truck,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import type { NodeType } from '@/types/graph'

export type NodeActionCategory = 'diagnostic' | 'maintenance' | 'emergency'

export interface NodeAction {
  /** Stable ID — referenced by NodeWorkProfile to customise per-asset palette. */
  id: string
  label: string
  description: string
  category: NodeActionCategory
  /** If true, the UI prompts for confirmation before executing. */
  requiresConfirmation?: boolean
}

export interface NodeTypeConfig {
  icon: LucideIcon
  color: string
  label: string
  actions?: NodeAction[]
}

export const nodeTypeConfig: Record<NodeType, NodeTypeConfig> = {
  power: {
    icon: Battery,
    color: '#1D1C93',
    label: 'Power',
    actions: [
      {
        id: 'read-load-factor',
        label: 'Read Load Factor',
        description: 'Compare current generator/CHP output against rated capacity.',
        category: 'diagnostic',
      },
      {
        id: 'run-diagnosis',
        label: 'Run Guided Diagnosis',
        description: 'Rank probable causes for a fault on this generator/CHP unit with a recommended check sequence.',
        category: 'diagnostic',
      },
      {
        id: 'schedule-service',
        label: 'Schedule Service',
        description: 'Log a scheduled maintenance window based on running hours and duty cycle.',
        category: 'maintenance',
      },
      {
        id: 'switch-load',
        label: 'Switch Load',
        description: 'Issue a start/stop/mode command to rebalance load across generators.',
        category: 'emergency',
        requiresConfirmation: true,
      },
    ],
  },
  heating: {
    icon: Flame,
    color: '#D4820A',
    label: 'Heating',
    actions: [
      {
        id: 'check-filter-dp',
        label: 'Check Filter Differential Pressure',
        description: 'Read AHU/boiler filter differential pressure against baseline.',
        category: 'diagnostic',
      },
      {
        id: 'adjust-setpoint',
        label: 'Adjust Setpoint',
        description: 'Issue a supervised setpoint change (two-step confirmation, audited).',
        category: 'maintenance',
        requiresConfirmation: true,
      },
      {
        id: 'log-maintenance',
        label: 'Log Maintenance Event',
        description: 'Record a maintenance or fault event to this asset’s passport.',
        category: 'maintenance',
      },
    ],
  },
  water: {
    icon: Droplet,
    color: '#2B8FBF',
    label: 'Water',
    actions: [
      {
        id: 'log-manual-reading',
        label: 'Log Manual Reading',
        description: 'Enter a manual dip/level reading for this tank or pump.',
        category: 'diagnostic',
      },
      {
        id: 'view-rationing',
        label: 'View Rationing Policy',
        description: 'Check litres-per-person-per-day against the observed rationing policy.',
        category: 'diagnostic',
      },
    ],
  },
  waste: {
    icon: Recycle,
    color: '#5C8A3A',
    label: 'Waste',
    actions: [
      {
        id: 'view-stp-cycle',
        label: 'View Treatment Cycle',
        description: 'Show per-stage status of the wastewater treatment cycle (collection → discharge).',
        category: 'diagnostic',
      },
      {
        id: 'run-diagnosis',
        label: 'Run Guided Diagnosis',
        description: 'Diagnose a stalled treatment stage (sludge pump, bioreactor temperature, filter fouling).',
        category: 'diagnostic',
      },
      {
        id: 'log-backhaul',
        label: 'Log Backhaul',
        description: 'Record a waste container as backloaded to the resupply ship.',
        category: 'maintenance',
      },
    ],
  },
  vehicle: {
    icon: Truck,
    color: '#8A5A2B',
    label: 'Vehicle',
    actions: [
      {
        id: 'read-fault-code',
        label: 'Read Fault Code',
        description: 'Bypass a dead display via the 16-pin Mini-Doc connector and read the fault code directly.',
        category: 'diagnostic',
      },
      {
        id: 'run-diagnosis',
        label: 'Run Guided Diagnosis',
        description: 'Rank probable causes for a cold-start or coolant fault with a recommended check sequence.',
        category: 'diagnostic',
      },
      {
        id: 'assign-convoy',
        label: 'Assign to Convoy',
        description: 'Add this vehicle to a planned convoy’s equipment/vehicle roster.',
        category: 'maintenance',
      },
      {
        id: 'log-fault',
        label: 'Log Fault',
        description: 'Record a fault event to this vehicle’s passport, with fault code if known.',
        category: 'maintenance',
      },
    ],
  },
  instrument: {
    icon: Telescope,
    color: '#A04FB8',
    label: 'Science Instrument',
    actions: [
      {
        id: 'check-continuity',
        label: 'Check Data Continuity',
        description: 'View this instrument’s data-continuity percentage and last-sample time.',
        category: 'diagnostic',
      },
      {
        id: 'run-diagnosis',
        label: 'Run Guided Diagnosis',
        description: 'Diagnose a data dropout (power, comms link, field cable, logging software).',
        category: 'diagnostic',
      },
      {
        id: 'schedule-calibration',
        label: 'Schedule Calibration',
        description: 'Log a scheduled calibration/service window for this instrument.',
        category: 'maintenance',
      },
    ],
  },
  storage: {
    icon: Warehouse,
    color: '#2B6E8A',
    label: 'Storage',
    actions: [
      {
        id: 'daily-check',
        label: 'Log Daily Check',
        description: 'Record the daily freezer temperature / fuel dip / food stock check.',
        category: 'diagnostic',
      },
      {
        id: 'run-diagnosis',
        label: 'Run Guided Diagnosis',
        description: 'Diagnose a freezer temperature deviation (door seal, compressor, refrigerant, sensor).',
        category: 'diagnostic',
      },
      {
        id: 'view-endurance',
        label: 'View Endurance Projection',
        description: 'Project days-of-fuel/food remaining against the isolation window.',
        category: 'diagnostic',
      },
    ],
  },
  medical: {
    icon: HeartPulse,
    color: '#C23B3B',
    label: 'Medical',
    actions: [
      {
        id: 'view-capability',
        label: 'View Capability Gap',
        description: 'Show this facility’s documented medical capability and any known gaps.',
        category: 'diagnostic',
      },
      {
        id: 'log-readiness',
        label: 'Log Readiness Check',
        description: 'Record a readiness/maintenance check for this medical asset.',
        category: 'maintenance',
      },
    ],
  },
  comms: {
    icon: Radio,
    color: '#4A6FA5',
    label: 'Comms',
    actions: [
      {
        id: 'check-link-state',
        label: 'Check Link State',
        description: 'View current connectivity banner state (Online / Degraded / PNR-Isolated).',
        category: 'diagnostic',
      },
      {
        id: 'view-sync-status',
        label: 'View Sync Status',
        description: 'Show queue depth, last sync time, and bandwidth budget remaining.',
        category: 'diagnostic',
      },
    ],
  },
  structure: {
    icon: Landmark,
    color: '#6E6357',
    label: 'Structure',
    actions: [
      {
        id: 'view-zone-assets',
        label: 'View Zone Assets',
        description: 'List every asset registered in this structural zone.',
        category: 'diagnostic',
      },
      {
        id: 'toggle-restricted',
        label: 'Toggle Restricted Access',
        description: 'Mark this zone as access-controlled (e.g. Bharati’s Satellite Control Room).',
        category: 'maintenance',
        requiresConfirmation: true,
      },
    ],
  },
  custom: {
    icon: Sparkles,
    color: '#A04FB8',
    label: 'Custom Asset',
    actions: [],
  },
}

// ─── Compatibility helpers ──────────────────────────────────────────────────
//
// A handful of call sites (GraphFilterBar, GraphNode, NodeInspector, panels)
// were written against slightly different names for the same lookup table —
// kept as thin aliases here rather than touched at every call site.

/** Alias of `nodeTypeConfig` for call sites written against the SCREAMING_CASE name. */
export const NODE_TYPE_CONFIG = nodeTypeConfig

/** Safe lookup — falls back to the 'custom' config for an unrecognised type
 * rather than throwing, matching backendAdapters.mapNodeType's own fallback. */
export function getNodeTypeConfig(type: NodeType): NodeTypeConfig {
  return nodeTypeConfig[type] ?? nodeTypeConfig.custom
}

/** Fixed display order for every category-driven UI (canvas legend, filter
 * chips). Every HIMADRI asset category is already its own canonical NodeType
 * (unlike the old IT taxonomy, which grouped many raw types like server/vm/
 * container under one filter category) so this is a 1:1 wrapper, not a real
 * grouping — kept as a list of {label, types, config} triples purely so
 * existing callers (FlowCanvas's legend, copilot/tools.ts) don't need to
 * change shape. */
export const ASSET_CATEGORY_ORDER: NodeType[] = [
  'power', 'heating', 'water', 'waste', 'vehicle', 'instrument',
  'storage', 'medical', 'comms', 'structure', 'custom',
]

export const NODE_TYPE_CATEGORIES: { label: string; types: NodeType[]; config: NodeTypeConfig }[] =
  ASSET_CATEGORY_ORDER.map((type) => ({
    label: nodeTypeConfig[type].label,
    types: [type],
    config: nodeTypeConfig[type],
  }))
