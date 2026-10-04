// src/lib/diagnosis/knowledge.ts
//
// Curated fault-diagnosis knowledge base for the guided-diagnosis page. It is a
// client-side port of the idea behind backend/services/diagnosis_engine.py
// (curated causes, a prior each, evidence that raises it, an ordered check
// sequence) extended to every asset category, so the page works — and the
// ranking responds to the evidence an engineer ticks — even when the backend
// has no matching rule. Ranking is explicit and explainable on purpose.

export type DiagCategory =
  | 'power' | 'heating' | 'water' | 'waste' | 'vehicle'
  | 'instrument' | 'storage' | 'medical' | 'comms' | 'structure'

export type Severity = 'critical' | 'high' | 'medium' | 'low'

export interface EvidenceItem { key: string; label: string }

export interface RuleCause {
  cause: string
  prior: number
  evidence: string[]
  check_sequence: string[]
  /** typical time to resolve once the cause is confirmed */
  eta: string
  spares?: string[]
}

export interface CategoryProfile {
  label: string
  fault: string
  evidence: EvidenceItem[]
  causes: RuleCause[]
}

export const CATEGORY_LABEL: Record<DiagCategory, string> = {
  power: 'Power', heating: 'Heating', water: 'Water', waste: 'Waste',
  vehicle: 'Vehicles', instrument: 'Instruments', storage: 'Storage',
  medical: 'Medical', comms: 'Comms', structure: 'Structure',
}

