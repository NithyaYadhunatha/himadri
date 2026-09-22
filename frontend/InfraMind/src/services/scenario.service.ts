// src/services/scenario.service.ts
//
// What-If Scenarios (station survivability modeling) — FastAPI's
// GET /scenarios/presets, POST /scenarios, GET /scenarios, GET /scenarios/{id},
// GET /scenarios/compare?ids=. Proxied through Next.js API routes under
// /api/scenarios/* (see src/app/api/scenarios/*) following the same
// membership + station-scoping pattern as /api/nodes/*, rather than calling
// FastAPI directly from the browser. Shapes here mirror
// backend/schemas/schemas.py's RunScenarioRequest/ScenarioDetail and
// backend/services/scenario_engine.py's run_scenario() output exactly —
// see that file for the day-stepper this mock's runMockScenario() below
// re-implements in miniature.
//
// Distinct from the old (removed) IT-topology blast-radius "Scenario
// Builder" — this is a parameter-based model of station survivability
// (fuel/food endurance, first-failure timing, cost, carbon) with a fixed set
// of presets plus custom overrides, not a freeform NL topology editor.

import { USE_MOCK } from '@/lib/constants'
import { mockInventory, STATION_ENERGY_CONTEXT, FOOD_KG_PER_PERSON_DAY } from '@/lib/mockData/mockLogistics'

export interface ScenarioPreset {
  id: string
  label: string
  description: string
}

export interface FuelDelivery {
  day: number
  litres: number
}

// generator_failure | convoy_stranded | medevac_convoy | storm_onset — the
// only types scenario_engine.py's day-stepper actually branches on.
export interface FailureEvent {
  day: number
  type: 'generator_failure' | 'convoy_stranded' | 'medevac_convoy' | 'storm_onset'
  duration_days?: number
}

export interface ScenarioInputs {
  headcount?: number
  generator_availability_pct?: number
  weather_severity?: number // 1-5
  fuel_delivery?: FuelDelivery | null
  failure_events?: FailureEvent[]
}

export interface RunScenarioInput {
  station_id: string
  name: string
  preset?: string | null
  horizon_days?: number
  inputs?: ScenarioInputs
  created_by?: string | null
}

export interface ScenarioCostBreakdown {
  fuel: number
  logistics: number
  spares: number
  avoided_failure: number
  total: number
}

export interface ScenarioTimelinePoint {
  day: number
  fuel_liters: number
  food_days_left: number
}

export interface ScenarioOutputs {
  fuel_endurance_days: number
  food_endurance_days: number
  power_adequacy: boolean
  heating_adequacy: boolean
  survivability_verdict: string
  first_failure_at_day: number | null
  first_failure_cause: string | null
  carbon_kg_co2e: number
  cost_inr: ScenarioCostBreakdown
  timeline: ScenarioTimelinePoint[]
  isolation_days_remaining: number
}

export interface ScenarioResult {
  id: string
  station_id: string
  name: string
  preset: string | null
  horizon_days: number
  inputs: ScenarioInputs
  status: string
  outputs: ScenarioOutputs | null
  fuel_endurance_days: number | null
  food_endurance_days: number | null
  survivability_verdict: string | null
  first_failure_at_day: number | null
  first_failure_cause: string | null
  cost_inr: number | null // total only — matches ScenarioDetail.cost_inr; the
  // breakdown lives at outputs.cost_inr.
  carbon_kg_co2e: number | null
  created_by: string | null
  created_at: string
  completed_at: string | null
}

const PRESET_DESCRIPTIONS: Record<string, string> = {
  resupply_fails: 'The annual resupply voyage is cancelled or delayed by a full season.',
  generator_fails_winter: 'The primary generator fails during peak winter isolation.',
  medical_evacuation: 'A medical emergency requires evacuation during the isolation window.',
  convoy_stranded: 'A field convoy is stranded en route between stations/depots.',
  extended_storm: 'A multi-week storm suppresses solar/wind input and grounds all vehicle movement.',
}

const MOCK_PRESETS: ScenarioPreset[] = [
  { id: 'resupply_fails', label: 'Resupply Ship Cannot Arrive', description: PRESET_DESCRIPTIONS.resupply_fails },
  { id: 'generator_fails_winter', label: 'Primary Generator Fails In Winter', description: PRESET_DESCRIPTIONS.generator_fails_winter },
  { id: 'medical_evacuation', label: 'Medical Evacuation During Isolation', description: PRESET_DESCRIPTIONS.medical_evacuation },
  { id: 'convoy_stranded', label: 'Convoy Stranded En Route', description: PRESET_DESCRIPTIONS.convoy_stranded },
  { id: 'extended_storm', label: 'Extended Katabatic Storm', description: PRESET_DESCRIPTIONS.extended_storm },
]

