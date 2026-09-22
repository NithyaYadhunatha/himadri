"""
Scenario Engine (was Simulation Engine) — What-If / Simulation & Cost Factor
(FR-82…88). A pure, discrete-time day-stepper: never writes live state,
results are always projections.

Five named presets match the Antarctic contingencies this problem statement
actually cares about; a scenario can also vary the same inputs freely
("custom"). Every run reports fuel/food endurance, a survivability verdict
with first-failure day+cause, carbon emitted, and a cost breakdown in INR —
so "what if the resupply ship can't arrive this year" gets a number, not a
guess.
"""

from __future__ import annotations

from typing import Any

import structlog

from backend.config import settings

logger = structlog.get_logger(__name__)

# ─── Cost model constants (INR) — documented, not hidden in the math ───────
COST_PER_LITRE_ATF_INR = 120.0
COST_PER_CONVOY_INR = 500_000.0
COST_PER_SPARE_FAILURE_INR = 150_000.0
COST_OF_UNMITIGATED_FAILURE_INR = 5_000_000.0  # e.g. emergency air resupply/evacuation

PRESET_DEFAULTS: dict[str, dict[str, Any]] = {
    "resupply_fails": {
        "label": "Resupply ship cannot arrive",
        "headcount": 25,
        "generator_availability_pct": 100,
        "fuel_delivery": None,
        "weather_severity": 2,
        "failure_events": [],
    },
    "generator_fails_winter": {
        "label": "Primary generator fails in winter",
        "headcount": 25,
        "generator_availability_pct": 66,
        "fuel_delivery": None,
        "weather_severity": 3,
        "failure_events": [{"day": 10, "type": "generator_failure"}],
    },
    "medical_evacuation": {
        "label": "Medical evacuation during isolation",
        "headcount": 24,
        "generator_availability_pct": 100,
        "fuel_delivery": None,
        "weather_severity": 3,
        "failure_events": [{"day": 5, "type": "medevac_convoy"}],
    },
    "convoy_stranded": {
        "label": "Convoy stranded en route",
        "headcount": 25,
        "generator_availability_pct": 100,
        "fuel_delivery": None,
        "weather_severity": 4,
        "failure_events": [{"day": 3, "type": "convoy_stranded"}],
    },
    "extended_storm": {
        "label": "Extended katabatic storm",
        "headcount": 25,
        "generator_availability_pct": 85,
        "fuel_delivery": None,
        "weather_severity": 5,
        "failure_events": [{"day": 7, "type": "storm_onset", "duration_days": 14}],
    },
}


def preset_inputs(preset: str) -> dict[str, Any]:
    if preset not in PRESET_DEFAULTS:
        raise ValueError(f"Unknown preset {preset!r}")
    return dict(PRESET_DEFAULTS[preset])


