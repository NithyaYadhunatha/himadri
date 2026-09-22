// src/components/graph/panels/index.ts
//
// Asset category -> type-specific detail panel. Selected by NodeInspector at
// render time, keyed off the same NodeType union nodeTypeConfig.ts uses.
// Every category except 'custom' shares the same GenericAssetPanel shape
// (identity / live reading / health & maintenance / recent events) bound to
// its own curated JSON dataset under lib/syntheticData/ — see
// GenericAssetPanel.tsx's header comment for why a single generic layout
// replaced the old 16-bespoke-panel-per-IT-type approach.
import type { ComponentType } from 'react'
import type { NodeType } from '@/types/graph'
import type { NodeTypePanelProps } from './types'
import { createGenericAssetPanel, type GenericAssetEntry } from './GenericAssetPanel'
import { CustomNodePanel } from './CustomNodePanel'

import powerData from '@/lib/syntheticData/powerData.json'
import heatingData from '@/lib/syntheticData/heatingData.json'
import waterData from '@/lib/syntheticData/waterData.json'
import wasteData from '@/lib/syntheticData/wasteData.json'
import vehicleData from '@/lib/syntheticData/vehicleData.json'
import instrumentData from '@/lib/syntheticData/instrumentData.json'
import storageData from '@/lib/syntheticData/storageData.json'
import medicalData from '@/lib/syntheticData/medicalData.json'
import commsData from '@/lib/syntheticData/commsData.json'
import structureData from '@/lib/syntheticData/structureData.json'

const asEntries = (d: unknown) => d as Record<string, GenericAssetEntry>

export const nodeTypePanels: Record<NodeType, ComponentType<NodeTypePanelProps>> = {
  power: createGenericAssetPanel(asEntries(powerData)),
  heating: createGenericAssetPanel(asEntries(heatingData)),
  water: createGenericAssetPanel(asEntries(waterData)),
  waste: createGenericAssetPanel(asEntries(wasteData)),
  vehicle: createGenericAssetPanel(asEntries(vehicleData)),
  instrument: createGenericAssetPanel(asEntries(instrumentData)),
  storage: createGenericAssetPanel(asEntries(storageData)),
  medical: createGenericAssetPanel(asEntries(medicalData)),
  comms: createGenericAssetPanel(asEntries(commsData)),
  structure: createGenericAssetPanel(asEntries(structureData)),
  custom: CustomNodePanel,
}

export function getNodeTypePanel(type: NodeType): ComponentType<NodeTypePanelProps> {
  return nodeTypePanels[type] ?? CustomNodePanel
}