export const KNOWLEDGE: Record<DiagCategory, CategoryProfile> = {
  power: {
    label: 'Power',
    fault: 'Generator / CHP output degraded or unstable',
    evidence: [
      { key: 'wont_start', label: 'Engine will not start' },
      { key: 'voltage_unstable', label: 'Output voltage unstable' },
      { key: 'black_smoke', label: 'Excessive black smoke' },
      { key: 'coolant_high', label: 'Coolant temperature high' },
      { key: 'load_above_90', label: 'Load factor above 90 %' },
      { key: 'fuel_pressure_low', label: 'Fuel pressure low' },
      { key: 'efficiency_declining', label: 'Fuel efficiency declining' },
    ],
    causes: [
      { cause: 'Fuel starvation or clogged fuel filter', prior: 0.3, evidence: ['wont_start', 'fuel_pressure_low', 'voltage_unstable'], eta: '1–2 h', spares: ['Fuel filter element', 'Primer pump seal'],
        check_sequence: ['Read filter differential pressure against baseline', 'Verify supply-line pressure at the generator inlet', 'Draw a fuel sample and check for water or wax (gelling below −15 °C)', 'Swap the filter element and bleed the line'] },
      { cause: 'Overload — running above rated load factor', prior: 0.27, evidence: ['load_above_90', 'voltage_unstable', 'coolant_high'], eta: '30 min', spares: [],
        check_sequence: ['Compare live load (kW) with the nameplate rating', 'Look for a duplicated load or an unintended parallel connection', 'Shed non-essential loads (workshop, secondary heating) and re-check stability'] },
      { cause: 'Cooling system fault (overheating)', prior: 0.2, evidence: ['coolant_high', 'load_above_90'], eta: '2–3 h', spares: ['Coolant 20 L', 'Thermostat', 'Radiator hose'],
        check_sequence: ['Check coolant level and glycol concentration', 'Inspect the radiator / heat exchanger for blockage or frost', 'Confirm the thermostat opens at its rated temperature'] },
      { cause: 'Injector wear / poor combustion', prior: 0.15, evidence: ['black_smoke', 'efficiency_declining'], eta: '4–6 h', spares: ['Injector set', 'Nozzle seals'],
        check_sequence: ['Trend fuel efficiency (L/kWh) over the last 30 days', 'Run an injector balance test', 'Schedule injector service if the trend is confirmed'] },
    ],
  },
  heating: {
    label: 'Heating',
    fault: 'AHU / boiler supply temperature or airflow degraded',
    evidence: [
      { key: 'low_supply_temp', label: 'Low supply temperature' },
      { key: 'filter_dp_high', label: 'Filter differential pressure high' },
      { key: 'short_cycling', label: 'Burner short-cycling' },
      { key: 'pump_noise', label: 'Unusual noise from pump' },
      { key: 'fan_rpm_low', label: 'Fan RPM below setpoint' },
      { key: 'supply_temp_erratic', label: 'Supply temperature erratic' },
    ],
    causes: [
      { cause: 'Filter fouling — dust and frost loading', prior: 0.35, evidence: ['filter_dp_high', 'low_supply_temp'], eta: '1 h', spares: ['AHU filter set'],
        check_sequence: ['Read filter differential pressure against baseline', 'Replace the filter if above threshold', 'Re-check supply temperature after 15 min'] },
      { cause: 'Fan or drive fault', prior: 0.25, evidence: ['fan_rpm_low', 'pump_noise'], eta: '2–3 h', spares: ['Drive belt', 'Fan motor bearing'],
        check_sequence: ['Compare fan RPM with setpoint', 'Inspect the belt tension and motor bearings', 'Listen for rubbing or imbalance at full speed'] },
      { cause: 'Burner ignition / flame-sensing problem', prior: 0.22, evidence: ['short_cycling', 'low_supply_temp'], eta: '2 h', spares: ['Ignition electrode', 'Flame sensor'],
        check_sequence: ['Review burner fault history for lock-outs', 'Clean the flame sensor and check electrode gap', 'Verify fuel supply pressure at the burner'] },
      { cause: 'Damper or valve stuck', prior: 0.18, evidence: ['supply_temp_erratic'], eta: '1–2 h', spares: ['Actuator'],
        check_sequence: ['Compare damper position with commanded position', 'Free the linkage and lubricate with cold-rated grease'] },
    ],
  },
  water: {
    label: 'Water',
    fault: 'Water production or distribution below demand',
    evidence: [
      { key: 'low_flow', label: 'Low output flow' },
      { key: 'pump_pressure_high', label: 'High pump pressure' },
      { key: 'discoloured', label: 'Discoloured output' },
      { key: 'level_dropping', label: 'Storage level dropping unexpectedly' },
      { key: 'intake_frozen', label: 'Seawater intake slush / frozen' },
    ],
    causes: [
      { cause: 'Membrane fouling in the RO / desalination train', prior: 0.32, evidence: ['low_flow', 'pump_pressure_high'], eta: '4–8 h', spares: ['Membrane cleaning kit', 'Pre-filter cartridges'],
        check_sequence: ['Compare differential pressure across the membranes with baseline', 'Run a CIP (clean-in-place) cycle', 'Replace pre-filter cartridges'] },
      { cause: 'Intake blockage or freeze-up', prior: 0.28, evidence: ['intake_frozen', 'low_flow'], eta: '2–4 h', spares: ['Heat-trace cable', 'Intake screen'],
        check_sequence: ['Check heat-trace on the intake line', 'Backflush the intake screen', 'Verify intake pump suction pressure'] },
      { cause: 'Leak in the distribution loop', prior: 0.22, evidence: ['level_dropping'], eta: '3–6 h', spares: ['Pipe coupling', 'Sealant'],
        check_sequence: ['Isolate zones one at a time and watch the tank level', 'Inspect insulated joints for ice build-up', 'Pressure-test the suspect section'] },
      { cause: 'Contamination / biofilm in storage', prior: 0.18, evidence: ['discoloured'], eta: '1 day', spares: ['Chlorine tablets'],
        check_sequence: ['Take a sample for turbidity and chlorine residual', 'Flush and dose the storage tank'] },
    ],
  },
  waste: {
    label: 'Waste',
    fault: 'Sewage / waste treatment stage not progressing',
    evidence: [
      { key: 'cycle_stalled', label: 'Treatment cycle stalled' },
      { key: 'reactor_temp_off', label: 'Bioreactor temperature abnormal' },
      { key: 'sludge_pump_off', label: 'Sludge pump not running' },
      { key: 'odour', label: 'Odour reported' },
      { key: 'tank_high', label: 'Holding tank level high' },
    ],
    causes: [
      { cause: 'Sludge pump blockage', prior: 0.33, evidence: ['sludge_pump_off', 'cycle_stalled', 'tank_high'], eta: '2 h', spares: ['Pump impeller', 'Shaft seal'],
        check_sequence: ['Check pump run status and discharge pressure', 'Isolate and inspect the inlet for rags or ice', 'Run a manual reverse-flush'] },
      { cause: 'Bioreactor below effective temperature', prior: 0.28, evidence: ['reactor_temp_off', 'odour'], eta: '3–5 h', spares: ['Tank heater element'],
        check_sequence: ['Check tank thermostat and heater status', 'Compare reactor temperature with the effective range', 'Re-seed the culture if it has crashed'] },
      { cause: 'UF / UV filter fouling', prior: 0.22, evidence: ['cycle_stalled'], eta: '2–3 h', spares: ['UF membrane', 'UV lamp'],
        check_sequence: ['Read UF differential pressure', 'Check UV lamp hours and output'] },
      { cause: 'Aeration blower fault', prior: 0.17, evidence: ['odour', 'reactor_temp_off'], eta: '2 h', spares: ['Blower diaphragm'],
        check_sequence: ['Confirm blower current draw', 'Inspect the diffuser line for ice or kinks'] },
    ],
  },
  vehicle: {
    label: 'Vehicles',
    fault: 'Vehicle will not start / drivetrain fault',
    evidence: [
      { key: 'cold_ambient', label: 'Ambient below −20 °C' },
      { key: 'slow_crank', label: 'Slow cranking' },
      { key: 'preheat_incomplete', label: 'Pre-heat cycle incomplete' },
      { key: 'display_dead', label: 'Dashboard display dead' },
      { key: 'coolant_fault', label: 'Coolant fault code' },
      { key: 'track_loose', label: 'Track tension loose' },
    ],
    causes: [
      { cause: 'Cold-start pre-heat system fault (chamber, blower, igniter)', prior: 0.38, evidence: ['cold_ambient', 'preheat_incomplete'], eta: '2–3 h', spares: ['Glow igniter', 'Pre-heat blower'],
        check_sequence: ['Check ambient and coolant temperature', 'Confirm the pre-heat cycle completed before crank', 'Inspect the chamber and blower for a stall', 'Check igniter continuity'] },
      { cause: 'Battery / starting circuit weak in extreme cold', prior: 0.27, evidence: ['cold_ambient', 'slow_crank'], eta: '1 h', spares: ['Battery 12 V', 'Heating blanket'],
        check_sequence: ['Measure battery voltage under crank load', 'Inspect the battery insulation or heating blanket', 'Jump-start from a warmed pack and log the draw'] },
      { cause: 'Display or ECU fault hiding the real code', prior: 0.2, evidence: ['display_dead'], eta: '1 h', spares: ['Mini-Doc connector'],
        check_sequence: ['Connect the 16-pin Mini-Doc to bypass the display', 'Read the stored fault codes', 'Cross-reference against the fleet fault-code sheet'] },
      { cause: 'Cooling or track-drive mechanical fault', prior: 0.15, evidence: ['coolant_fault', 'track_loose'], eta: '3–6 h', spares: ['Track tensioner', 'Coolant hose'],
        check_sequence: ['Check coolant level and hoses', 'Measure track sag and re-tension', 'Inspect the final drive for oil loss'] },
    ],
  },
  instrument: {
    label: 'Instruments',
    fault: 'Science instrument data dropout / continuity loss',
    evidence: [
      { key: 'data_gap', label: 'Data continuity dropped' },
      { key: 'out_of_range', label: 'Sensor reading out of range' },
      { key: 'others_dropped', label: 'Neighbouring instruments also dropped' },
      { key: 'software_crash', label: 'Logging software stopped' },
      { key: 'outdoor_sensor', label: 'Outdoor sensor, recent extreme cold' },
      { key: 'power_flicker', label: 'Power flicker logged' },
    ],
    causes: [
      { cause: 'Local power supply interruption', prior: 0.28, evidence: ['power_flicker', 'data_gap'], eta: '1 h', spares: ['UPS battery'],
        check_sequence: ['Check the UPS / power supply for the instrument rack', 'Look for a recent generator switchover in the event log'] },
      { cause: 'Comms link fault to the central logging server', prior: 0.28, evidence: ['others_dropped', 'data_gap'], eta: '1–2 h', spares: ['Media converter'],
        check_sequence: ['Check modem / link status to the server', 'Test connectivity to a neighbouring instrument on the same link'] },
      { cause: 'Field cable damage (cold cracking)', prior: 0.24, evidence: ['outdoor_sensor', 'out_of_range'], eta: '3–5 h', spares: ['Cold-rated cable 10 m', 'Connector kit'],
        check_sequence: ['Visually inspect the outdoor cable run for cracks', 'Check connector continuity at both ends'] },
      { cause: 'Logging software crash', prior: 0.2, evidence: ['software_crash'], eta: '30 min', spares: [],
        check_sequence: ['Check the logger process on the Linux host', 'Restart the service and confirm resumed sampling'] },
    ],
  },
  storage: {
    label: 'Storage',
    fault: 'Storage temperature or level deviation',
    evidence: [
      { key: 'temp_rising_fast', label: 'Temperature rising fast' },
      { key: 'temp_rising_slow', label: 'Temperature drifting slowly' },
      { key: 'door_seal', label: 'Door / seal not closing fully' },
      { key: 'compressor_continuous', label: 'Compressor running continuously' },
      { key: 'level_mismatch', label: 'Level sensor mismatch' },
      { key: 'reading_erratic', label: 'Sensor reading erratic' },
    ],
    causes: [
      { cause: 'Door seal failure or door left ajar', prior: 0.34, evidence: ['door_seal', 'temp_rising_fast'], eta: '1 h', spares: ['Door gasket'],
        check_sequence: ['Inspect the door seal for gaps or ice build-up', 'Confirm the latch engages on closing', 'Re-check temperature after 30 min'] },
      { cause: 'Compressor fault', prior: 0.28, evidence: ['compressor_continuous', 'temp_rising_slow'], eta: '3–6 h', spares: ['Start capacitor', 'Compressor relay'],
        check_sequence: ['Check compressor run status and current draw', 'Inspect for short-cycling or a seized unit'] },
      { cause: 'Refrigerant leak', prior: 0.2, evidence: ['temp_rising_slow', 'compressor_continuous'], eta: '4–8 h', spares: ['Refrigerant charge'],
        check_sequence: ['Check refrigerant pressure against nameplate spec', 'Look for oil residue on lines (leak indicator)'] },
      { cause: 'Thermostat / sensor fault', prior: 0.18, evidence: ['reading_erratic', 'level_mismatch'], eta: '30 min', spares: ['Thermistor probe'],
        check_sequence: ['Cross-check with a secondary thermometer', 'Recalibrate or replace the sensor'] },
    ],
  },
  medical: {
    label: 'Medical',
    fault: 'Medical bay equipment or supply readiness at risk',
    evidence: [
      { key: 'self_test_failed', label: 'Equipment failed self-test' },
      { key: 'stock_low', label: 'Supply below reorder threshold' },
      { key: 'backup_unverified', label: 'Backup power not verified' },
      { key: 'temp_out_of_range', label: 'Drug fridge out of range' },
    ],
    causes: [
      { cause: 'Battery or backup-power degradation', prior: 0.32, evidence: ['backup_unverified', 'self_test_failed'], eta: '1–2 h', spares: ['Device battery pack', 'UPS battery'],
        check_sequence: ['Run the monthly battery test on each device', 'Verify the medical bay is on the protected circuit', 'Log the result in the readiness checklist'] },
      { cause: 'Consumable stock-out approaching', prior: 0.3, evidence: ['stock_low'], eta: 'Next resupply', spares: [],
        check_sequence: ['Count the flagged items and compare with minimum', 'Raise a resupply request and note the substitute protocol'] },
      { cause: 'Cold-chain excursion (drug fridge)', prior: 0.22, evidence: ['temp_out_of_range'], eta: '1 h', spares: ['Fridge thermometer'],
        check_sequence: ['Check fridge min/max log for the excursion window', 'Quarantine affected drugs pending pharmacist guidance'] },
      { cause: 'Device calibration overdue', prior: 0.16, evidence: ['self_test_failed'], eta: '2 h', spares: ['Calibration kit'],
        check_sequence: ['Check the last calibration date', 'Run the calibration routine or swap the unit'] },
    ],
  },
  comms: {
    label: 'Comms',
    fault: 'Uplink or station network degraded',
    evidence: [
      { key: 'link_degraded', label: 'Link degraded to PNR-isolated' },
      { key: 'bandwidth_exceeded', label: 'Bandwidth budget exceeded' },
      { key: 'antenna_misaligned', label: 'Antenna misalignment suspected' },
      { key: 'storm_active', label: 'High winds / storm active' },
      { key: 'ups_on_battery', label: 'Comms room on UPS battery' },
    ],
    causes: [
      { cause: 'Weather-correlated signal loss (wind / ice on dish)', prior: 0.33, evidence: ['storm_active', 'link_degraded'], eta: 'Weather-dependent', spares: ['Dish heater cable'],
        check_sequence: ['Compare dropouts with the wind log', 'Check dish de-icing heater', 'Hold bulk transfers until the weather clears'] },
      { cause: 'Antenna misalignment', prior: 0.25, evidence: ['antenna_misaligned', 'link_degraded'], eta: '3–4 h', spares: ['Alignment tool'],
        check_sequence: ['Compare received signal level with commissioning value', 'Inspect mount bolts for movement', 'Re-peak the antenna'] },
      { cause: 'Bandwidth budget exhausted by queued sync', prior: 0.22, evidence: ['bandwidth_exceeded'], eta: '30 min', spares: [],
        check_sequence: ['Review the sync queue and pause low-priority uploads', 'Re-prioritise audit and alert traffic'] },
      { cause: 'Comms-room power or modem fault', prior: 0.2, evidence: ['ups_on_battery', 'link_degraded'], eta: '1–2 h', spares: ['Modem PSU', 'UPS battery'],
        check_sequence: ['Check UPS state and runtime remaining', 'Power-cycle the modem and verify lock'] },
    ],
  },
  structure: {
    label: 'Structure',
    fault: 'Building envelope or access fault',
    evidence: [
      { key: 'envelope_leak', label: 'Envelope leak / draught reported' },
      { key: 'access_fault', label: 'Access control fault' },
      { key: 'inspection_overdue', label: 'Structural inspection overdue' },
      { key: 'snow_load', label: 'Heavy snow load on roof' },
    ],
    causes: [
      { cause: 'Panel joint or seal degradation', prior: 0.34, evidence: ['envelope_leak'], eta: '3–6 h', spares: ['Joint sealant', 'Insulation tape'],
        check_sequence: ['Thermal-image the suspect wall section', 'Re-seal the joint with cold-rated sealant'] },
      { cause: 'Snow loading approaching design limit', prior: 0.26, evidence: ['snow_load', 'inspection_overdue'], eta: '4–8 h', spares: [],
        check_sequence: ['Measure snow depth on the roof', 'Clear drifts around the building and roof access'] },
      { cause: 'Door / lock mechanism fault', prior: 0.22, evidence: ['access_fault'], eta: '1–2 h', spares: ['Lock cylinder', 'Door closer'],
        check_sequence: ['Check the lock actuator and power', 'Test the manual override'] },
      { cause: 'Inspection backlog hiding a defect', prior: 0.18, evidence: ['inspection_overdue'], eta: '1 day', spares: [],
        check_sequence: ['Schedule the overdue inspection', 'Prioritise load-bearing and egress elements'] },
    ],
  },
}

