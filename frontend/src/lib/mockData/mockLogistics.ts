// src/lib/mockData/mockLogistics.ts
//
// Frontend-only fallback for the Energy & Logistics Supply Chain page
// (inventory, endurance, vehicles, convoys), gated by NEXT_PUBLIC_USE_MOCK.
// Inventory quantities/capacities mirror the real seed
// (backend/scripts/seed_himadri_demo.py's INVENTORY_ITEMS) scaled into this
// frontend's InventoryItem shape; vehicles/convoys are a plausible subset
// matching mockGraph.ts's vehicle assets.
import type { InventoryItem, EnduranceProjection, Vehicle, Convoy } from '@/services/logistics.service'

const now = new Date().toISOString()
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600_000).toISOString()

export const mockInventory: Record<string, InventoryItem[]> = {
  maitri: [
    { id: 'maitri-inventory-fuel-routine', station_id: 'maitri', category: 'fuel', name: 'Fuel Farm — Routine Stock', unit: 'L', quantity: 82_000, reorder_threshold: 25_000, last_counted_at: daysAgo(2) },
    { id: 'maitri-inventory-fuel-emergency-cache', station_id: 'maitri', category: 'fuel', name: 'Emergency Fuel Caches (Sankalp + Ship Transfer)', unit: 'L', quantity: 40_000, reorder_threshold: 15_000, last_counted_at: daysAgo(14) },
    { id: 'maitri-inventory-fuel-safety-buffer', station_id: 'maitri', category: 'fuel', name: 'Safety Buffer Tanks', unit: 'L', quantity: 3_800, reorder_threshold: 2_000, last_counted_at: daysAgo(2) },
    { id: 'maitri-inventory-food-dry', station_id: 'maitri', category: 'food', name: 'Dry Rations', unit: 'kg', quantity: 48_000, reorder_threshold: 15_000, last_counted_at: daysAgo(5) },
    { id: 'maitri-inventory-food-frozen', station_id: 'maitri', category: 'food', name: 'Frozen Rations', unit: 'kg', quantity: 21_000, reorder_threshold: 8_000, last_counted_at: daysAgo(5) },
    { id: 'maitri-inventory-spare-pistenbully-tracks', station_id: 'maitri', category: 'spare', name: 'PistenBully Track Spares', unit: 'set', quantity: 4, reorder_threshold: 2, last_counted_at: daysAgo(30) },
    { id: 'maitri-inventory-spare-generator-filters', station_id: 'maitri', category: 'spare', name: 'Generator Fuel Filters', unit: 'pcs', quantity: 24, reorder_threshold: 8, last_counted_at: daysAgo(30) },
  ],
  bharati: [
    { id: 'bharati-inventory-fuel-routine', station_id: 'bharati', category: 'fuel', name: 'Fuel Farm — Routine Stock', unit: 'L', quantity: 30_000, reorder_threshold: 10_000, last_counted_at: daysAgo(3) },
    { id: 'bharati-inventory-fuel-safety-buffer', station_id: 'bharati', category: 'fuel', name: 'Safety Buffer Stock', unit: 'L', quantity: 1_800, reorder_threshold: 1_000, last_counted_at: daysAgo(3) },
    { id: 'bharati-inventory-food-dry', station_id: 'bharati', category: 'food', name: 'Dry Rations', unit: 'kg', quantity: 44_000, reorder_threshold: 14_000, last_counted_at: daysAgo(6) },
    { id: 'bharati-inventory-food-frozen', station_id: 'bharati', category: 'food', name: 'Frozen Rations', unit: 'kg', quantity: 19_000, reorder_threshold: 7_000, last_counted_at: daysAgo(6) },
    { id: 'bharati-inventory-spare-pistenbully-tracks', station_id: 'bharati', category: 'spare', name: 'PistenBully Track Spares', unit: 'set', quantity: 2, reorder_threshold: 2, last_counted_at: daysAgo(20) },
    { id: 'bharati-inventory-spare-chp-parts', station_id: 'bharati', category: 'spare', name: 'CHP Spare Parts Kit', unit: 'kit', quantity: 3, reorder_threshold: 1, last_counted_at: daysAgo(20) },
  ],
}

// Same base-burn-rate/emission-factor constants scenario_engine.py's
// run_scenario() uses (see backend/services/scenario_engine.py and this
// frontend's scenario.service.ts mock port) — kept here too so the
// Energy page's endurance/carbon figures and the Simulation page's mock
// scenario runs tell the same story instead of each inventing its own
// numbers. headcount is each station's real winter/summer crew size
// (backend/scripts/seed_himadri_demo.py's Station rows).
export const STATION_ENERGY_CONTEXT: Record<string, { headcount: number; baseBurnLph: number }> = {
  maitri: { headcount: 25, baseBurnLph: 27 },
  bharati: { headcount: 24, baseBurnLph: 24 },
}
const EMISSION_FACTOR_ATF_KG_PER_L = 2.52
// The real backend's _build_context() (routers/scenarios.py) literally uses
// `food_days_available = sum(item.quantity)` with no per-person-day
// conversion — a known simplification in ITS OWN model that, applied to
// this seed's bulk kg totals, produces a "tens of thousands of days"
// number with no real-world meaning. Rather than faithfully reproduce a
// backend quirk that would make the Energy page look broken, this mock
// converts kg to person-days at a plausible ~3 kg/person/day (packaging +
// variety included) — landing food endurance in the same "~2 years' stock"
// ballpark the real seed data's own comments describe, while still being
// entirely derived from mockInventory's real quantities, not invented.
export const FOOD_KG_PER_PERSON_DAY = 3

