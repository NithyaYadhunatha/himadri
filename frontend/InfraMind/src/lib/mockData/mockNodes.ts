// src/lib/mockData/mockNodes.ts
//
// Frontend-only fallback NodeHealth list (gated by NEXT_PUBLIC_USE_MOCK) for
// the /assets page — mirrors the same Maitri/Bharati asset set as
// mockGraph.ts but shaped for the flat asset-health list/grid view rather
// than the graph.

import type { NodeHealth, NodeSummary } from '@/types/nodes'

function genSparkline(base: number, variance: number, count = 24) {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(Date.now() - (count - i) * 3600000).toISOString(),
    value: Math.max(0, Math.min(100, base + (Math.random() - 0.5) * variance * 2)),
  }))
}

export const mockNodeSummary: NodeSummary = {
  total: 40,
  critical: 2,
  atRisk: 6,
  healthy: 30,
  unreachable: 2,
  averageHealthScore: 84.6,
  lastUpdated: new Date().toISOString(),
}

export const mockNodes: NodeHealth[] = [
  {
    id: 'maitri-genset-1', name: 'Diesel Generator 1', type: 'power', version: 'Cummins NTA-855-G',
    health: 'healthy', healthScore: 88, incidents: 0, lastSync: '2026-09-20T06:10:00Z', uptime: 18420 * 3600,
    stationId: 'maitri', tags: ['power-house'], trend: genSparkline(88, 6),
    alerts: [],
  },
  {
    id: 'maitri-genset-2', name: 'Diesel Generator 2', type: 'power', version: 'Cummins NTA-855-G',
    health: 'degraded', healthScore: 62, incidents: 1, lastSync: '2026-09-20T06:05:00Z', uptime: 24310 * 3600,
    stationId: 'maitri', tags: ['power-house'], trend: genSparkline(62, 12),
    alerts: [{ id: 'a1', message: 'Load factor trending above 85% for 3 hours', severity: 'warning', timestamp: '2026-09-20T03:00:00Z' }],
  },
  {
    id: 'maitri-deep-freezer-2', name: 'Deep Freezer 2', type: 'storage', version: '—',
    health: 'critical', healthScore: 41, incidents: 2, lastSync: '2026-09-20T06:12:00Z', uptime: 0,
    stationId: 'maitri', tags: ['main-building'], trend: genSparkline(41, 15),
    alerts: [
      { id: 'a2', message: 'Internal temperature risen to -8°C (setpoint -18°C)', severity: 'critical', timestamp: '2026-09-20T05:40:00Z' },
      { id: 'a3', message: 'Compressor runtime at 100% for 2 hours', severity: 'critical', timestamp: '2026-09-20T04:50:00Z' },
    ],
  },
  {
    id: 'maitri-stp', name: 'Sewage Treatment Plant', type: 'waste', version: 'Aquarius Bio-40',
    health: 'degraded', healthScore: 79, incidents: 0, lastSync: '2026-09-20T05:50:00Z', uptime: 41000 * 3600,
    stationId: 'maitri', tags: ['utility-block'], trend: genSparkline(79, 8),
    alerts: [],
  },
  {
    id: 'maitri-heating-plant', name: 'Central Heating Plant', type: 'heating', version: 'Viessmann Vitomax 200-HW',
    health: 'healthy', healthScore: 84, incidents: 0, lastSync: '2026-09-20T06:00:00Z', uptime: 52000 * 3600,
    stationId: 'maitri', tags: ['main-building'], trend: genSparkline(84, 6),
    alerts: [],
  },
  {
    id: 'maitri-water-plant', name: 'Snow-Melt Water Plant', type: 'water', version: 'Genesis RO-5000',
    health: 'healthy', healthScore: 82, incidents: 0, lastSync: '2026-09-20T06:00:00Z', uptime: 61000 * 3600,
    stationId: 'maitri', tags: ['utility-block'], trend: genSparkline(82, 6),
    alerts: [],
  },
  {
    id: 'maitri-comms-vsat', name: 'VSAT Satellite Link', type: 'comms', version: 'Hughes HX200',
    health: 'degraded', healthScore: 68, incidents: 1, lastSync: '2026-09-20T06:14:00Z', uptime: 30000 * 3600,
    stationId: 'maitri', tags: ['comms-room'], trend: genSparkline(68, 14),
    alerts: [{ id: 'a4', message: 'Link degraded to PNR-isolated during snow squall', severity: 'warning', timestamp: '2026-09-19T21:00:00Z' }],
  },
  {
    id: 'maitri-pistenbully-1', name: 'PistenBully 1', type: 'vehicle', version: 'Kassbohrer PB300',
    health: 'degraded', healthScore: 74, incidents: 1, lastSync: '2026-09-19T18:00:00Z', uptime: 6400 * 3600,
    stationId: 'maitri', tags: ['vehicle-yard'], trend: genSparkline(74, 10),
    alerts: [{ id: 'a5', message: 'Cold-start coolant fault code read via Mini-Doc connector', severity: 'warning', timestamp: '2026-09-05T08:40:00Z' }],
  },
  {
    id: 'maitri-mara-radar', name: 'MARA Atmospheric Radar', type: 'instrument', version: 'NCPOR MST-band',
    health: 'healthy', healthScore: 93, incidents: 0, lastSync: '2026-09-20T06:15:00Z', uptime: 0,
    stationId: 'maitri', tags: ['geomag-lab'], trend: genSparkline(93, 4),
    alerts: [],
  },
  {
    id: 'maitri-medical-bay', name: 'Medical Bay', type: 'medical', version: '—',
    health: 'healthy', healthScore: 90, incidents: 0, lastSync: '2026-09-20T05:00:00Z', uptime: 0,
    stationId: 'maitri', tags: ['main-building'], trend: genSparkline(90, 3),
    alerts: [],
  },
  {
    id: 'maitri-main-building', name: 'Main Station Building', type: 'structure', version: '—',
    health: 'healthy', healthScore: 86, incidents: 0, lastSync: '2026-09-20T00:00:00Z', uptime: 0,
    stationId: 'maitri', tags: ['main-building'], trend: genSparkline(86, 3),
    alerts: [],
  },
  {
    id: 'bharati-chp-1', name: 'Combined Heat & Power Unit 1', type: 'power', version: 'MAN CHP-2000',
    health: 'healthy', healthScore: 91, incidents: 0, lastSync: '2026-09-20T06:10:00Z', uptime: 9840 * 3600,
    stationId: 'bharati', tags: ['power-house'], trend: genSparkline(91, 4),
    alerts: [],
  },
  {
    id: 'bharati-chp-2', name: 'Combined Heat & Power Unit 2', type: 'power', version: 'MAN CHP-2000',
    health: 'healthy', healthScore: 85, incidents: 0, lastSync: '2026-09-20T06:08:00Z', uptime: 8100 * 3600,
    stationId: 'bharati', tags: ['power-house'], trend: genSparkline(85, 5),
    alerts: [],
  },
  {
    id: 'bharati-ahu-1', name: 'Air Handling Unit 1', type: 'heating', version: 'Systemair Topvex TR15',
    health: 'degraded', healthScore: 76, incidents: 1, lastSync: '2026-09-20T06:00:00Z', uptime: 12000 * 3600,
    stationId: 'bharati', tags: ['main-building'], trend: genSparkline(76, 10),
    alerts: [{ id: 'a6', message: 'Filter differential pressure trending above baseline', severity: 'warning', timestamp: '2026-09-16T14:00:00Z' }],
  },
  {
    id: 'bharati-gsi-instrument', name: 'GSI Geophysical Instrument', type: 'instrument', version: 'Seismograph',
    health: 'degraded', healthScore: 65, incidents: 1, lastSync: '2026-09-20T05:30:00Z', uptime: 0,
    stationId: 'bharati', tags: ['science-lab'], trend: genSparkline(65, 12),
    alerts: [{ id: 'a7', message: 'Data continuity dropped below 90% in the last 24h', severity: 'warning', timestamp: '2026-09-19T22:00:00Z' }],
  },
  {
    id: 'bharati-ot', name: 'Operation Theatre', type: 'medical', version: '—',
    health: 'healthy', healthScore: 92, incidents: 0, lastSync: '2026-09-20T04:00:00Z', uptime: 0,
    stationId: 'bharati', tags: ['main-building'], trend: genSparkline(92, 3),
    alerts: [],
  },
  {
    id: 'bharati-comms-vsat', name: 'VSAT Satellite Link', type: 'comms', version: 'Hughes HX200',
    health: 'healthy', healthScore: 95, incidents: 0, lastSync: '2026-09-20T06:15:00Z', uptime: 20000 * 3600,
    stationId: 'bharati', tags: ['comms-room'], trend: genSparkline(95, 3),
    alerts: [],
  },
  {
    id: 'bharati-pistenbully-vitesta', name: 'PistenBully "Vitesta"', type: 'vehicle', version: 'Kassbohrer PB300',
    health: 'healthy', healthScore: 90, incidents: 0, lastSync: '2026-09-19T17:00:00Z', uptime: 4100 * 3600,
    stationId: 'bharati', tags: ['vehicle-yard'], trend: genSparkline(90, 4),
    alerts: [],
  },
  {
    id: 'bharati-main-building', name: 'Main Station Building', type: 'structure', version: '—',
    health: 'healthy', healthScore: 89, incidents: 0, lastSync: '2026-09-20T00:00:00Z', uptime: 0,
    stationId: 'bharati', tags: ['main-building'], trend: genSparkline(89, 3),
    alerts: [],
  },
  {
    id: 'bharati-satellite-control-room', name: 'Satellite Control Room', type: 'structure', version: '—',
    health: 'healthy', healthScore: 91, incidents: 0, lastSync: '2026-09-20T00:00:00Z', uptime: 0,
    stationId: 'bharati', tags: ['sat-control'], trend: genSparkline(91, 3),
    alerts: [],
  },
]