export interface RankedCause {
  cause: string
  score_pct: number
  matched_evidence: string[]
  check_sequence: string[]
  eta: string
  spares: string[]
}

export function diagnoseLocal(category: DiagCategory, selectedKeys: string[]): RankedCause[] {
  const profile = KNOWLEDGE[category]
  const labelOf = new Map(profile.evidence.map((e) => [e.key, e.label]))
  const picked = new Set(selectedKeys)
  const scored = profile.causes.map((c) => {
    const matched = c.evidence.filter((k) => picked.has(k))
    // prior + 0.17 per matched piece of evidence, softly saturating
    const raw = c.prior + 0.17 * matched.length
    return { c, matched, raw }
  })
  const total = scored.reduce((s, x) => s + x.raw, 0) || 1
  return scored
    .map(({ c, matched, raw }) => ({
      cause: c.cause,
      score_pct: Math.round((raw / total) * 1000) / 10,
      matched_evidence: matched.map((k) => labelOf.get(k) ?? k),
      check_sequence: c.check_sequence,
      eta: c.eta,
      spares: c.spares ?? [],
    }))
    .sort((a, b) => b.score_pct - a.score_pct)
}

// ── Fault playbook: ready-made cases engineers can load with one click ──

export interface PlaybookCase {
  id: string
  title: string
  category: DiagCategory
  severity: Severity
  symptoms: string
  evidence: string[]
  likely: string
  firstAction: string
  eta: string
}