const MOCK_PRESET_INPUTS: Record<string, ScenarioInputs> = {
  resupply_fails: { headcount: 25, generator_availability_pct: 100, weather_severity: 2, fuel_delivery: null, failure_events: [] },
  generator_fails_winter: { headcount: 25, generator_availability_pct: 66, weather_severity: 3, fuel_delivery: null, failure_events: [{ day: 10, type: 'generator_failure' }] },
  medical_evacuation: { headcount: 24, generator_availability_pct: 100, weather_severity: 3, fuel_delivery: null, failure_events: [{ day: 5, type: 'medevac_convoy' }] },
  convoy_stranded: { headcount: 25, generator_availability_pct: 100, weather_severity: 4, fuel_delivery: null, failure_events: [{ day: 3, type: 'convoy_stranded' }] },
  extended_storm: { headcount: 25, generator_availability_pct: 85, weather_severity: 5, fuel_delivery: null, failure_events: [{ day: 7, type: 'storm_onset', duration_days: 14 }] },
}

// Cost model constants — mirrors scenario_engine.py's COST_PER_* so mock
// numbers land in the same ballpark as a real backend run.
const COST_PER_LITRE_ATF_INR = 120.0
const COST_PER_CONVOY_INR = 500_000.0
const COST_PER_SPARE_FAILURE_INR = 150_000.0
const COST_OF_UNMITIGATED_FAILURE_INR = 5_000_000.0
const EMISSION_FACTOR_ATF = 2.52 // kg CO2e per litre — matches backend/config.py's default

// Mock station starting context — derived from the SAME mockInventory rows
// the /energy and /logistics pages show (lib/mockData/mockLogistics.ts),
// not independently invented numbers, so a scenario run tells a story
// consistent with what a demo viewer already saw on those pages. This
// mirrors what the real backend's _build_context() does (pulls live fuel/
// food InventoryItem rows from Postgres — see routers/scenarios.py) —
// the frontend never sends infra state itself, only station_id/inputs; the
// backend (or, here, this mock) derives starting state on its own.
const MOCK_CONTEXT: Record<string, { fuelLiters: number; foodDays: number; baseBurnLph: number; isolationDaysRemaining: number }> = Object.fromEntries(
  Object.keys(STATION_ENERGY_CONTEXT).map((stationId) => {
    const ctx = STATION_ENERGY_CONTEXT[stationId]
    const fuelLiters = (mockInventory[stationId] ?? []).filter((i) => i.category === 'fuel').reduce((s, i) => s + i.quantity, 0)
    const foodKg = (mockInventory[stationId] ?? []).filter((i) => i.category === 'food').reduce((s, i) => s + i.quantity, 0)
    const foodDays = foodKg / (ctx.headcount * FOOD_KG_PER_PERSON_DAY)
    return [stationId, { fuelLiters, foodDays: Math.round(foodDays * 10) / 10, baseBurnLph: ctx.baseBurnLph, isolationDaysRemaining: 150 }]
  }),
)

