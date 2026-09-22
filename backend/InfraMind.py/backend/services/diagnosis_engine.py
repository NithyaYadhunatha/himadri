"""
Diagnosis Engine — guided fault diagnosis (FR-78…80).

A curated fault -> cause -> evidence knowledge base, seeded from the
documented Antarctic maintenance procedures (PistenBully cold-start
chamber/blower/igniter, reading fault codes via the 16-pin Mini-Doc
connector when the display is dead, sewage-treatment stage failures, AHU
filter differential pressure...). Ranking is an explicit Bayesian-style
update over observed evidence flags, not a trained model — there's no
historical fault dataset for these stations, so a curated, explainable
knowledge base is honest where a black box would not be (mirrors the risk
engine's own reasoning — see risk_engine.py's module docstring).

Rules are keyed by (asset category, asset subtype). Falling back to just
category when no subtype-specific entry exists keeps this usable for any
newly-onboarded device (FR-99) without a code change.
"""

from __future__ import annotations

from typing import Any

# Each cause: prior (0-1 baseline likelihood within its fault group),
# evidence (keys that, if present+true in observed_evidence, boost the
# score), and check_sequence (ordered recommended checks, FR-78/79).
_RULES: dict[tuple[str, str], dict[str, Any]] = {
    ("vehicle", "pistenbully"): {
        "fault": "PistenBully will not start / cold-start fault",
        "causes": [
            {
                "cause": "Cold-start pre-heat system fault (chamber, blower, or igniter)",
                "prior": 0.45,
                "evidence": ["ambient_below_minus20c", "coolant_cold", "preheat_cycle_incomplete"],
                "check_sequence": [
                    "Check ambient and coolant temperature readings",
                    "Confirm the pre-heat cycle (chamber/blower/igniter) completed before crank",
                    "Inspect the pre-heat chamber and blower for a stalled or seized fault",
                    "Check the igniter element for continuity",
                ],
            },
            {
                "cause": "Battery/starting circuit weak in extreme cold",
                "prior": 0.25,
                "evidence": ["ambient_below_minus20c", "slow_crank"],
                "check_sequence": [
                    "Measure battery voltage under crank load",
                    "Inspect battery insulation/heating blanket if fitted",
                ],
            },
            {
                "cause": "Fault the on-board display cannot show (display fault or unrelated ECU code)",
                "prior": 0.30,
                "evidence": ["display_dead"],
                "check_sequence": [
                    "Connect the 16-pin Mini-Doc connector to bypass the display and read fault codes directly",
                    "Cross-reference the returned code against the fleet fault-code sheet",
                ],
            },
        ],
    },
    ("power", "generator"): {
        "fault": "Generator output degraded or generator fault",
        "causes": [
            {
                "cause": "Fuel starvation or clogged fuel filter",
                "prior": 0.35,
                "evidence": ["fuel_pressure_low", "recent_refuel"],
                "check_sequence": [
                    "Check fuel filter differential pressure",
                    "Verify fuel supply line pressure at the generator inlet",
                    "Inspect for water/contamination in the fuel sample",
                ],
            },
            {
                "cause": "Overload — running above rated load factor",
                "prior": 0.30,
                "evidence": ["load_factor_above_90pct"],
                "check_sequence": [
                    "Compare current load (kW) against rated capacity",
                    "Check for a stuck/duplicated load (e.g. two generators paralleled unintentionally)",
                ],
            },
            {
                "cause": "Cooling system fault (overheating)",
                "prior": 0.20,
                "evidence": ["coolant_temp_high"],
                "check_sequence": [
                    "Check coolant temperature and level",
                    "Inspect radiator/heat exchanger for blockage",
                ],
            },
            {
                "cause": "Injector wear / poor combustion",
                "prior": 0.15,
                "evidence": ["fuel_efficiency_declining"],
                "check_sequence": [
                    "Check fuel efficiency trend (L/kWh) against baseline",
                    "Schedule injector inspection if trend confirms",
                ],
            },
        ],
    },
    ("storage", "freezer"): {
        "fault": "Freezer temperature deviation from -18..-20°C target",
        "causes": [
            {
                "cause": "Door seal failure or door left open",
                "prior": 0.35,
                "evidence": ["temp_rising_fast", "recent_access_logged"],
                "check_sequence": [
                    "Inspect door seal for gaps/ice buildup",
                    "Confirm the door latched fully on last access",
                ],
            },
            {
                "cause": "Compressor fault",
                "prior": 0.30,
                "evidence": ["compressor_not_cycling"],
                "check_sequence": [
                    "Check compressor run status and current draw",
                    "Listen/inspect for a seized or short-cycling compressor",
                ],
            },
            {
                "cause": "Refrigerant leak",
                "prior": 0.20,
                "evidence": ["temp_rising_slow", "long_service_interval"],
                "check_sequence": [
                    "Check refrigerant pressure against nameplate spec",
                    "Inspect visible lines for oil residue (leak indicator)",
                ],
            },
            {
                "cause": "Thermostat/sensor fault (false reading)",
                "prior": 0.15,
                "evidence": ["reading_erratic"],
                "check_sequence": [
                    "Cross-check with a secondary thermometer",
                    "Recalibrate or replace the thermostat sensor",
                ],
            },
        ],
    },
    ("instrument", "default"): {
        "fault": "Science instrument data dropout / continuity loss",
        "causes": [
            {
                "cause": "Local power supply interruption",
                "prior": 0.30,
                "evidence": ["power_flagged_unstable"],
                "check_sequence": [
                    "Check local UPS/power supply status for the instrument rack",
                    "Confirm the circuit wasn't affected by a recent generator switchover",
                ],
            },
            {
                "cause": "Comms link fault to the central logging server",
                "prior": 0.30,
                "evidence": ["other_instruments_also_dropped"],
                "check_sequence": [
                    "Check the modem/link status to the central server",
                    "Test connectivity to a neighbouring instrument on the same link",
                ],
            },
            {
                "cause": "Field cable damage (cold-cracking)",
                "prior": 0.25,
                "evidence": ["outdoor_sensor", "recent_extreme_cold"],
                "check_sequence": [
                    "Visually inspect the outdoor cable run for cracking/breaks",
                    "Check connector continuity at both ends",
                ],
            },
            {
                "cause": "Logging software crash",
                "prior": 0.15,
                "evidence": ["screenshots_stopped_only"],
                "check_sequence": [
                    "Check whether the logging process is still running on the Linux host",
                    "Restart the logging software and confirm resumed sampling",
                ],
            },
        ],
    },
    ("waste", "stp"): {
        "fault": "Sewage treatment plant stage not progressing",
        "causes": [
            {
                "cause": "Sludge pump blockage",
                "prior": 0.35,
                "evidence": ["stage_stuck_at_sludge_removal"],
                "check_sequence": [
                    "Check sludge pump run status and discharge pressure",
                    "Inspect pump inlet for blockage",
                ],
            },
            {
                "cause": "Bioreactor temperature drop (below effective range)",
                "prior": 0.30,
                "evidence": ["orange_room_temp_low"],
                "check_sequence": [
                    "Check Orange Room tank thermostat/heater status",
                    "Verify bioreactor temperature against the effective range",
                ],
            },
            {
                "cause": "UF/UV filter fouling",
                "prior": 0.25,
                "evidence": ["stage_stuck_at_filter"],
                "check_sequence": [
                    "Check UF filter differential pressure",
                    "Check UV lamp status/output",
                ],
            },
        ],
    },
    ("heating", "ahu"): {
        "fault": "AHU filter differential pressure high / airflow degraded",
        "causes": [
            {
                "cause": "Filter fouling / dust-and-frost loading",
                "prior": 0.5,
                "evidence": ["filter_dp_above_threshold"],
                "check_sequence": [
                    "Read current filter differential pressure against baseline",
                    "Schedule filter replacement if above threshold",
                ],
            },
            {
                "cause": "Fan speed fault",
                "prior": 0.3,
                "evidence": ["fan_rpm_below_setpoint"],
                "check_sequence": [
                    "Compare fan RPM against setpoint",
                    "Inspect fan belt/motor for wear",
                ],
            },
            {
                "cause": "Damper stuck",
                "prior": 0.2,
                "evidence": ["supply_temp_erratic"],
                "check_sequence": [
                    "Inspect damper position vs commanded position",
                ],
            },
        ],
    },
}