export const PLAYBOOK: PlaybookCase[] = [
  { id: 'gen-unstable', title: 'Generator voltage hunting under load', category: 'power', severity: 'critical',
    symptoms: 'Output swings ±8 % when the workshop starts; load factor above 90 %.',
    evidence: ['voltage_unstable', 'load_above_90'], likely: 'Overload on a single set', firstAction: 'Shed non-essential load, bring the standby set online.', eta: '30 min' },
  { id: 'fuel-gel', title: 'Fuel filter blocking in a cold snap', category: 'power', severity: 'high',
    symptoms: 'Fuel pressure low, engine surging at idle after a −25 °C night.',
    evidence: ['fuel_pressure_low', 'wont_start'], likely: 'Waxed / clogged fuel filter', firstAction: 'Swap filter, switch to winter-grade (arctic) diesel.', eta: '1–2 h' },
  { id: 'ahu-dp', title: 'AHU supply temperature falling', category: 'heating', severity: 'medium',
    symptoms: 'Supply air 6 °C below setpoint; filter ΔP reads 40 % over baseline.',
    evidence: ['low_supply_temp', 'filter_dp_high'], likely: 'Frost-loaded filter', firstAction: 'Replace the filter set and re-check ΔP.', eta: '1 h' },
  { id: 'ro-fouling', title: 'Desalination output down 30 %', category: 'water',  severity: 'high',
    symptoms: 'Flow low, high-pressure pump pressure creeping up over 10 days.',
    evidence: ['low_flow', 'pump_pressure_high'], likely: 'Membrane fouling', firstAction: 'Run a CIP cycle and swap pre-filters.', eta: '4–8 h' },
  { id: 'intake-ice', title: 'Seawater intake slushing up', category: 'water', severity: 'high',
    symptoms: 'Intake pump suction pressure dropping; heat-trace tripped overnight.',
    evidence: ['intake_frozen', 'low_flow'], likely: 'Frozen intake screen', firstAction: 'Reset heat-trace, backflush the screen.', eta: '2–4 h' },
  { id: 'stp-stall', title: 'Sewage plant stuck at sludge removal', category: 'waste', severity: 'medium',
    symptoms: 'Cycle stalled, holding tank climbing, sludge pump silent.',
    evidence: ['cycle_stalled', 'sludge_pump_off', 'tank_high'], likely: 'Sludge pump blockage', firstAction: 'Isolate the pump and reverse-flush the inlet.', eta: '2 h' },
  { id: 'pb-coldstart', title: 'PistenBully will not cold-start', category: 'vehicle', severity: 'high',
    symptoms: 'Ambient −28 °C, pre-heat cycle ends early, display shows nothing.',
    evidence: ['cold_ambient', 'preheat_incomplete', 'display_dead'], likely: 'Pre-heat system fault', firstAction: 'Plug in the Mini-Doc and read the stored code.', eta: '2–3 h' },
  { id: 'freezer-drift', title: 'Deep freezer drifting to −12 °C', category: 'storage', severity: 'high',
    symptoms: 'Temperature rising 1 °C / h, compressor runs non-stop.',
    evidence: ['temp_rising_slow', 'compressor_continuous'], likely: 'Refrigerant leak or failing compressor', firstAction: 'Move perishables to the backup freezer, check refrigerant pressure.', eta: '4–8 h' },
  { id: 'vsat-storm', title: 'VSAT link drops during storms', category: 'comms', severity: 'medium',
    symptoms: 'Link falls to PNR-isolated when gusts exceed 90 km/h.',
    evidence: ['storm_active', 'link_degraded'], likely: 'Wind / ice on dish', firstAction: 'Check de-icing heater; hold bulk sync until the weather clears.', eta: 'Weather-dependent' },
  { id: 'instr-gap', title: 'Magnetometer data gaps overnight', category: 'instrument', severity: 'medium',
    symptoms: 'Outdoor sensor drops out after −30 °C nights; neighbours unaffected.',
    evidence: ['data_gap', 'outdoor_sensor'], likely: 'Cold-cracked field cable', firstAction: 'Inspect the outdoor cable run and connectors.', eta: '3–5 h' },
  { id: 'med-battery', title: 'Defibrillator battery test overdue', category: 'medical', severity: 'critical',
    symptoms: 'Monthly self-test missed, backup power not verified.',
    evidence: ['backup_unverified', 'self_test_failed'], likely: 'Battery degradation', firstAction: 'Run the battery test now, swap the pack if it fails.', eta: '1 h' },
  { id: 'roof-snow', title: 'Snow loading on the module roof', category: 'structure', severity: 'low',
    symptoms: 'Drifts above 1.2 m on the leeward side, inspection overdue.',
    evidence: ['snow_load', 'inspection_overdue'], likely: 'Snow loading near design limit', firstAction: 'Clear the drifts and schedule the inspection.', eta: '4–8 h' },
]

