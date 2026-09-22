// src/lib/mockData/mockPassport.ts
//
// Frontend-only fallback for the QR Asset Passport page
// (/assets/[id]/passport), gated by NEXT_PUBLIC_USE_MOCK. Full passport
// detail for a handful of representative mockGraph.ts assets; any other
// asset id falls back to a generic passport built from its mockNodes entry
// (see buildFallbackPassport in passport.service.ts) so every asset in the
// twin/assets list has a passport page that renders, not just the curated
// few below.
import type { AssetPassport } from '@/services/passport.service'

const hoursAgo = (n: number) => new Date(Date.now() - n * 3600_000).toISOString()
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600_000).toISOString()

function telemetryHistory(key: string, base: number, variance: number, count = 24): AssetPassport['telemetry_history'] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: hoursAgo(count - i),
    values: { [key]: Math.round((base + (Math.random() - 0.5) * variance) * 10) / 10 },
  }))
}

export const mockPassports: Record<string, AssetPassport> = {
  'maitri-genset-1': {
    id: 'maitri-genset-1',
    name: 'Diesel Generator 1',
    category: 'power',
    subtype: 'generator',
    station_id: 'maitri',
    zone_id: 'maitri-main-building',
    status: 'ok',
    health_score: 88,
    provenance: 'verified',
    identity: { manufacturer: 'Cummins', model: 'NTA-855-G', rated_kw: 62.5, commissioned: '2019-02-11', serial: 'CMN-NTA855-0114' },
    telemetry_history: telemetryHistory('power_kw', 48, 10),
    maintenance_log: [
      { id: 'm1', type: 'service', description: '500-hour service — oil, filters, belt inspection', logged_by: 'Engineer', logged_at: daysAgo(40) },
      { id: 'm2', type: 'inspection', description: 'Load-bank test at 100% rated capacity', logged_by: 'Engineer', logged_at: daysAgo(95) },
    ],
  },
  'maitri-deep-freezer-2': {
    id: 'maitri-deep-freezer-2',
    name: 'Deep Freezer 2',
    category: 'storage',
    subtype: 'freezer',
    station_id: 'maitri',
    zone_id: 'maitri-kitchen',
    status: 'simulating',
    health_score: 41,
    provenance: 'verified',
    identity: { manufacturer: 'Polar King', model: 'PK-DF800', capacity_l: 800, commissioned: '2017-03-04', serial: 'PK-DF800-0037' },
    telemetry_history: telemetryHistory('temp_c', -12, 6),
    maintenance_log: [
      { id: 'm1', type: 'fault', description: 'Internal temperature alarm — compressor short-cycling observed', logged_by: 'Engineer', logged_at: hoursAgo(3) },
      { id: 'm2', type: 'service', description: 'Door seal replaced', logged_by: 'Engineer', logged_at: daysAgo(200) },
    ],
  },
  'bharati-chp-1': {
    id: 'bharati-chp-1',
    name: 'Combined Heat & Power Unit 1',
    category: 'power',
    subtype: 'chp',
    station_id: 'bharati',
    zone_id: 'bharati-chp-room',
    status: 'ok',
    health_score: 91,
    provenance: 'verified',
    identity: { manufacturer: 'MAN', model: 'CHP-2000', rated_kw: 200, commissioned: '2020-11-02', serial: 'MAN-CHP2000-0022' },
    telemetry_history: telemetryHistory('power_kw', 140, 20),
    maintenance_log: [
      { id: 'm1', type: 'service', description: 'Annual overhaul — heat exchanger descaled', logged_by: 'Engineer', logged_at: daysAgo(60) },
    ],
  },
  'bharati-ahu-1': {
    id: 'bharati-ahu-1',
    name: 'Air Handling Unit 1',
    category: 'heating',
    subtype: 'ahu',
    station_id: 'bharati',
    zone_id: 'bharati-ahu-plant-room',
    status: 'degraded',
    health_score: 76,
    provenance: 'verified',
    identity: { manufacturer: 'Systemair', model: 'Topvex TR15', commissioned: '2018-06-20', serial: 'SYS-TR15-0091' },
    telemetry_history: telemetryHistory('filter_dp_pa', 280, 60),
    maintenance_log: [
      { id: 'm1', type: 'inspection', description: 'Filter differential pressure trending above baseline — flagged for replacement', logged_by: 'Engineer', logged_at: daysAgo(2) },
    ],
  },
}