def diagnose(
    category: str,
    subtype: str | None,
    observed_evidence: dict[str, bool] | None = None,
) -> dict[str, Any]:
    """Return ranked probable causes with evidence and a recommended check
    sequence for the given asset category/subtype. Falls back to a generic
    "no curated rule yet" response for unrecognised categories so newly
    onboarded device types never hard-error."""
    observed_evidence = observed_evidence or {}
    key = (category, subtype or "")
    if key not in _RULES:
        key = (category, "default")
    if key not in _RULES:
        return {
            "fault": f"No curated diagnosis rules yet for category={category!r} subtype={subtype!r}",
            "causes": [],
        }

    rule = _RULES[key]
    ranked = []
    for cause in rule["causes"]:
        matched = [e for e in cause["evidence"] if observed_evidence.get(e)]
        boost = 0.15 * len(matched)
        score = min(cause["prior"] + boost, 1.0)
        ranked.append({
            "cause": cause["cause"],
            "score_pct": round(score * 100, 1),
            "matched_evidence": matched,
            "all_evidence_considered": cause["evidence"],
            "check_sequence": cause["check_sequence"],
        })
    ranked.sort(key=lambda c: c["score_pct"], reverse=True)
    return {"fault": rule["fault"], "causes": ranked}


def known_fault_types() -> list[dict[str, str]]:
    return [{"category": c, "subtype": s, "fault": r["fault"]} for (c, s), r in _RULES.items()]
