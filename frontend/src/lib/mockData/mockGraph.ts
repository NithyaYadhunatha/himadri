// src/lib/mockData/mockGraph.ts
//
// Frontend-only fallback topology (gated by NEXT_PUBLIC_USE_MOCK, see
// lib/constants.ts) for Maitri and Bharati — a plausible, representative
// subset of each station's real asset inventory (the authoritative detailed
// seed data lives in the Python backend's scripts/seed_himadri_demo.py,
// written separately). ~20 assets per station across the 10 real asset
// categories, matching backend/models/tables.py's ASSET_CATEGORIES and the
// curated per-category telemetry in lib/syntheticData/.
import type { GraphNode, GraphEdge, LiveGraphData } from '@/types/graph'
import { computeDependencyLists } from '@/lib/graphUtils'

type RawNode = Omit<GraphNode, 'dependencies' | 'dependents'>

const now = new Date().toISOString()

// Zone ids below match the real Maitri/Bharati zone structure (see
// mockZones.ts / backend/scripts/seed_himadri_demo.py) — Bharati's floor
// bands and Maitri's main-building/outdoor split come from these, not from
// arbitrary category groupings, so the 2D twin's zone-banded layout
// (lib/graph/zoneLayout.ts) reflects the actual station architecture.
const rawNodes: RawNode[] = [
  // ── Maitri (Schirmacher Oasis, Queen Maud Land) ───────────────────────────
  { id: 'maitri-genset-1', label: 'Diesel Generator 1', subtype: 'generator', type: 'power', health: 'healthy', healthScore: 88, layer: 'power', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-main-building', provenance: 'verified' },
  { id: 'maitri-genset-2', label: 'Diesel Generator 2', subtype: 'generator', type: 'power', health: 'degraded', healthScore: 62, layer: 'power', dependencyCount: 0, incidents: 1, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-main-building', provenance: 'verified' },
  { id: 'maitri-genset-3', label: 'Diesel Generator 3 (Standby)', subtype: 'generator', type: 'power', health: 'healthy', healthScore: 95, layer: 'power', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-main-building', provenance: 'verified' },
  { id: 'maitri-fuel-farm-1', label: 'Fuel Farm Tank 1', subtype: 'fuel_tank', type: 'storage', health: 'healthy', healthScore: 93, layer: 'storage', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-fuel-farm', provenance: 'verified' },
  { id: 'maitri-fuel-farm-2', label: 'Fuel Farm Tank 2', subtype: 'fuel_tank', type: 'storage', health: 'healthy', healthScore: 90, layer: 'storage', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-fuel-farm', provenance: 'verified' },
  { id: 'maitri-deep-freezer-1', label: 'Deep Freezer 1', subtype: 'freezer', type: 'storage', health: 'healthy', healthScore: 88, layer: 'storage', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-kitchen', provenance: 'verified' },
  { id: 'maitri-deep-freezer-2', label: 'Deep Freezer 2', subtype: 'freezer', type: 'storage', health: 'critical', healthScore: 41, layer: 'storage', dependencyCount: 0, incidents: 2, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-kitchen', provenance: 'verified', isSimulating: true, simulationType: 'freezer_warming' },
  { id: 'maitri-heating-plant', label: 'Central Heating Plant', subtype: 'boiler', type: 'heating', health: 'healthy', healthScore: 84, layer: 'heating', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-main-building', provenance: 'verified' },
  { id: 'maitri-water-plant', label: 'Snow-Melt Water Plant', subtype: 'ro_plant', type: 'water', health: 'healthy', healthScore: 82, layer: 'water', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-main-building', provenance: 'verified' },
  { id: 'maitri-stp', label: 'Sewage Treatment Plant', subtype: 'stp', type: 'waste', health: 'degraded', healthScore: 79, layer: 'waste', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-kuber-waste-area', provenance: 'verified' },
  { id: 'maitri-orange-room-tank', label: 'Orange Room Wastewater Tank', subtype: 'wastewater_tank', type: 'waste', health: 'healthy', healthScore: 92, layer: 'waste', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-orange-room', provenance: 'documentary' },
  { id: 'maitri-mara-radar', label: 'MARA Atmospheric Radar', subtype: 'radar', type: 'instrument', health: 'healthy', healthScore: 93, layer: 'instrument', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-mara-radar-site', provenance: 'verified' },
  { id: 'maitri-magnetometer-1', label: 'Geomagnetism Lab Magnetometer', subtype: 'magnetometer', type: 'instrument', health: 'healthy', healthScore: 96, layer: 'instrument', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-geomagnetism-lab', provenance: 'verified' },
  { id: 'maitri-aws-1', label: 'Automatic Weather Station', subtype: 'aws', type: 'instrument', health: 'healthy', healthScore: 96, layer: 'instrument', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-garden-hut', provenance: 'verified' },
  { id: 'maitri-pistenbully-1', label: 'PistenBully 1', subtype: 'pistenbully', type: 'vehicle', health: 'degraded', healthScore: 74, layer: 'vehicle', dependencyCount: 0, incidents: 1, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-outdoor', provenance: 'verified' },
  { id: 'maitri-pistenbully-2', label: 'PistenBully 2', subtype: 'pistenbully', type: 'vehicle', health: 'healthy', healthScore: 89, layer: 'vehicle', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-outdoor', provenance: 'verified' },
  { id: 'maitri-ambulance', label: 'Ambulance', subtype: 'ambulance', type: 'vehicle', health: 'healthy', healthScore: 97, layer: 'vehicle', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-outdoor', provenance: 'verified' },
  { id: 'maitri-crane-1', label: 'Crane 1', subtype: 'crane', type: 'vehicle', health: 'healthy', healthScore: 91, layer: 'vehicle', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-outdoor', provenance: 'verified' },
  { id: 'maitri-comms-vsat', label: 'VSAT Satellite Link', subtype: 'vsat', type: 'comms', health: 'degraded', healthScore: 68, layer: 'comms', dependencyCount: 0, incidents: 1, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-main-building', provenance: 'verified' },
  { id: 'maitri-medical-bay', label: 'Medical Bay', subtype: 'infirmary', type: 'medical', health: 'healthy', healthScore: 90, layer: 'medical', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-hospital', provenance: 'verified' },
  { id: 'maitri-main-building', label: 'Main Station Building', subtype: 'building', type: 'structure', health: 'healthy', healthScore: 86, layer: 'structure', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'maitri', zoneId: 'maitri-main-building', provenance: 'documentary' },

  // ── Bharati (Larsemann Hills, East Antarctica) ────────────────────────────
  { id: 'bharati-chp-1', label: 'Combined Heat & Power Unit 1', subtype: 'chp', type: 'power', health: 'healthy', healthScore: 91, layer: 'power', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-chp-room', provenance: 'verified' },
  { id: 'bharati-chp-2', label: 'Combined Heat & Power Unit 2', subtype: 'chp', type: 'power', health: 'healthy', healthScore: 85, layer: 'power', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-chp-room', provenance: 'verified' },
  { id: 'bharati-fuel-farm-1', label: 'Fuel Farm Tank 1', subtype: 'fuel_tank', type: 'storage', health: 'healthy', healthScore: 95, layer: 'storage', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-ground-floor', provenance: 'verified' },
  { id: 'bharati-deep-freezer-1', label: 'Deep Freezer 1', subtype: 'freezer', type: 'storage', health: 'healthy', healthScore: 91, layer: 'storage', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-south-interspace', provenance: 'verified' },
  { id: 'bharati-ahu-1', label: 'Air Handling Unit 1', subtype: 'ahu', type: 'heating', health: 'degraded', healthScore: 76, layer: 'heating', dependencyCount: 0, incidents: 1, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-ahu-plant-room', provenance: 'verified' },
  { id: 'bharati-water-plant', label: 'Desalination Plant', subtype: 'desalination', type: 'water', health: 'healthy', healthScore: 89, layer: 'water', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-ground-floor', provenance: 'verified' },
  { id: 'bharati-black-water-tank', label: 'Black Water Tank', subtype: 'wastewater_tank', type: 'waste', health: 'healthy', healthScore: 85, layer: 'waste', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-wastewater-room', provenance: 'verified' },
  { id: 'bharati-grey-water-tank', label: 'Grey Water Tank', subtype: 'wastewater_tank', type: 'waste', health: 'healthy', healthScore: 90, layer: 'waste', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-wastewater-room', provenance: 'verified' },
  { id: 'bharati-imd-instrument', label: 'IMD Meteorology Instrument', subtype: 'aws', type: 'instrument', health: 'healthy', healthScore: 94, layer: 'instrument', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-imd-lab', provenance: 'verified' },
  { id: 'bharati-barc-instrument', label: 'BARC Radiation Monitor', subtype: 'radiation_monitor', type: 'instrument', health: 'healthy', healthScore: 97, layer: 'instrument', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-barc-lab', provenance: 'verified' },
  { id: 'bharati-gsi-instrument', label: 'GSI Geophysical Instrument', subtype: 'seismograph', type: 'instrument', health: 'degraded', healthScore: 65, layer: 'instrument', dependencyCount: 0, incidents: 1, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-gsi-lab', provenance: 'unverified' },
  { id: 'bharati-aws-1', label: 'Automatic Weather Station', subtype: 'aws', type: 'instrument', health: 'healthy', healthScore: 95, layer: 'instrument', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-terrace', provenance: 'verified' },
  { id: 'bharati-pistenbully-vitesta', label: 'PistenBully "Vitesta"', subtype: 'pistenbully', type: 'vehicle', health: 'healthy', healthScore: 90, layer: 'vehicle', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-south-interspace', provenance: 'verified' },
  { id: 'bharati-crane-1', label: 'Crane 1', subtype: 'crane', type: 'vehicle', health: 'healthy', healthScore: 88, layer: 'vehicle', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-garage', provenance: 'verified' },
  { id: 'bharati-ot', label: 'Operation Theatre', subtype: 'operation_theatre', type: 'medical', health: 'healthy', healthScore: 92, layer: 'medical', dependencyCount: 0, incidents: 0, lastSync: now, metadata: { restricted: true }, stationId: 'bharati', zoneId: 'bharati-operation-theatre', provenance: 'verified' },
  { id: 'bharati-medical-bay', label: 'Medical Bay', subtype: 'infirmary', type: 'medical', health: 'healthy', healthScore: 93, layer: 'medical', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-medical-room', provenance: 'verified' },
  { id: 'bharati-comms-vsat', label: 'VSAT Satellite Link', subtype: 'vsat', type: 'comms', health: 'healthy', healthScore: 95, layer: 'comms', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-communication-room', provenance: 'verified' },
  { id: 'bharati-main-building', label: 'Main Station Building', subtype: 'building', type: 'structure', health: 'healthy', healthScore: 89, layer: 'structure', dependencyCount: 0, incidents: 0, lastSync: now, metadata: {}, stationId: 'bharati', zoneId: 'bharati-ground-floor', provenance: 'documentary' },
  { id: 'bharati-satellite-control-room', label: 'Satellite Control Room', subtype: 'restricted_zone', type: 'structure', health: 'healthy', healthScore: 91, layer: 'structure', dependencyCount: 0, incidents: 0, lastSync: now, metadata: { restricted: true }, stationId: 'bharati', zoneId: 'bharati-satellite-control-room', provenance: 'documentary' },
]

export const mockEdges: GraphEdge[] = [
  // Maitri
  { id: 'm-e1', source: 'maitri-genset-1', target: 'maitri-fuel-farm-1', type: 'FUELED_BY', health: 'healthy' },
  { id: 'm-e2', source: 'maitri-genset-2', target: 'maitri-fuel-farm-2', type: 'FUELED_BY', health: 'degraded' },
  { id: 'm-e3', source: 'maitri-genset-3', target: 'maitri-fuel-farm-1', type: 'FUELED_BY', health: 'healthy' },
  { id: 'm-e4', source: 'maitri-heating-plant', target: 'maitri-genset-1', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'm-e5', source: 'maitri-water-plant', target: 'maitri-genset-1', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'm-e6', source: 'maitri-stp', target: 'maitri-genset-2', type: 'DEPENDS_ON', health: 'degraded' },
  { id: 'm-e7', source: 'maitri-orange-room-tank', target: 'maitri-stp', type: 'FEEDS', health: 'healthy' },
  { id: 'm-e8', source: 'maitri-deep-freezer-1', target: 'maitri-genset-1', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'm-e9', source: 'maitri-deep-freezer-2', target: 'maitri-genset-2', type: 'DEPENDS_ON', health: 'critical' },
  { id: 'm-e10', source: 'maitri-medical-bay', target: 'maitri-heating-plant', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'm-e11', source: 'maitri-medical-bay', target: 'maitri-genset-1', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'm-e12', source: 'maitri-comms-vsat', target: 'maitri-genset-2', type: 'DEPENDS_ON', health: 'degraded' },
  { id: 'm-e13', source: 'maitri-mara-radar', target: 'maitri-genset-2', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'm-e14', source: 'maitri-magnetometer-1', target: 'maitri-genset-2', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'm-e15', source: 'maitri-pistenbully-1', target: 'maitri-fuel-farm-1', type: 'FUELED_BY', health: 'healthy' },
  { id: 'm-e16', source: 'maitri-pistenbully-2', target: 'maitri-fuel-farm-1', type: 'FUELED_BY', health: 'healthy' },
  { id: 'm-e17', source: 'maitri-ambulance', target: 'maitri-fuel-farm-1', type: 'FUELED_BY', health: 'healthy' },
  { id: 'm-e18', source: 'maitri-crane-1', target: 'maitri-fuel-farm-2', type: 'FUELED_BY', health: 'healthy' },
  { id: 'm-e19', source: 'maitri-main-building', target: 'maitri-heating-plant', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'm-e20', source: 'maitri-main-building', target: 'maitri-genset-1', type: 'DEPENDS_ON', health: 'healthy' },

  // Bharati
  { id: 'b-e1', source: 'bharati-chp-1', target: 'bharati-fuel-farm-1', type: 'FUELED_BY', health: 'healthy' },
  { id: 'b-e2', source: 'bharati-chp-2', target: 'bharati-fuel-farm-1', type: 'FUELED_BY', health: 'healthy' },
  { id: 'b-e3', source: 'bharati-ahu-1', target: 'bharati-chp-1', type: 'DEPENDS_ON', health: 'degraded' },
  { id: 'b-e4', source: 'bharati-water-plant', target: 'bharati-chp-1', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'b-e5', source: 'bharati-black-water-tank', target: 'bharati-water-plant', type: 'FEEDS', health: 'healthy' },
  { id: 'b-e6', source: 'bharati-grey-water-tank', target: 'bharati-water-plant', type: 'FEEDS', health: 'healthy' },
  { id: 'b-e7', source: 'bharati-deep-freezer-1', target: 'bharati-chp-2', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'b-e8', source: 'bharati-ot', target: 'bharati-chp-1', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'b-e9', source: 'bharati-ot', target: 'bharati-ahu-1', type: 'DEPENDS_ON', health: 'degraded' },
  { id: 'b-e10', source: 'bharati-medical-bay', target: 'bharati-chp-1', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'b-e11', source: 'bharati-comms-vsat', target: 'bharati-chp-2', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'b-e12', source: 'bharati-imd-instrument', target: 'bharati-chp-2', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'b-e13', source: 'bharati-barc-instrument', target: 'bharati-chp-2', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'b-e14', source: 'bharati-gsi-instrument', target: 'bharati-chp-2', type: 'DEPENDS_ON', health: 'degraded' },
  { id: 'b-e15', source: 'bharati-pistenbully-vitesta', target: 'bharati-fuel-farm-1', type: 'FUELED_BY', health: 'healthy' },
  { id: 'b-e16', source: 'bharati-crane-1', target: 'bharati-fuel-farm-1', type: 'FUELED_BY', health: 'healthy' },
  { id: 'b-e17', source: 'bharati-main-building', target: 'bharati-chp-1', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'b-e18', source: 'bharati-main-building', target: 'bharati-ahu-1', type: 'DEPENDS_ON', health: 'degraded' },
  { id: 'b-e19', source: 'bharati-satellite-control-room', target: 'bharati-chp-2', type: 'DEPENDS_ON', health: 'healthy' },
  { id: 'b-e20', source: 'bharati-satellite-control-room', target: 'bharati-comms-vsat', type: 'DEPENDS_ON', health: 'healthy' },
]

export const mockNodes: GraphNode[] = rawNodes.map((n) => ({
  ...n,
  dependencyCount: computeDependencyLists(n.id, mockEdges).dependencies.length + computeDependencyLists(n.id, mockEdges).dependents.length,
  ...computeDependencyLists(n.id, mockEdges),
}))

export const mockLiveGraph: LiveGraphData = {
  nodes: mockNodes,
  edges: mockEdges,
  lastSync: new Date().toISOString(),
}
