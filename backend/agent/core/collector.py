"""
Instrument/Equipment Reading Collector — synthetic Antarctic station
telemetry generator.

This agent no longer represents a Windows/Linux host reporting CPU/memory/
disk via psutil — it represents ONE physical HIMADRI station asset
(a generator, fuel tank, freezer, weather station, PistenBully...) and
reports whatever reading series is natural for that asset's category/
subtype, matching Reading.values' free-form JSONB shape
(backend/models/tables.py) and HeartbeatRequest.reading (backend/schemas/
schemas.py: {values: dict[str, float], units: dict[str, str] | None}).

Every value produced here is SYNTHETIC — a base value plus a gentle bounded
random walk (drift + noise), anchored to real documented ranges where the
project's own source material gives one:
  - Maitri winter fuel burn ~20,000 L/month for generator + boiler combined
  - Deep freezers hold -18 to -20 degC
  - AWS temp/pressure/wind are plausible for Schirmacher Oasis, Antarctica
  - A PistenBully needs a cold-start pre-heat cycle below -20 to -25 degC

This module never calls any OS API and never touches real system resources
— it is pure number generation, matching the same safety rule the old
psutil collector never needed but the simulator always has (see
simulator.py's module docstring).
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass, field
from typing import Any, Callable

import structlog

logger = structlog.get_logger(__name__)


def _walk(current: float, step: float, lo: float, hi: float) -> float:
    """One bounded random-walk step: current + gaussian noise, clamped."""
    nxt = current + random.gauss(0.0, step)
    return max(lo, min(hi, nxt))


def _wrap_degrees(current: float, step: float) -> float:
    """Random-walk step for a 0-359 wind-direction style value that wraps
    around instead of clamping."""
    return (current + random.gauss(0.0, step)) % 360.0


@dataclass
class ReadingSnapshot:
    """One tick's worth of synthetic reading values, ready to drop into
    HeartbeatRequest.reading (backend/schemas/schemas.py's ReadingPayload)."""

    values: dict[str, float]
    units: dict[str, str]

    def to_payload(self) -> dict[str, Any]:
        return {
            "values": {k: round(v, 3) for k, v in self.values.items()},
            "units": dict(self.units),
        }


@dataclass
class _AssetState:
    """Per-process synthetic state for the ONE asset this agent instance
    represents. A random walk needs memory between ticks (it is not a pure
    function of time), so this is kept module-level rather than recomputed
    from scratch on every collect() call. Commands (start/stop/setpoint/
    mode) mutate this via apply_command()."""

    category: str
    subtype: str
    spec: dict[str, Any] = field(default_factory=dict)
    values: dict[str, float] = field(default_factory=dict)
    units: dict[str, str] = field(default_factory=dict)
    powered: bool = True
    setpoint: dict[str, Any] = field(default_factory=dict)
    initialized: bool = False


_state: _AssetState | None = None


def identify(category: str, subtype: str | None, spec: dict[str, Any] | None = None) -> None:
    """Called once this process learns which asset it is (GET /agent/whoami
    — see registration.py), and again if the demo role selector changes the
    LOCAL synthetic profile (see heartbeat.HeartbeatThread.set_role). Resets
    the random-walk state so switching profiles doesn't leak a wildly
    out-of-range starting value from the previous profile (e.g. a freezer's
    -19 degC used as a generator's starting kW)."""
    global _state
    _state = _AssetState(category=(category or "").lower(), subtype=(subtype or "").lower(), spec=spec or {})


def apply_command(action: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Apply a delivered Command (see backend/routers/agents.py's
    /agent/command-result contract) to local synthetic state so the next
    reading reflects it. Returns the result dict reported back to the
    backend on the command-result round trip."""
    if _state is None:
        return {"applied": False, "reason": "asset not identified yet"}

    if action == "stop":
        _state.powered = False
        return {"applied": True, "powered": False}
    if action == "start":
        _state.powered = True
        return {"applied": True, "powered": True}
    if action == "setpoint":
        numeric = {k: float(v) for k, v in payload.items() if isinstance(v, (int, float))}
        _state.setpoint.update(numeric)
        return {"applied": True, "setpoint": dict(_state.setpoint)}
    if action == "mode":
        _state.setpoint["_mode"] = payload.get("mode", "")
        return {"applied": True, "mode": payload.get("mode")}
    return {"applied": False, "reason": f"unrecognised action {action!r}"}


def get_current_values() -> dict[str, float]:
    """Return the last-generated values without advancing the walk — used
    by the simulator to snapshot a baseline the instant a fault starts."""
    return dict(_state.values) if _state else {}


def get_identity() -> tuple[str, str]:
    return (_state.category, _state.subtype) if _state else ("", "")


# ─── Per-(category, subtype) generators ─────────────────────────────────────
# Each takes the shared _AssetState and elapsed seconds since the previous
# tick, mutates state.values/units in place, and returns nothing — collect()
# below reads state.values back out afterward. Keeping them side-effecting
# (rather than pure) is what lets each one keep its own persistent baseline
# across ticks without threading extra bookkeeping through every call site.


def _gen_generator(s: _AssetState, dt: float) -> None:
    """power | heating: generator, chp. Runhours accumulate while powered;
    fuel burn tracks load (roughly 0.28-0.32 L/kWh for a diesel genset)."""
    rated_kw = float(s.spec.get("rated_kw", 60.0))
    target = s.setpoint.get("power_kw", rated_kw * 0.55 if s.powered else 0.0)
    prev_power = s.values.get("power_kw", target)
    # Pull gently toward target/setpoint rather than a pure random walk —
    # a generator's load doesn't wander freely, it tracks demand.
    power = prev_power + (target - prev_power) * 0.15
    power = _walk(power, rated_kw * 0.02, 0.0, rated_kw * 1.05)
    if not s.powered:
        power = max(0.0, power - rated_kw * 0.15)

    runhours = s.values.get("runhours", float(s.spec.get("runhours_at_install", 500.0)))
    if s.powered:
        runhours += dt / 3600.0

    fuel_lph = _walk(s.values.get("fuel_lph", power * 0.29 + 0.5), 0.35, 0.0, rated_kw * 0.5)

    s.values.update({"power_kw": power, "runhours": runhours, "fuel_lph": fuel_lph})
    s.units.update({"power_kw": "kW", "runhours": "h", "fuel_lph": "L/h"})


def _gen_fuel_tank(s: _AssetState, dt: float) -> None:
    """storage/fuel_tank. Slow, realistic drain punctuated by rare bulk
    refuels (tanker/convoy delivery). reserve_class in spec (routine |
    emergency_cache | safety_buffer, see InventoryItem/seed data) slows the
    default drain rate for caches that are meant to sit mostly untouched."""
    capacity = float(s.spec.get("capacity_l", 10_000.0))
    reserve_class = str(s.spec.get("reserve_class", "routine"))
    drain_lph = {"routine": 6.0, "emergency_cache": 0.4, "safety_buffer": 0.1}.get(reserve_class, 6.0)

    level = s.values.get("level_l", capacity * random.uniform(0.5, 0.85))
    level = max(0.0, level - drain_lph * (dt / 3600.0) - abs(random.gauss(0, 1.5)))

    # A rare bulk refuel — tanker or convoy delivery topping the tank back up.
    if random.random() < 0.0015:
        level = min(capacity, level + capacity * random.uniform(0.3, 0.6))

    s.values["level_l"] = level
    s.units["level_l"] = "L"


def _gen_freezer_or_chiller(s: _AssetState, dt: float) -> None:
    """storage/freezer (-18..-20 degC target) or storage/chiller (+2..+6 degC)."""
    if s.subtype == "chiller":
        target, lo, hi = 4.0, 1.0, 8.0
    else:
        target, lo, hi = -19.0, -21.0, -16.0
    target = s.setpoint.get("temp_c", target)
    temp = s.values.get("temp_c", target)
    temp += (target - temp) * 0.1
    temp = _walk(temp, 0.12, lo, hi)
    s.values["temp_c"] = temp
    s.units["temp_c"] = "degC"


def _gen_waste_tank(s: _AssetState, dt: float) -> None:
    """waste/wastewater_tank | blackwater_tank | greywater_tank. Slowly
    fills as the station uses it, then periodically drops (pumped out /
    processed by the STP) once it gets fairly full."""
    capacity = float(s.spec.get("capacity_l", 5_000.0))
    fill_lph = float(s.spec.get("fill_lph", 15.0))
    level = s.values.get("level_l", capacity * random.uniform(0.2, 0.5))
    level = min(capacity, level + fill_lph * (dt / 3600.0) + abs(random.gauss(0, 1.0)))
    if level > capacity * 0.85 and random.random() < 0.02:
        level = capacity * random.uniform(0.05, 0.15)  # pumped out / processed
    s.values["level_l"] = level
    s.units["level_l"] = "L"


def _gen_stp(s: _AssetState, dt: float) -> None:
    """waste/stp — Sewage Treatment Plant (Orange Room bioreactor). Cycles
    through its treatment stages and tracks bioreactor temperature (needs
    to stay warm enough to remain biologically active — see
    diagnosis_engine.py's 'Bioreactor temperature drop' cause)."""
    stage = s.values.get("stage", 1.0)
    if random.random() < 0.01:
        stage = (stage % 4.0) + 1.0
    tank_temp = _walk(s.values.get("tank_temp_c", 22.0), 0.3, 12.0, 32.0)
    s.values.update({"stage": stage, "tank_temp_c": tank_temp})
    s.units.update({"stage": "stage", "tank_temp_c": "degC"})


def _gen_aws(s: _AssetState, dt: float) -> None:
    """instrument/aws — Automatic Weather Station. Ranges anchored to
    Schirmacher Oasis / Larsemann Hills coastal-oasis Antarctic climate."""
    temp = _walk(s.values.get("temp_c", -15.0), 0.35, -45.0, 8.0)
    pressure = _walk(s.values.get("pressure_hpa", 985.0), 0.5, 940.0, 1030.0)
    wind = _walk(s.values.get("wind_ms", 8.0), 0.8, 0.0, 40.0)
    wind_dir = _wrap_degrees(s.values.get("wind_dir", random.uniform(0, 360)), 6.0)
    rh = _walk(s.values.get("rh_pct", 55.0), 1.5, 15.0, 98.0)
    s.values.update({"temp_c": temp, "pressure_hpa": pressure, "wind_ms": wind, "wind_dir": wind_dir, "rh_pct": rh})
    s.units.update({"temp_c": "degC", "pressure_hpa": "hPa", "wind_ms": "m/s", "wind_dir": "deg", "rh_pct": "%"})


def _gen_pyranometer(s: _AssetState, dt: float) -> None:
    """instrument/pyranometer — solar radiation logger (Sutron)."""
    solar = _walk(s.values.get("solar_wm2", random.uniform(50, 500)), 15.0, 0.0, 1100.0)
    s.values["solar_wm2"] = solar
    s.units["solar_wm2"] = "W/m2"


def _gen_magnetometer(s: _AssetState, dt: float) -> None:
    """instrument/magnetometer — fluxgate/proton-precession/induction-coil.
    At Antarctic latitudes the field is dominated by its near-vertical (Z)
    component; H (horizontal) and D (declination-axis) components are
    smaller. All three reported in nT to match Reading.values' flat
    {series: float} shape."""
    h_nt = _walk(s.values.get("h_nt", 17_000.0), 4.0, 15_000.0, 19_000.0)
    d_nt = _walk(s.values.get("d_nt", 2_500.0), 3.0, 1_800.0, 3_200.0)
    z_nt = _walk(s.values.get("z_nt", -58_000.0), 5.0, -62_000.0, -54_000.0)
    s.values.update({"h_nt": h_nt, "d_nt": d_nt, "z_nt": z_nt})
    s.units.update({"h_nt": "nT", "d_nt": "nT", "z_nt": "nT"})


def _gen_ahu(s: _AssetState, dt: float) -> None:
    """heating/ahu — runs 24x7x365 (Bharati Master Station). Filter
    differential pressure creeps up between services (dust/frost loading —
    see diagnosis_engine.py's AHU rule)."""
    supply_temp = _walk(s.values.get("supply_temp_c", 20.0), 0.25, 14.0, 26.0)
    filter_dp = s.values.get("filter_dp_pa", 90.0) + random.uniform(0.0, 0.4)
    if filter_dp > 420.0:  # serviced
        filter_dp = random.uniform(50.0, 90.0)
    fan_rpm = _walk(s.values.get("fan_rpm", 1450.0), 8.0, 1150.0, 1500.0)
    s.values.update({"supply_temp_c": supply_temp, "filter_dp_pa": filter_dp, "fan_rpm": fan_rpm})
    s.units.update({"supply_temp_c": "degC", "filter_dp_pa": "Pa", "fan_rpm": "rpm"})


def _gen_boiler(s: _AssetState, dt: float) -> None:
    """heating/boiler."""
    supply_temp = _walk(s.values.get("supply_temp_c", 65.0), 0.4, 45.0, 80.0)
    fuel_lph = _walk(s.values.get("fuel_lph", 3.0), 0.2, 0.0, 8.0)
    s.values.update({"supply_temp_c": supply_temp, "fuel_lph": fuel_lph})
    s.units.update({"supply_temp_c": "degC", "fuel_lph": "L/h"})


def _gen_vehicle(s: _AssetState, dt: float) -> None:
    """vehicle/pistenbully (and ambulance/crane/scooter/dozer sharing the
    same shape) — coolant needs a pre-heat cycle below -20..-25 degC before
    a cold start (see diagnosis_engine.py's PistenBully rule); fault_code
    mirrors what the 16-pin Mini-Doc connector would read (0 = no fault)."""
    operating_temp = 82.0
    coolant = s.values.get("coolant_c", -25.0 if not s.values else operating_temp)
    if s.powered:
        coolant += (operating_temp - coolant) * 0.08
    else:
        coolant += (-20.0 - coolant) * 0.02  # cools back toward ambient when parked
    coolant = _walk(coolant, 1.2, -35.0, 105.0)

    runhours = s.values.get("runhours", float(s.spec.get("runhours_at_install", 800.0)))
    if s.powered:
        runhours += dt / 3600.0

    fault_code = s.values.get("fault_code", 0.0)
    s.values.update({"runhours": runhours, "coolant_c": coolant, "fault_code": fault_code})
    s.units.update({"runhours": "h", "coolant_c": "degC", "fault_code": "code"})


def _gen_ups_monitoring(s: _AssetState, dt: float) -> None:
    """comms/ups_monitoring."""
    battery = _walk(s.values.get("battery_pct", 96.0), 0.4, 40.0, 100.0)
    s.values["battery_pct"] = battery
    s.units["battery_pct"] = "%"


def _gen_generic(s: _AssetState, dt: float) -> None:
    """Fallback for any category/subtype without a dedicated profile above
    (gnss, seismograph, radar, lab_instrument, structure sensors, medical
    equipment status, newly onboarded device types per FR-99...). A single
    generalised 'value' series, matching what
    backend/analysis/feature_engineering.py already assumes for any asset
    without category-specific handling (data_loader._primary_value takes
    the first declared series)."""
    value = _walk(s.values.get("value", 50.0), 2.0, 0.0, 100.0)
    s.values["value"] = value
    s.units["value"] = "unit"


# (category, subtype) -> generator function, falling back to (category, "")
# and finally _gen_generic — mirrors diagnosis_engine.py's own category/
# subtype-with-fallback lookup pattern (FR-99: new device types never
# hard-error, they just get the generic profile).
_GENERATORS: dict[tuple[str, str], Callable[[_AssetState, float], None]] = {
    ("power", "generator"): _gen_generator,
    ("power", "chp"): _gen_generator,
    ("storage", "fuel_tank"): _gen_fuel_tank,
    ("storage", "freezer"): _gen_freezer_or_chiller,
    ("storage", "chiller"): _gen_freezer_or_chiller,
    ("waste", "wastewater_tank"): _gen_waste_tank,
    ("waste", "blackwater_tank"): _gen_waste_tank,
    ("waste", "greywater_tank"): _gen_waste_tank,
    ("waste", "stp"): _gen_stp,
    ("instrument", "aws"): _gen_aws,
    ("instrument", "pyranometer"): _gen_pyranometer,
    ("instrument", "magnetometer"): _gen_magnetometer,
    ("heating", "ahu"): _gen_ahu,
    ("heating", "boiler"): _gen_boiler,
    ("vehicle", "pistenbully"): _gen_vehicle,
    ("vehicle", "ambulance"): _gen_vehicle,
    ("vehicle", "crane"): _gen_vehicle,
    ("vehicle", "scooter"): _gen_vehicle,
    ("vehicle", "dozer"): _gen_vehicle,
    ("comms", "ups_monitoring"): _gen_ups_monitoring,
}


def collect(interval_seconds: float = 10.0) -> ReadingSnapshot:
    """
    Advance the synthetic random walk for this process's identified asset by
    one tick and return the resulting reading. Safe to call from any thread
    that owns the heartbeat cycle (single-threaded use in practice — the
    background heartbeat thread is the only caller).
    """
    global _state
    if _state is None:
        # Not identified yet (whoami hasn't returned) — report an empty
        # reading rather than raising, so a heartbeat sent a beat too early
        # degrades gracefully instead of crashing the thread.
        logger.warning("collector.not_identified")
        return ReadingSnapshot(values={}, units={})

    fn = _GENERATORS.get((_state.category, _state.subtype)) or _GENERATORS.get((_state.category, "")) or _gen_generic
    fn(_state, interval_seconds)
    return ReadingSnapshot(values=dict(_state.values), units=dict(_state.units))


def get_os_info() -> str:
    """Kept for parity with the old collector's helper — now describes the
    synthetic asset identity instead of a real OS, since nothing here reads
    the host OS anymore."""
    if _state is None:
        return "HIMADRI Device Agent (unidentified)"
    return f"HIMADRI Device Agent — {_state.category}/{_state.subtype or 'generic'}"
