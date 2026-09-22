// src/lib/nlScenarioParser.ts
//
// Natural-language → scenario-builder heuristic for the Simulation page's
// chat box. Deliberately NOT an LLM call: this environment can't guarantee
// an OPENAI_API_KEY/GEMINI_API_KEY or a reachable FastAPI backend (the same
// /api/chat/mcp route the floating Operations Agent uses would need both —
// see its header comment), so a keyword/regex parser that reliably works
// offline was the more honest choice than a "sometimes works" LLM path for
// a feature demonstrated locally. It recognizes the same five presets
// scenario_engine.py defines, plus custom headcount/weather/generator/
// fuel-delivery/failure-event phrasing, and falls back to a sensible
// custom scenario when nothing matches a preset.

import type { FailureEvent, ScenarioInputs } from '@/services/scenario.service'

export interface ParsedScenario {
  mode: 'preset' | 'custom'
  preset: string | null
  inputs: ScenarioInputs
  horizonDays: number
  name: string
  /** Human-readable bullet points describing what was parsed, shown as the
   * chat assistant's reply so the user can see (and correct) what it built. */
  summary: string[]
}

const PRESET_MATCHERS: Array<{ id: string; label: string; re: RegExp }> = [
  { id: 'resupply_fails', label: 'Resupply Ship Cannot Arrive', re: /resupply|supply ship|can'?t arrive|no resupply/i },
  { id: 'generator_fails_winter', label: 'Primary Generator Fails In Winter', re: /generator.{0,20}(fail|down|out)/i },
  { id: 'medical_evacuation', label: 'Medical Evacuation During Isolation', re: /medevac|medical evac|evacuat/i },
  { id: 'convoy_stranded', label: 'Convoy Stranded En Route', re: /convoy.{0,20}strand|stranded convoy/i },
  { id: 'extended_storm', label: 'Extended Katabatic Storm', re: /storm|katabatic|blizzard/i },
]

function extractNumber(text: string, ...patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) {
      const n = Number(m[1])
      if (!Number.isNaN(n)) return n
    }
  }
  return null
}

export function parsePromptToScenario(prompt: string): ParsedScenario {
  const text = prompt.toLowerCase()
  const summary: string[] = []

  // Primary preset — the first pattern that matches wins; a prompt that
  // clearly names one scenario (e.g. "what if the resupply ship can't
  // arrive") should key off it rather than get bucketed as fully custom.
  const primary = PRESET_MATCHERS.find((p) => p.re.test(text))

  const headcount = extractNumber(text, /headcount (?:of )?(\d{1,3})/, /(\d{1,3})\s*(?:people|crew|staff|winterers)/)
  const weatherSeverity = extractNumber(text, /(?:severity|storm level)\s*(\d)/) ?? (/storm|katabatic|blizzard|extreme weather/.test(text) ? 5 : null)
  const generatorPct = extractNumber(text, /generator[s]?\s*(?:at|availability)?\s*(\d{1,3})\s*%/)
  const horizonDays = extractNumber(text, /(\d{1,3})\s*-?\s*day\s*(?:horizon|window|period)/, /over\s*(\d{1,3})\s*days/, /across\s*(\d{1,3})\s*days/) ?? 90
  const failureDay = extractNumber(text, /day\s*(\d{1,3})/, /on day\s*(\d{1,3})/)
  const fuelDeliveryLitres = extractNumber(text, /(\d{2,7})\s*(?:l|litre|liter)s?\s*(?:of fuel|delivery)?/)
  const fuelDeliveryDay = fuelDeliveryLitres != null ? (extractNumber(text, /delivery.{0,10}day\s*(\d{1,3})/) ?? 30) : null

  const failureEvents: FailureEvent[] = []
  // Secondary events mentioned alongside (but not as) the primary preset —
  // this is the "resupply fails AND a generator also fails" case from the
  // spec: primary=resupply_fails, plus an explicit generator_failure event.
  if (primary?.id !== 'generator_fails_winter' && /generator.{0,20}(fail|down|out)/.test(text)) {
    failureEvents.push({ day: failureDay ?? 10, type: 'generator_failure' })
    summary.push(`Added a generator failure event at day ${failureDay ?? 10}`)
  }
  if (primary?.id !== 'convoy_stranded' && /convoy.{0,20}strand/.test(text)) {
    failureEvents.push({ day: failureDay ?? 3, type: 'convoy_stranded' })
    summary.push(`Added a convoy-stranded event at day ${failureDay ?? 3}`)
  }
  if (primary?.id !== 'medical_evacuation' && /medevac|medical evac/.test(text)) {
    failureEvents.push({ day: failureDay ?? 5, type: 'medevac_convoy' })
    summary.push(`Added a medevac convoy event at day ${failureDay ?? 5}`)
  }

  const inputs: ScenarioInputs = {}
  if (headcount != null) { inputs.headcount = headcount; summary.push(`Headcount set to ${headcount}`) }
  if (generatorPct != null) { inputs.generator_availability_pct = generatorPct; summary.push(`Generator availability set to ${generatorPct}%`) }
  if (weatherSeverity != null) { inputs.weather_severity = weatherSeverity; summary.push(`Weather severity set to ${weatherSeverity}/5`) }
  if (fuelDeliveryLitres != null && fuelDeliveryDay != null) {
    inputs.fuel_delivery = { day: fuelDeliveryDay, litres: fuelDeliveryLitres }
    summary.push(`Scheduled a ${fuelDeliveryLitres.toLocaleString()} L fuel delivery on day ${fuelDeliveryDay}`)
  }
  if (failureEvents.length > 0) inputs.failure_events = failureEvents

  if (primary) {
    summary.unshift(`Matched the "${primary.label}" preset`)
    return {
      mode: 'preset',
      preset: primary.id,
      inputs,
      horizonDays,
      name: primary.label + (failureEvents.length > 0 ? ' + Complication' : ''),
      summary,
    }
  }

  // No preset matched — build a fully custom scenario from whatever was
  // parsed, with reasonable defaults for anything the prompt didn't mention.
  const customInputs: ScenarioInputs = {
    headcount: inputs.headcount ?? 25,
    generator_availability_pct: inputs.generator_availability_pct ?? 100,
    weather_severity: inputs.weather_severity ?? 1,
    fuel_delivery: inputs.fuel_delivery ?? null,
    failure_events: inputs.failure_events ?? [],
  }
  summary.unshift('No preset matched — built a custom scenario from what was described')
  return { mode: 'custom', preset: null, inputs: customInputs, horizonDays, name: 'Custom Scenario (from prompt)', summary }
}