// ── Recent diagnoses: hardcoded history so the page is never an empty shell ──

export interface RecentDiagnosis {
  id: string
  when: string
  asset: string
  category: DiagCategory
  topCause: string
  confidence: number
  outcome: 'resolved' | 'monitoring' | 'escalated'
  by: string
}

export const RECENT_DIAGNOSES: RecentDiagnosis[] = [
  { id: 'dx-114', when: '2 h ago', asset: 'CHP Unit 1', category: 'power', topCause: 'Overload — running above rated load factor', confidence: 46, outcome: 'monitoring', by: 'R. Menon' },
  { id: 'dx-113', when: 'Yesterday', asset: 'Deep Freezer 2', category: 'storage', topCause: 'Door seal failure or door left ajar', confidence: 58, outcome: 'resolved', by: 'S. Kulkarni' },
  { id: 'dx-112', when: 'Yesterday', asset: 'PistenBully "Vitesta"', category: 'vehicle', topCause: 'Cold-start pre-heat system fault', confidence: 63, outcome: 'resolved', by: 'A. Das' },
  { id: 'dx-111', when: '3 days ago', asset: 'Desalination Plant', category: 'water', topCause: 'Membrane fouling in the RO train', confidence: 52, outcome: 'escalated', by: 'R. Menon' },
  { id: 'dx-110', when: '4 days ago', asset: 'VSAT Satellite Link', category: 'comms', topCause: 'Weather-correlated signal loss', confidence: 61, outcome: 'resolved', by: 'P. Iyer' },
]

