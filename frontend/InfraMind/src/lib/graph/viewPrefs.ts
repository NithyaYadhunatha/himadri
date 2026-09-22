// Client-safe type definitions for digital-twin view preferences.
// Imported by both the server-side UserPreference Mongoose model and
// client-side components — no Mongoose/Node imports here.

export type LayoutPreset = 'hierarchical' | 'force' | 'circular'
export type NodeSizeMetric = 'dependencies' | 'uniform' | 'health'
export type ColorMode = 'health' | 'type'

export interface ViewPrefs {
  layoutPreset: LayoutPreset
  nodeSizeMetric: NodeSizeMetric
  colorMode: ColorMode
  edgeLabels: boolean
  showLegend: boolean
}

export const DEFAULT_VIEW_PREFS: ViewPrefs = {
  layoutPreset: 'hierarchical',
  nodeSizeMetric: 'dependencies',
  colorMode: 'type',
  edgeLabels: true,
  showLegend: false,
}