// A compact re-implementation of scenario_engine.py's run_scenario() day-
// stepper — same formulas, so mock results respond to the same inputs the
// same way a live backend run would (not just a fixed canned result).
function runMockScenario(stationId: string, horizonDays: number, inputs: ScenarioInputs): ScenarioOutputs {
  const ctx = MOCK_CONTEXT[stationId] ?? MOCK_CONTEXT.maitri
  let fuelLiters = ctx.fuelLiters
  let foodDaysAvailable = ctx.foodDays
  const baseBurnLph = ctx.baseBurnLph
  const baselineHeadcount = STATION_ENERGY_CONTEXT[stationId]?.headcount ?? STATION_ENERGY_CONTEXT.maitri.headcount
  const headcount = inputs.headcount ?? baselineHeadcount
  const generatorAvailabilityPct = inputs.generator_availability_pct ?? 100
  let weatherSeverity = inputs.weather_severity ?? 1
  const fuelDelivery = inputs.fuel_delivery ?? null
  const failureEventsByDay = new Map((inputs.failure_events ?? []).map((e) => [e.day, e]))

  let activeFailureMultiplier = 1.0
  let fuelConvoysUsed = 0
  let spareFailures = 0
  let firstFailureDay: number | null = null
  let firstFailureCause: string | null = null
  const timeline: ScenarioTimelinePoint[] = []
  let totalFuelConsumed = 0

  for (let day = 0; day <= horizonDays; day++) {
    const event = failureEventsByDay.get(day)
    if (event) {
      if (event.type === 'generator_failure') {
        activeFailureMultiplier *= 1.35
        spareFailures += 1
      } else if (event.type === 'convoy_stranded' || event.type === 'medevac_convoy') {
        fuelConvoysUsed += 1
      } else if (event.type === 'storm_onset') {
        weatherSeverity = Math.max(weatherSeverity, 5)
      }
    }

    const weatherLoad = 1.0 + (weatherSeverity - 1) * 0.08
    const headcountLoad = 0.6 + 0.4 * (headcount / baselineHeadcount)
    const generatorLoad = 100.0 / Math.max(generatorAvailabilityPct, 1.0)

    const dailyBurnL = baseBurnLph * 24.0 * weatherLoad * headcountLoad * generatorLoad * activeFailureMultiplier
    fuelLiters -= dailyBurnL
    totalFuelConsumed += dailyBurnL
    foodDaysAvailable -= headcount / baselineHeadcount

    if (fuelDelivery && fuelDelivery.day === day) {
      fuelLiters += fuelDelivery.litres
    }

    if (day % 7 === 0 || day === horizonDays) {
      timeline.push({
        day,
        fuel_liters: Math.round(Math.max(fuelLiters, 0) * 10) / 10,
        food_days_left: Math.round(Math.max(foodDaysAvailable, 0) * 10) / 10,
      })
    }

    if (firstFailureDay === null) {
      if (fuelLiters <= 0) {
        firstFailureDay = day
        firstFailureCause = 'Fuel exhausted (generator + heating + vehicle load)'
      } else if (foodDaysAvailable <= 0) {
        firstFailureDay = day
        firstFailureCause = 'Food stock exhausted against headcount'
      }
    }
  }

  const fuelEnduranceDays = Math.round((ctx.fuelLiters / Math.max(baseBurnLph * 24.0, 1)) * 10) / 10
  const foodEnduranceDays = Math.max(
    Math.round((foodDaysAvailable + (horizonDays - (firstFailureDay ?? horizonDays))) * 10) / 10,
    0,
  )
  const survivabilityVerdict = firstFailureDay !== null ? 'fails' : 'survives'

  const carbonKg = Math.round(totalFuelConsumed * EMISSION_FACTOR_ATF * 10) / 10
  const fuelCost = Math.round(totalFuelConsumed * COST_PER_LITRE_ATF_INR)
  const logisticsCost = Math.round(fuelConvoysUsed * COST_PER_CONVOY_INR)
  const sparesCost = Math.round(spareFailures * COST_PER_SPARE_FAILURE_INR)
  const avoidedFailureCost = survivabilityVerdict === 'fails' ? COST_OF_UNMITIGATED_FAILURE_INR : 0
  const totalCost = fuelCost + logisticsCost + sparesCost + avoidedFailureCost

  return {
    fuel_endurance_days: fuelEnduranceDays,
    food_endurance_days: foodEnduranceDays,
    power_adequacy: generatorAvailabilityPct >= 60,
    heating_adequacy: generatorAvailabilityPct >= 50 && weatherSeverity < 5,
    survivability_verdict: survivabilityVerdict,
    first_failure_at_day: firstFailureDay,
    first_failure_cause: firstFailureCause,
    carbon_kg_co2e: carbonKg,
    cost_inr: { fuel: fuelCost, logistics: logisticsCost, spares: sparesCost, avoided_failure: avoidedFailureCost, total: totalCost },
    timeline,
    isolation_days_remaining: ctx.isolationDaysRemaining,
  }
}

let mockRunCounter = 0
const mockRuns: ScenarioResult[] = []