def run_scenario(
    *,
    horizon_days: int,
    inputs: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any]:
    """
    Step station state forward day by day.

    context (current known station state, supplied by the caller from live
    inventory/asset data):
      fuel_liters, food_days_available, base_fuel_burn_lph, isolation_days_remaining

    inputs (what the user is varying):
      headcount, generator_availability_pct, weather_severity (1-5),
      fuel_delivery: {day, litres} | None, failure_events: [{day, type, ...}]
    """
    fuel_liters = float(context.get("fuel_liters", 0.0))
    food_days_available = float(context.get("food_days_available", 0.0))
    base_burn_lph = float(context.get("base_fuel_burn_lph", 27.0))  # ~20,000 L/month baseline
    headcount = float(inputs.get("headcount", context.get("headcount", 25)))
    baseline_headcount = float(context.get("headcount", 25)) or 1.0
    generator_availability_pct = float(inputs.get("generator_availability_pct", 100))
    weather_severity = int(inputs.get("weather_severity", 1))
    fuel_delivery = inputs.get("fuel_delivery")
    failure_events = {int(e["day"]): e for e in inputs.get("failure_events", [])}

    active_failure_multiplier = 1.0
    fuel_convoys_used = 0
    spare_failures = 0
    first_failure_day: int | None = None
    first_failure_cause: str | None = None
    timeline: list[dict[str, Any]] = []
    total_fuel_consumed = 0.0

    for day in range(horizon_days + 1):
        event = failure_events.get(day)
        if event:
            etype = event.get("type")
            if etype == "generator_failure":
                active_failure_multiplier *= 1.35  # remaining generators work harder, burn more
                spare_failures += 1
            elif etype in ("convoy_stranded", "medevac_convoy"):
                fuel_convoys_used += 1
            elif etype == "storm_onset":
                weather_severity = max(weather_severity, 5)

        weather_load = 1.0 + (weather_severity - 1) * 0.08
        headcount_load = 0.6 + 0.4 * (headcount / baseline_headcount)
        generator_load = 100.0 / max(generator_availability_pct, 1.0)

        daily_burn_l = base_burn_lph * 24.0 * weather_load * headcount_load * generator_load * active_failure_multiplier
        fuel_liters -= daily_burn_l
        total_fuel_consumed += daily_burn_l
        food_days_available -= (headcount / baseline_headcount)

        if fuel_delivery and int(fuel_delivery.get("day", -1)) == day:
            fuel_liters += float(fuel_delivery.get("litres", 0.0))

        if day % 7 == 0 or day == horizon_days:
            timeline.append({
                "day": day,
                "fuel_liters": round(max(fuel_liters, 0.0), 1),
                "food_days_left": round(max(food_days_available, 0.0), 1),
            })

        if first_failure_day is None:
            if fuel_liters <= 0:
                first_failure_day = day
                first_failure_cause = "Fuel exhausted (generator + heating + vehicle load)"
            elif food_days_available <= 0:
                first_failure_day = day
                first_failure_cause = "Food stock exhausted against headcount"

    isolation_remaining = float(context.get("isolation_days_remaining", horizon_days))
    fuel_endurance_days = round(
        (context.get("fuel_liters", 0.0) / max(base_burn_lph * 24.0, 1.0)), 1
    )
    food_endurance_days = round(food_days_available + (horizon_days - (first_failure_day or horizon_days)), 1)

    survivability_verdict = "fails" if first_failure_day is not None else "survives"

    carbon_kg = total_fuel_consumed * settings.EMISSION_FACTOR_ATF
    fuel_cost = total_fuel_consumed * COST_PER_LITRE_ATF_INR
    logistics_cost = fuel_convoys_used * COST_PER_CONVOY_INR
    spares_cost = spare_failures * COST_PER_SPARE_FAILURE_INR
    avoided_failure_cost = COST_OF_UNMITIGATED_FAILURE_INR if survivability_verdict == "fails" else 0.0
    total_cost_inr = fuel_cost + logistics_cost + spares_cost + avoided_failure_cost

    result = {
        "fuel_endurance_days": fuel_endurance_days,
        "food_endurance_days": max(food_endurance_days, 0.0),
        "power_adequacy": generator_availability_pct >= 60,
        "heating_adequacy": generator_availability_pct >= 50 and weather_severity < 5,
        "survivability_verdict": survivability_verdict,
        "first_failure_at_day": first_failure_day,
        "first_failure_cause": first_failure_cause,
        "carbon_kg_co2e": round(carbon_kg, 1),
        "cost_inr": {
            "fuel": round(fuel_cost, 0),
            "logistics": round(logistics_cost, 0),
            "spares": round(spares_cost, 0),
            "avoided_failure": round(avoided_failure_cost, 0),
            "total": round(total_cost_inr, 0),
        },
        "timeline": timeline,
        "isolation_days_remaining": isolation_remaining,
    }
    logger.info(
        "scenario_engine.run_complete",
        verdict=survivability_verdict,
        first_failure_at_day=first_failure_day,
        total_cost_inr=round(total_cost_inr, 0),
    )
    return result