function sumByCategory(stationId: string, category: string): number {
  return (mockInventory[stationId] ?? []).filter((i) => i.category === category).reduce((sum, i) => sum + i.quantity, 0)
}

export const mockEndurance: Record<string, EnduranceProjection> = Object.fromEntries(
  Object.keys(STATION_ENERGY_CONTEXT).map((stationId) => {
    const ctx = STATION_ENERGY_CONTEXT[stationId]
    const fuelLiters = sumByCategory(stationId, 'fuel')
    const foodKg = sumByCategory(stationId, 'food')
    const fuelDays = Math.round((fuelLiters / (ctx.baseBurnLph * 24)) * 10) / 10
    const foodDays = Math.round((foodKg / (ctx.headcount * FOOD_KG_PER_PERSON_DAY)) * 10) / 10
    return [stationId, { station: stationId, fuel_days_remaining: fuelDays, food_days_remaining: foodDays, computed_at: now }]
  }),
)

/** Rough steady-state daily carbon output (kg CO2e/day) from the station's
 * baseline fuel burn — same emission factor scenario_engine.py uses. */
export function mockDailyCarbonKg(stationId: string): number {
  const ctx = STATION_ENERGY_CONTEXT[stationId] ?? STATION_ENERGY_CONTEXT.maitri
  return Math.round(ctx.baseBurnLph * 24 * EMISSION_FACTOR_ATF_KG_PER_L)
}

export const mockVehicles: Record<string, Vehicle[]> = {
  maitri: [
    { id: 'maitri-vehicle-pistenbully-1', station_id: 'maitri', name: 'PistenBully 1', vehicle_type: 'pistenbully', status: 'degraded', fuel_level_percent: 62, run_hours: 6400 },
    { id: 'maitri-vehicle-pistenbully-2', station_id: 'maitri', name: 'PistenBully 2', vehicle_type: 'pistenbully', status: 'ok', fuel_level_percent: 88, run_hours: 5100 },
    { id: 'maitri-vehicle-ambulance', station_id: 'maitri', name: 'Ambulance', vehicle_type: 'ambulance', status: 'ok', fuel_level_percent: 95, run_hours: 1200 },
    { id: 'maitri-vehicle-crane-1', station_id: 'maitri', name: 'Crane 1', vehicle_type: 'crane', status: 'ok', fuel_level_percent: 71, run_hours: 3300 },
  ],
  bharati: [
    { id: 'bharati-vehicle-pistenbully-vitesta', station_id: 'bharati', name: 'PistenBully "Vitesta"', vehicle_type: 'pistenbully', status: 'ok', fuel_level_percent: 90, run_hours: 4100 },
    { id: 'bharati-vehicle-crane-1', station_id: 'bharati', name: 'Crane 1', vehicle_type: 'crane', status: 'ok', fuel_level_percent: 66, run_hours: 2800 },
  ],
}

export const mockConvoys: Record<string, Convoy[]> = {
  maitri: [
    {
      id: 'maitri-convoy-sankalp-resupply',
      station_id: 'maitri',
      name: 'Sankalp Cache Resupply',
      status: 'planned',
      vehicle_ids: ['maitri-vehicle-pistenbully-1'],
      members: [{ name: 'A. Rao', role: 'Convoy Lead' }],
      has_medical_officer: false,
      has_ambulance_escort: false,
      departed_at: null,
      created_at: daysAgo(3),
    },
    {
      id: 'maitri-convoy-fuel-station-run',
      station_id: 'maitri',
      name: 'Fuel Station Run',
      status: 'underway',
      vehicle_ids: ['maitri-vehicle-pistenbully-2', 'maitri-vehicle-ambulance'],
      members: [
        { name: 'S. Iyer', role: 'Convoy Lead' },
        { name: 'Dr. Mehta', role: 'Medical Officer' },
      ],
      has_medical_officer: true,
      has_ambulance_escort: true,
      departed_at: daysAgo(1),
      created_at: daysAgo(4),
    },
  ],
  bharati: [
    {
      id: 'bharati-convoy-larsemann-survey',
      station_id: 'bharati',
      name: 'Larsemann Hills Survey Run',
      status: 'planned',
      vehicle_ids: ['bharati-vehicle-pistenbully-vitesta'],
      members: [{ name: 'K. Nair', role: 'Convoy Lead' }],
      has_medical_officer: false,
      has_ambulance_escort: false,
      departed_at: null,
      created_at: daysAgo(2),
    },
  ],
}