// Seed with a couple of past runs so /simulation isn't empty on first visit
// against mock data — same convention as /twin and /assets always having
// something to show without a backend (see lib/mockData/*).
function seedMockRuns() {
  const seeded = [
    buildMockResult({ station_id: 'maitri', name: 'Resupply Ship Cannot Arrive', preset: 'resupply_fails' }, 'mock-seed-1'),
    buildMockResult({ station_id: 'bharati', name: 'Primary Generator Fails In Winter', preset: 'generator_fails_winter' }, 'mock-seed-2'),
  ]
  seeded[0].created_at = new Date(Date.now() - 6 * 24 * 3600_000).toISOString()
  seeded[0].completed_at = seeded[0].created_at
  seeded[1].created_at = new Date(Date.now() - 2 * 24 * 3600_000).toISOString()
  seeded[1].completed_at = seeded[1].created_at
  mockRuns.push(...seeded)
}

function buildMockResult(input: RunScenarioInput, id: string): ScenarioResult {
  const horizonDays = input.horizon_days ?? 90
  const presetDefaults = input.preset ? MOCK_PRESET_INPUTS[input.preset] : undefined
  const inputs: ScenarioInputs = { ...presetDefaults, ...input.inputs }
  const outputs = runMockScenario(input.station_id, horizonDays, inputs)
  const now = new Date().toISOString()
  return {
    id,
    station_id: input.station_id,
    name: input.name || MOCK_PRESETS.find((p) => p.id === input.preset)?.label || 'Custom Scenario',
    preset: input.preset ?? null,
    horizon_days: horizonDays,
    inputs,
    status: 'completed',
    outputs,
    fuel_endurance_days: outputs.fuel_endurance_days,
    food_endurance_days: outputs.food_endurance_days,
    survivability_verdict: outputs.survivability_verdict,
    first_failure_at_day: outputs.first_failure_at_day,
    first_failure_cause: outputs.first_failure_cause,
    cost_inr: outputs.cost_inr.total,
    carbon_kg_co2e: outputs.carbon_kg_co2e,
    created_by: input.created_by ?? 'Dev Tester',
    created_at: now,
    completed_at: now,
  }
}

if (USE_MOCK) seedMockRuns()

export const scenarioService = {
  getPresets: async (): Promise<ScenarioPreset[]> => {
    if (USE_MOCK) return Promise.resolve(MOCK_PRESETS)
    const res = await fetch('/api/scenarios/presets')
    if (!res.ok) throw new Error(`Failed to load scenario presets (${res.status})`)
    // Backend returns {preset_id: label} — no description, so pair with the
    // curated ones above (kept in sync with scenario_engine.py's five
    // presets; an unrecognised id just gets no description, not an error).
    const raw = (await res.json()) as Record<string, string>
    return Object.entries(raw).map(([id, label]) => ({ id, label, description: PRESET_DESCRIPTIONS[id] ?? '' }))
  },

  run: async (input: RunScenarioInput): Promise<ScenarioResult> => {
    if (USE_MOCK) {
      const result = buildMockResult(input, `mock-scenario-${++mockRunCounter}`)
      mockRuns.unshift(result)
      return Promise.resolve(result)
    }
    const res = await fetch('/api/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `Scenario run failed (${res.status})`)
    }
    return res.json()
  },

  list: async (station?: string): Promise<ScenarioResult[]> => {
    if (USE_MOCK) {
      return Promise.resolve(station ? mockRuns.filter((r) => r.station_id === station) : mockRuns)
    }
    const qs = station ? `?station=${encodeURIComponent(station)}` : ''
    const res = await fetch(`/api/scenarios${qs}`)
    if (!res.ok) throw new Error(`Failed to load scenarios (${res.status})`)
    return res.json()
  },

  get: async (id: string): Promise<ScenarioResult> => {
    if (USE_MOCK) {
      const found = mockRuns.find((r) => r.id === id)
      if (found) return Promise.resolve(found)
      return Promise.resolve(buildMockResult({ station_id: 'maitri', name: 'Scenario' }, id))
    }
    const res = await fetch(`/api/scenarios/${encodeURIComponent(id)}`)
    if (!res.ok) throw new Error(`Failed to load scenario (${res.status})`)
    return res.json()
  },

  compare: async (ids: string[]): Promise<ScenarioResult[]> => {
    if (USE_MOCK) {
      return Promise.resolve(
        ids.map((id) => mockRuns.find((r) => r.id === id) ?? buildMockResult({ station_id: 'maitri', name: 'Scenario' }, id)),
      )
    }
    const res = await fetch(`/api/scenarios/compare?ids=${ids.map(encodeURIComponent).join(',')}`)
    if (!res.ok) throw new Error(`Failed to compare scenarios (${res.status})`)
    return res.json()
  },
}
