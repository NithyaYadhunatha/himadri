// src/lib/mockData/mockRisk.ts
//
// Frontend-only fallback for the Antarctic Risk Heatmap (GET
// /analytics/risk?station=), gated by NEXT_PUBLIC_USE_MOCK. Mirrors the real
// shape risk_engine.py computes — one cell per subsystem, each with a
// weighted factor breakdown (equipment failure probability, consumable
// endurance vs isolation window, weather severity, medical gap) — using
// plausible numbers consistent with mockGraph.ts's asset health and the
// medical-gap asymmetry backend/routers/analytics.py hardcodes (Maitri's
// hospital has no anaesthesia support; Bharati's does).
import type { RiskHeatmap } from '@/services/risk.service'

function cell(subsystem: string, label: string, score: number, factors: RiskHeatmap['cells'][number]['factors']): RiskHeatmap['cells'][number] {
  return { subsystem, label, score, factors }
}

const now = new Date().toISOString()

export const mockRiskHeatmaps: Record<string, RiskHeatmap> = {
  maitri: {
    station: 'maitri',
    generated_at: now,
    cells: [
      cell('power', 'Power', 38, [
        { name: 'equipment_failure', label: 'Equipment Failure Probability', score: 45, weight: 0.4, evidence: '1 open critical alert (Diesel Generator 2 load factor) among 3 power assets' },
        { name: 'consumable_endurance', label: 'Consumable Endurance', score: 20, weight: 0.3, evidence: 'Fuel endurance ~493d vs 150d isolation window remaining' },
        { name: 'weather', label: 'Weather Severity', score: 35, weight: 0.2, evidence: 'Latest AWS wind-speed reading' },
        { name: 'medical', label: 'Medical Gap', score: 18, weight: 0.1, evidence: 'Maitri Hospital has no anaesthetic support for spinal/general anaesthesia' },
      ]),
      cell('storage', 'Storage', 52, [
        { name: 'equipment_failure', label: 'Equipment Failure Probability', score: 70, weight: 0.4, evidence: '1 open critical alert (Deep Freezer 2 warming) among 4 storage assets' },
        { name: 'consumable_endurance', label: 'Consumable Endurance', score: 15, weight: 0.3, evidence: 'Fuel farm reserve well above 150d isolation window' },
        { name: 'weather', label: 'Weather Severity', score: 35, weight: 0.2, evidence: 'Latest AWS wind-speed reading' },
        { name: 'medical', label: 'Medical Gap', score: 18, weight: 0.1, evidence: 'Maitri Hospital has no anaesthetic support for spinal/general anaesthesia' },
      ]),
      cell('instrument', 'Science Instrument', 22, [
        { name: 'equipment_failure', label: 'Equipment Failure Probability', score: 20, weight: 0.4, evidence: '0 open critical alerts among 4 instrument assets' },
        { name: 'consumable_endurance', label: 'Consumable Endurance', score: 12, weight: 0.3, evidence: 'No consumable dependency' },
        { name: 'weather', label: 'Weather Severity', score: 35, weight: 0.2, evidence: 'Latest AWS wind-speed reading' },
        { name: 'medical', label: 'Medical Gap', score: 18, weight: 0.1, evidence: 'Maitri Hospital has no anaesthetic support for spinal/general anaesthesia' },
      ]),
      cell('medical', 'Medical', 61, [
        { name: 'equipment_failure', label: 'Equipment Failure Probability', score: 20, weight: 0.4, evidence: '0 open critical alerts among 1 medical asset' },
        { name: 'consumable_endurance', label: 'Consumable Endurance', score: 12, weight: 0.3, evidence: 'No consumable dependency' },
        { name: 'weather', label: 'Weather Severity', score: 35, weight: 0.2, evidence: 'Latest AWS wind-speed reading' },
        { name: 'medical', label: 'Medical Gap', score: 60, weight: 0.1, evidence: 'Maitri Hospital has no anaesthetic support for spinal/general anaesthesia — spinal/general anaesthesia cases require evacuation' },
      ]),
      cell('comms', 'Comms', 41, [
        { name: 'equipment_failure', label: 'Equipment Failure Probability', score: 45, weight: 0.4, evidence: '1 open warning alert (VSAT degraded) among 1 comms asset' },
        { name: 'consumable_endurance', label: 'Consumable Endurance', score: 12, weight: 0.3, evidence: 'No consumable dependency' },
        { name: 'weather', label: 'Weather Severity', score: 35, weight: 0.2, evidence: 'Latest AWS wind-speed reading' },
        { name: 'medical', label: 'Medical Gap', score: 18, weight: 0.1, evidence: 'Maitri Hospital has no anaesthetic support for spinal/general anaesthesia' },
      ]),
      cell('vehicle', 'Vehicle', 29, [
        { name: 'equipment_failure', label: 'Equipment Failure Probability', score: 30, weight: 0.4, evidence: '0 open critical alerts among 4 vehicle assets' },
        { name: 'consumable_endurance', label: 'Consumable Endurance', score: 15, weight: 0.3, evidence: 'Fuel farm reserve well above 150d isolation window' },
        { name: 'weather', label: 'Weather Severity', score: 35, weight: 0.2, evidence: 'Latest AWS wind-speed reading' },
        { name: 'medical', label: 'Medical Gap', score: 18, weight: 0.1, evidence: 'Maitri Hospital has no anaesthetic support for spinal/general anaesthesia' },
      ]),
    ],
  },
  bharati: {
    station: 'bharati',
    generated_at: now,
    cells: [
      cell('power', 'Power', 24, [
        { name: 'equipment_failure', label: 'Equipment Failure Probability', score: 20, weight: 0.4, evidence: '0 open critical alerts among 2 power assets' },
        { name: 'consumable_endurance', label: 'Consumable Endurance', score: 18, weight: 0.3, evidence: 'Fuel endurance ~364d vs 150d isolation window remaining' },
        { name: 'weather', label: 'Weather Severity', score: 30, weight: 0.2, evidence: 'Latest AWS wind-speed reading' },
        { name: 'medical', label: 'Medical Gap', score: 6, weight: 0.1, evidence: "Bharati medical room has an anaesthesia machine (Boyle's apparatus)" },
      ]),
      cell('heating', 'Heating', 46, [
        { name: 'equipment_failure', label: 'Equipment Failure Probability', score: 45, weight: 0.4, evidence: '1 open warning alert (AHU filter dP) among 1 heating asset' },
        { name: 'consumable_endurance', label: 'Consumable Endurance', score: 18, weight: 0.3, evidence: 'Fuel endurance ~364d vs 150d isolation window remaining' },
        { name: 'weather', label: 'Weather Severity', score: 30, weight: 0.2, evidence: 'Latest AWS wind-speed reading' },
        { name: 'medical', label: 'Medical Gap', score: 6, weight: 0.1, evidence: "Bharati medical room has an anaesthesia machine (Boyle's apparatus)" },
      ]),
      cell('instrument', 'Science Instrument', 31, [
        { name: 'equipment_failure', label: 'Equipment Failure Probability', score: 45, weight: 0.4, evidence: '1 open warning alert (GSI continuity) among 4 instrument assets' },
        { name: 'consumable_endurance', label: 'Consumable Endurance', score: 12, weight: 0.3, evidence: 'No consumable dependency' },
        { name: 'weather', label: 'Weather Severity', score: 30, weight: 0.2, evidence: 'Latest AWS wind-speed reading' },
        { name: 'medical', label: 'Medical Gap', score: 6, weight: 0.1, evidence: "Bharati medical room has an anaesthesia machine (Boyle's apparatus)" },
      ]),
      cell('medical', 'Medical', 15, [
        { name: 'equipment_failure', label: 'Equipment Failure Probability', score: 20, weight: 0.4, evidence: '0 open critical alerts among 2 medical assets' },
        { name: 'consumable_endurance', label: 'Consumable Endurance', score: 12, weight: 0.3, evidence: 'No consumable dependency' },
        { name: 'weather', label: 'Weather Severity', score: 30, weight: 0.2, evidence: 'Latest AWS wind-speed reading' },
        { name: 'medical', label: 'Medical Gap', score: 20, weight: 0.1, evidence: "Bharati medical room has an anaesthesia machine (Boyle's apparatus) — Operation Theatre access restricted" },
      ]),
      cell('comms', 'Comms', 18, [
        { name: 'equipment_failure', label: 'Equipment Failure Probability', score: 20, weight: 0.4, evidence: '0 open critical alerts among 1 comms asset' },
        { name: 'consumable_endurance', label: 'Consumable Endurance', score: 12, weight: 0.3, evidence: 'No consumable dependency' },
        { name: 'weather', label: 'Weather Severity', score: 30, weight: 0.2, evidence: 'Latest AWS wind-speed reading' },
        { name: 'medical', label: 'Medical Gap', score: 6, weight: 0.1, evidence: "Bharati medical room has an anaesthesia machine (Boyle's apparatus)" },
      ]),
      cell('vehicle', 'Vehicle', 20, [
        { name: 'equipment_failure', label: 'Equipment Failure Probability', score: 20, weight: 0.4, evidence: '0 open critical alerts among 2 vehicle assets' },
        { name: 'consumable_endurance', label: 'Consumable Endurance', score: 18, weight: 0.3, evidence: 'Fuel endurance ~364d vs 150d isolation window remaining' },
        { name: 'weather', label: 'Weather Severity', score: 30, weight: 0.2, evidence: 'Latest AWS wind-speed reading' },
        { name: 'medical', label: 'Medical Gap', score: 6, weight: 0.1, evidence: "Bharati medical room has an anaesthesia machine (Boyle's apparatus)" },
      ]),
    ],
  },
}
