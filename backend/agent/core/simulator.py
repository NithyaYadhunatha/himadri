"""
Simulator — injects SYNTHETIC fault values for HIMADRI demos.

CRITICAL: This module NEVER calls any OS command that touches real system
resources. All simulations only produce fake numbers that override the
collector's synthetic reading values in the heartbeat payload — same rule
as the old InfraMind IT-metric simulator, applied to Antarctic station
telemetry instead.

Five fault injections, chosen to match backend/services/diagnosis_engine.py's
curated rule keys so a demo operator can trigger a fault here and then walk
through the matching guided-diagnosis flow on the dashboard:

  generator_fault    — power/generator: fuel starvation. power_kw ramps down,
                       fuel_lph ramps up (matches diagnosis_engine's "Fuel
                       starvation or clogged fuel filter" cause).
  freezer_warming    — storage/freezer|chiller: temp_c climbs toward 0 degC
                       (matches "Door seal failure" / "Compressor fault").
  fuel_leak          — storage/fuel_tank: level_l drains far faster than the
                       collector's normal consumption rate.
  instrument_dropout — instrument/*: readings freeze at their fault-start
                       values (a real dropout stops updating, it doesn't
                       usually go to zero) — matches "Local power supply
                       interruption" / "Comms link fault".
  pb_coolant_fault   — vehicle/pistenbully: coolant_c spikes and fault_code
                       goes nonzero (matches "Cold-start pre-heat system
                       fault").
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any

import structlog

logger = structlog.get_logger(__name__)

FAULT_TYPES: tuple[str, ...] = (
    "generator_fault",
    "freezer_warming",
    "fuel_leak",
    "instrument_dropout",
    "pb_coolant_fault",
)


@dataclass
class SimulationState:
    """Thread-safe state for the active fault injection."""

    active: bool = False
    simulation_type: str | None = None
    _baseline: dict[str, float] = field(default_factory=dict)
    _start_time: float = 0.0
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def start(self, simulation_type: str, current_values: dict[str, Any]) -> None:
        with self._lock:
            self.active = True
            self.simulation_type = simulation_type
            self._baseline = {k: float(v) for k, v in current_values.items() if isinstance(v, (int, float))}
            self._start_time = time.monotonic()
            logger.info("simulator.started", type=simulation_type)

    def stop(self) -> None:
        with self._lock:
            self.active = False
            self.simulation_type = None
            self._baseline = {}
            logger.info("simulator.stopped")

    def get_overrides(self) -> tuple[bool, str | None, dict[str, float]]:
        """Return (active, simulation_type, overrides_dict). Thread-safe."""
        with self._lock:
            if not self.active:
                return False, None, {}
            return True, self.simulation_type, self._compute_overrides()

    def _compute_overrides(self) -> dict[str, float]:
        elapsed = time.monotonic() - self._start_time
        b = self._baseline
        sim_type = self.simulation_type

        if sim_type == "generator_fault":
            # Fuel starvation: output decays toward ~20% of baseline over
            # ~90s while fuel burn climbs (poor combustion, injector
            # struggling against a clogged filter) — snappy enough for a
            # live demo, not a real multi-hour degradation curve.
            decay = min(elapsed / 90.0, 1.0)
            power = b.get("power_kw", 40.0) * (1.0 - 0.8 * decay)
            fuel = b.get("fuel_lph", 12.0) * (1.0 + 0.8 * decay)
            return {"power_kw": max(power, 0.0), "fuel_lph": fuel}

        if sim_type == "freezer_warming":
            base_temp = b.get("temp_c", -19.0)
            rise = min(elapsed * 0.08, base_temp * -1 + 2.0)  # climbs toward ~+2 degC
            return {"temp_c": min(base_temp + rise, 2.0)}

        if sim_type == "fuel_leak":
            base_level = b.get("level_l", 5000.0)
            leak_lph = 60.0  # far above the collector's normal ~6 L/h drain
            level = max(base_level - leak_lph * (elapsed / 3600.0), 0.0)
            return {"level_l": level}

        if sim_type == "instrument_dropout":
            # A dead link/power interruption doesn't zero the last reading
            # out — it just stops updating. Freeze every numeric series at
            # its fault-start value.
            return dict(b)

        if sim_type == "pb_coolant_fault":
            target = 128.0
            start = b.get("coolant_c", 82.0)
            coolant = start + min(elapsed * 1.2, target - start)
            return {"coolant_c": coolant, "fault_code": 42.0}

        return {}


# Global singleton — shared between heartbeat thread and GUI
simulation_state = SimulationState()


def apply_simulation(values: dict[str, float]) -> dict[str, float]:
    """
    Merge simulation overrides into the collector's real synthetic values.
    Returns a new dict — never modifies the original, and never mutates the
    collector's own persistent random-walk state (so stopping a simulation
    resumes the organic drift from wherever it naturally was, not from the
    faked value).
    """
    active, _sim_type, overrides = simulation_state.get_overrides()
    if not active:
        return values

    merged = dict(values)
    merged.update(overrides)
    return merged


def is_fault_active() -> bool:
    active, _sim_type, _overrides = simulation_state.get_overrides()
    return active
