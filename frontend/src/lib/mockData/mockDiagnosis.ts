// src/lib/mockData/mockDiagnosis.ts
//
// Frontend-only fallback for guided fault diagnosis (POST /analytics/diagnose),
// gated by NEXT_PUBLIC_USE_MOCK. A faithful TS port of the backend's curated
// knowledge base (backend/services/diagnosis_engine.py) — same causes,
// priors, evidence keys, and check sequences — so the mock behaves exactly
// like the real engine's Bayesian-style evidence scoring, not a canned
// response. Ranking is intentionally explicit/curated rather than a trained
// model on both sides (see that file's module docstring for why).
import type { DiagnosisCause, DiagnosisResult } from '@/services/diagnosis.service'

interface RuleCause {
  cause: string
  prior: number
  evidence: string[]
  check_sequence: string[]
}

interface Rule {
  fault: string
  causes: RuleCause[]
}

const RULES: Record<string, Rule> = {
  'vehicle|pistenbully': {
    fault: 'PistenBully will not start / cold-start fault',
    causes: [
      {
        cause: 'Cold-start pre-heat system fault (chamber, blower, or igniter)',
        prior: 0.45,
        evidence: ['ambient_below_minus20c', 'coolant_cold', 'preheat_cycle_incomplete'],
        check_sequence: [
          'Check ambient and coolant temperature readings',
          'Confirm the pre-heat cycle (chamber/blower/igniter) completed before crank',
          'Inspect the pre-heat chamber and blower for a stalled or seized fault',
          'Check the igniter element for continuity',
        ],
      },
      {
        cause: 'Battery/starting circuit weak in extreme cold',
        prior: 0.25,
        evidence: ['ambient_below_minus20c', 'slow_crank'],
        check_sequence: ['Measure battery voltage under crank load', 'Inspect battery insulation/heating blanket if fitted'],
      },
      {
        cause: 'Fault the on-board display cannot show (display fault or unrelated ECU code)',
        prior: 0.30,
        evidence: ['display_dead'],
        check_sequence: [
          'Connect the 16-pin Mini-Doc connector to bypass the display and read fault codes directly',
          'Cross-reference the returned code against the fleet fault-code sheet',
        ],
      },
    ],
  },
  'power|generator': {
    fault: 'Generator output degraded or generator fault',
    causes: [
      {
        cause: 'Fuel starvation or clogged fuel filter',
        prior: 0.35,
        evidence: ['fuel_pressure_low', 'recent_refuel'],
        check_sequence: [
          'Check fuel filter differential pressure',
          'Verify fuel supply line pressure at the generator inlet',
          'Inspect for water/contamination in the fuel sample',
        ],
      },
      {
        cause: 'Overload — running above rated load factor',
        prior: 0.30,
        evidence: ['load_factor_above_90pct'],
        check_sequence: [
          'Compare current load (kW) against rated capacity',
          'Check for a stuck/duplicated load (e.g. two generators paralleled unintentionally)',
        ],
      },
      {
        cause: 'Cooling system fault (overheating)',
        prior: 0.20,
        evidence: ['coolant_temp_high'],
        check_sequence: ['Check coolant temperature and level', 'Inspect radiator/heat exchanger for blockage'],
      },
      {
        cause: 'Injector wear / poor combustion',
        prior: 0.15,
        evidence: ['fuel_efficiency_declining'],
        check_sequence: ['Check fuel efficiency trend (L/kWh) against baseline', 'Schedule injector inspection if trend confirms'],
      },
    ],
  },
  'storage|freezer': {
    fault: 'Freezer temperature deviation from -18..-20°C target',
    causes: [
      {
        cause: 'Door seal failure or door left open',
        prior: 0.35,
        evidence: ['temp_rising_fast', 'recent_access_logged'],
        check_sequence: ['Inspect door seal for gaps/ice buildup', 'Confirm the door latched fully on last access'],
      },
      {
        cause: 'Compressor fault',
        prior: 0.30,
        evidence: ['compressor_not_cycling'],
        check_sequence: ['Check compressor run status and current draw', 'Listen/inspect for a seized or short-cycling compressor'],
      },
      {
        cause: 'Refrigerant leak',
        prior: 0.20,
        evidence: ['temp_rising_slow', 'long_service_interval'],
        check_sequence: ['Check refrigerant pressure against nameplate spec', 'Inspect visible lines for oil residue (leak indicator)'],
      },
      {
        cause: 'Thermostat/sensor fault (false reading)',
        prior: 0.15,
        evidence: ['reading_erratic'],
        check_sequence: ['Cross-check with a secondary thermometer', 'Recalibrate or replace the thermostat sensor'],
      },
    ],
  },
  'instrument|default': {
    fault: 'Science instrument data dropout / continuity loss',
    causes: [
      {
        cause: 'Local power supply interruption',
        prior: 0.30,
        evidence: ['power_flagged_unstable'],
        check_sequence: [
          "Check local UPS/power supply status for the instrument rack",
          "Confirm the circuit wasn't affected by a recent generator switchover",
        ],
      },
      {
        cause: 'Comms link fault to the central logging server',
        prior: 0.30,
        evidence: ['other_instruments_also_dropped'],
        check_sequence: ['Check the modem/link status to the central server', 'Test connectivity to a neighbouring instrument on the same link'],
      },
      {
        cause: 'Field cable damage (cold-cracking)',
        prior: 0.25,
        evidence: ['outdoor_sensor', 'recent_extreme_cold'],
        check_sequence: ['Visually inspect the outdoor cable run for cracking/breaks', 'Check connector continuity at both ends'],
      },
      {
        cause: 'Logging software crash',
        prior: 0.15,
        evidence: ['screenshots_stopped_only'],
        check_sequence: ['Check whether the logging process is still running on the Linux host', 'Restart the logging software and confirm resumed sampling'],
      },
    ],
  },
  'waste|stp': {
    fault: 'Sewage treatment plant stage not progressing',
    causes: [
      {
        cause: 'Sludge pump blockage',
        prior: 0.35,
        evidence: ['stage_stuck_at_sludge_removal'],
        check_sequence: ['Check sludge pump run status and discharge pressure', 'Inspect pump inlet for blockage'],
      },
      {
        cause: 'Bioreactor temperature drop (below effective range)',
        prior: 0.30,
        evidence: ['orange_room_temp_low'],
        check_sequence: ['Check Orange Room tank thermostat/heater status', 'Verify bioreactor temperature against the effective range'],
      },
      {
        cause: 'UF/UV filter fouling',
        prior: 0.25,
        evidence: ['stage_stuck_at_filter'],
        check_sequence: ['Check UF filter differential pressure', 'Check UV lamp status/output'],
      },
    ],
  },
  'heating|ahu': {
    fault: 'AHU filter differential pressure high / airflow degraded',
    causes: [
      {
        cause: 'Filter fouling / dust-and-frost loading',
        prior: 0.5,
        evidence: ['filter_dp_above_threshold'],
        check_sequence: ['Read current filter differential pressure against baseline', 'Schedule filter replacement if above threshold'],
      },
      {
        cause: 'Fan speed fault',
        prior: 0.3,
        evidence: ['fan_rpm_below_setpoint'],
        check_sequence: ['Compare fan RPM against setpoint', 'Inspect fan belt/motor for wear'],
      },
      {
        cause: 'Damper stuck',
        prior: 0.2,
        evidence: ['supply_temp_erratic'],
        check_sequence: ['Inspect damper position vs commanded position'],
      },
    ],
  },
}

export function mockDiagnose(category: string | undefined, subtype: string | undefined, observedEvidence: Record<string, boolean> = {}): DiagnosisResult {
  const key1 = `${category ?? ''}|${subtype ?? ''}`
  const key2 = `${category ?? ''}|default`
  const rule = RULES[key1] ?? RULES[key2]

  if (!rule) {
    return {
      asset_id: null,
      category: category ?? null,
      subtype: subtype ?? null,
      causes: [],
    }
  }

  const ranked: DiagnosisCause[] = rule.causes
    .map((c) => {
      const matched = c.evidence.filter((e) => observedEvidence[e])
      const score = Math.min(c.prior + 0.15 * matched.length, 1.0)
      return {
        cause: c.cause,
        score_pct: Math.round(score * 1000) / 10,
        matched_evidence: matched,
        check_sequence: c.check_sequence,
      }
    })
    .sort((a, b) => b.score_pct - a.score_pct)

  return { asset_id: null, category: category ?? null, subtype: subtype ?? null, causes: ranked }
}