/** Plain-language fallback used when no LLM provider is configured. */
export function offlineAnalysis(input: {
  category: DiagCategory
  assetName: string | null
  evidence: string[]
  causes: RankedCause[]
}): { summary: string; rootCause: string; immediateActions: string[]; riskIfIgnored: string; provider: string } {
  const top = input.causes[0]
  const second = input.causes[1]
  const where = input.assetName ?? `the ${CATEGORY_LABEL[input.category].toLowerCase()} system`
  const evidenceText = input.evidence.length
    ? `With ${input.evidence.length} observation${input.evidence.length > 1 ? 's' : ''} logged (${input.evidence.slice(0, 3).join('; ')}${input.evidence.length > 3 ? '…' : ''}),`
    : 'With no specific observations logged yet, this is a prior-only ranking, so'
  const margin = top && second ? top.score_pct - second.score_pct : 0
  return {
    provider: 'Offline analyst (rule-based)',
    summary: `${evidenceText} the most likely explanation for the problem at ${where} is “${top?.cause ?? 'unknown'}” at ${top?.score_pct.toFixed(0) ?? 0} %. ${
      second ? `It leads “${second.cause}” by ${margin.toFixed(0)} points${margin < 8 ? ' — close enough that both should be checked' : ''}.` : ''
    }`,
    rootCause: top?.cause ?? 'Insufficient evidence',
    immediateActions: top ? top.check_sequence.slice(0, 3) : ['Add observations to narrow the ranking'],
    riskIfIgnored: `Unresolved, this can reduce ${CATEGORY_LABEL[input.category].toLowerCase()} availability and add load on dependent systems. Typical time to fix once confirmed: ${top?.eta ?? 'unknown'}.`,
  }
}
