// src/lib/mockData/mockZones.ts
//
// Frontend-only fallback zone list (gated by NEXT_PUBLIC_USE_MOCK), mirroring
// the real zone structure from the Python backend's authoritative
// scripts/seed_himadri_demo.py: Bharati is 4 real floors (Ground/1st "Master
// Station"/2nd "Living Quarters"/3rd AHU+Terrace); Maitri is one main
// building (no floors) plus a cluster of outdoor facilities. Trimmed to the
// zones actually referenced by mockGraph.ts's assets — the real seed has
// many more rooms per floor than this frontend-only subset needs.
import type { ZoneMeta } from '@/types/graph'

export const mockZones: ZoneMeta[] = [
  // ── Maitri ────────────────────────────────────────────────────────────────
  { id: 'maitri-main-building', stationId: 'maitri', parentId: null, name: 'Main Building', kind: 'module', floor: 0, restricted: false },
  { id: 'maitri-outdoor', stationId: 'maitri', parentId: null, name: 'Outdoor Facilities', kind: 'outdoor', floor: null, restricted: false },

  { id: 'maitri-kitchen', stationId: 'maitri', parentId: 'maitri-main-building', name: 'Kitchen', kind: 'room', floor: 0, restricted: false },
  { id: 'maitri-hospital', stationId: 'maitri', parentId: 'maitri-main-building', name: 'Maitri Hospital', kind: 'room', floor: 0, restricted: false },
  { id: 'maitri-orange-room', stationId: 'maitri', parentId: 'maitri-main-building', name: 'Orange Room (Wastewater)', kind: 'room', floor: 0, restricted: false },
  { id: 'maitri-kuber-waste-area', stationId: 'maitri', parentId: 'maitri-main-building', name: 'Kuber Waste Area', kind: 'room', floor: 0, restricted: false },

  { id: 'maitri-fuel-farm', stationId: 'maitri', parentId: 'maitri-outdoor', name: 'Fuel Farm', kind: 'outdoor', floor: null, restricted: false },
  { id: 'maitri-garden-hut', stationId: 'maitri', parentId: 'maitri-outdoor', name: 'Garden Hut', kind: 'outdoor', floor: null, restricted: false },
  { id: 'maitri-geomagnetism-lab', stationId: 'maitri', parentId: 'maitri-outdoor', name: 'Geomagnetism Lab', kind: 'module', floor: null, restricted: false },
  { id: 'maitri-mara-radar-site', stationId: 'maitri', parentId: 'maitri-outdoor', name: 'MARA Radar Site', kind: 'outdoor', floor: null, restricted: false },

  // ── Bharati ───────────────────────────────────────────────────────────────
  { id: 'bharati-ground-floor', stationId: 'bharati', parentId: null, name: 'Ground Floor', kind: 'floor', floor: 0, restricted: false },
  { id: 'bharati-1st-floor', stationId: 'bharati', parentId: null, name: '1st Floor (Master Station)', kind: 'floor', floor: 1, restricted: false },
  { id: 'bharati-2nd-floor', stationId: 'bharati', parentId: null, name: '2nd Floor', kind: 'floor', floor: 2, restricted: false },
  { id: 'bharati-3rd-floor', stationId: 'bharati', parentId: null, name: '3rd Floor', kind: 'floor', floor: 3, restricted: false },

  { id: 'bharati-chp-room', stationId: 'bharati', parentId: 'bharati-ground-floor', name: 'CHP / Generator Room', kind: 'room', floor: 0, restricted: false },
  { id: 'bharati-garage', stationId: 'bharati', parentId: 'bharati-ground-floor', name: 'Garage', kind: 'room', floor: 0, restricted: false },
  { id: 'bharati-wastewater-room', stationId: 'bharati', parentId: 'bharati-ground-floor', name: 'Wastewater Room', kind: 'room', floor: 0, restricted: false },
  { id: 'bharati-imd-lab', stationId: 'bharati', parentId: 'bharati-ground-floor', name: 'IMD Lab', kind: 'room', floor: 0, restricted: false },
  { id: 'bharati-barc-lab', stationId: 'bharati', parentId: 'bharati-ground-floor', name: 'BARC Lab', kind: 'room', floor: 0, restricted: false },
  { id: 'bharati-gsi-lab', stationId: 'bharati', parentId: 'bharati-ground-floor', name: 'GSI Lab', kind: 'room', floor: 0, restricted: false },

  { id: 'bharati-south-interspace', stationId: 'bharati', parentId: 'bharati-1st-floor', name: 'South Interspace', kind: 'room', floor: 1, restricted: false },
  { id: 'bharati-communication-room', stationId: 'bharati', parentId: 'bharati-1st-floor', name: 'Communication Room', kind: 'room', floor: 1, restricted: false },
  { id: 'bharati-satellite-control-room', stationId: 'bharati', parentId: 'bharati-1st-floor', name: 'Satellite Control Room', kind: 'room', floor: 1, restricted: true },

  { id: 'bharati-operation-theatre', stationId: 'bharati', parentId: 'bharati-2nd-floor', name: 'Operation Theatre', kind: 'room', floor: 2, restricted: true },
  { id: 'bharati-medical-room', stationId: 'bharati', parentId: 'bharati-2nd-floor', name: 'Medical Room', kind: 'room', floor: 2, restricted: false },

  { id: 'bharati-ahu-plant-room', stationId: 'bharati', parentId: 'bharati-3rd-floor', name: 'AHU Plant Room', kind: 'room', floor: 3, restricted: false },
  { id: 'bharati-terrace', stationId: 'bharati', parentId: 'bharati-3rd-floor', name: 'Terrace', kind: 'outdoor', floor: 3, restricted: false },
]
