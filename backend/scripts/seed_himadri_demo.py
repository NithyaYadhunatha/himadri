"""
seed_himadri_demo.py — Seed Postgres with a REALISTIC, richly detailed
Maitri + Bharati topology for demos: zones, assets, inventory, convoys,
waste records, and alert rules.

Standalone — NOT wired into docker-compose.yml's startup command (that
still runs only scripts/init_db.py's minimal 3-asset-per-station seed).
Run manually before a demo:

    python scripts/seed_himadri_demo.py

Idempotent: every row uses a deterministic id (Asset/Zone/InventoryItem/
Convoy ids are readable slugs; ConvoyAssignment/WasteRecord ids are uuid5
of a stable name) so re-running updates existing rows instead of
duplicating them — check-by-primary-key before insert, same pattern as
scripts/init_db.py.

Source-of-truth note (provenance field on every row): facts explicitly
given in the project's own SRS/source material are marked 'verified' or
'documentary'; the exact numeric values used to make those facts concrete
(a tank's exact litres, a generator's exact kW rating, an inventory
quantity) are this script's own reasonable estimate within the documented
range and marked 'simulated' unless stated otherwise. The Maitri boiler/
heat-trace system is marked 'unverified' per the source material's own
explicit flag on that detail.
"""

from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent))

# pyrefly: ignore [missing-import]
import structlog

from backend.database.postgres import get_session_factory
from backend.models.tables import (
    AlertRule,
    Asset,
    Convoy,
    ConvoyAssignment,
    InventoryItem,
    Station,
    WasteRecord,
    Zone,
)

logger = structlog.get_logger(__name__)

NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "himadri.demo-seed")


def stable_uuid(name: str) -> str:
    """Deterministic UUID for rows whose primary key isn't a natural slug
    (ConvoyAssignment, WasteRecord) — reruns update instead of duplicate."""
    return str(uuid.uuid5(NAMESPACE, name))


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ─── Stations ────────────────────────────────────────────────────────────────
# Both already exist from scripts/init_db.py — updated here with the fuller
# description text, left otherwise unchanged.

STATIONS: list[dict[str, Any]] = [
    {
        "id": "maitri", "name": "Maitri", "lat": -70.7667, "lon": 11.7333, "elevation_m": 117.0,
        "established": date(1989, 1, 1), "winter_capacity": 25, "summer_capacity": 45,
        "local_utc_offset_minutes": 180,
        "description": "Schirmacher Oasis, Queen Maud Land, East Antarctica. India's second "
                        "permanent Antarctic research station, operational since 1989.",
        "provenance": "verified",
    },
    {
        "id": "bharati", "name": "Bharati", "lat": -69.4000, "lon": 76.1833, "elevation_m": 35.0,
        "established": date(2012, 3, 18), "winter_capacity": 23, "summer_capacity": 46,
        "local_utc_offset_minutes": 300,
        "description": "Larsemann Hills, Prydz Bay, East Antarctica. India's third and newest "
                        "permanent Antarctic research station, a 4-floor containerized structure.",
        "provenance": "verified",
    },
]

# ─── Zones ───────────────────────────────────────────────────────────────────
# (id, station_id, parent_id, name, kind, floor, restricted, provenance)

MAITRI_ZONES: list[tuple[str, str, str | None, str, str, int | None, bool, str]] = [
    ("maitri-main-building", "maitri", None, "Main Building", "module", 0, False, "documentary"),
    ("maitri-outdoor", "maitri", None, "Outdoor Facilities", "outdoor", None, False, "documentary"),

    # Indoor rooms (Main Building)
    ("maitri-common-lounge", "maitri", "maitri-main-building", "Common Lounge", "room", 0, False, "documentary"),
    ("maitri-dining-area", "maitri", "maitri-main-building", "Dining Area", "room", 0, False, "documentary"),
    ("maitri-kitchen", "maitri", "maitri-main-building", "Kitchen", "room", 0, False, "documentary"),
    ("maitri-library", "maitri", "maitri-main-building", "Library", "room", 0, False, "documentary"),
    ("maitri-games-room", "maitri", "maitri-main-building", "Indoor Games Room", "room", 0, False, "documentary"),
    ("maitri-prayer-room", "maitri", "maitri-main-building", "Prayer Room", "room", 0, False, "documentary"),
    ("maitri-gym", "maitri", "maitri-main-building", "Gym", "room", 0, False, "documentary"),
    ("maitri-laundry", "maitri", "maitri-main-building", "Laundry", "room", 0, False, "documentary"),
    ("maitri-leaders-room", "maitri", "maitri-main-building", "Leader's Room", "room", 0, False, "documentary"),
    ("maitri-hospital", "maitri", "maitri-main-building", "Maitri Hospital", "room", 0, False, "documentary"),
    ("maitri-orange-room", "maitri", "maitri-main-building", "Orange Room (Wastewater)", "room", 0, False, "documentary"),
    ("maitri-kuber-waste-area", "maitri", "maitri-main-building", "Kuber Waste Area", "room", 0, False, "documentary"),

    # Outdoor / standalone facilities
    ("maitri-fuel-farm", "maitri", "maitri-outdoor", "Fuel Farm", "outdoor", None, False, "documentary"),
    ("maitri-fuel-station", "maitri", "maitri-outdoor", "Fuel Station", "outdoor", None, False, "documentary"),
    ("maitri-lake-pump-house", "maitri", "maitri-outdoor", "Lake-Water Pump House", "outdoor", None, False, "documentary"),
    ("maitri-summer-camp", "maitri", "maitri-outdoor", "Summer Camp", "module", None, False, "documentary"),
    ("maitri-containerized-modules", "maitri", "maitri-outdoor", "Containerized Modules", "module", None, False, "documentary"),
    ("maitri-garden-hut", "maitri", "maitri-outdoor", "Garden Hut", "outdoor", None, False, "documentary"),
    ("maitri-geomagnetism-lab", "maitri", "maitri-outdoor", "Geomagnetism Lab", "module", None, False, "documentary"),
    ("maitri-atmospheric-science-lab", "maitri", "maitri-outdoor", "Atmospheric Science Lab", "module", None, False, "documentary"),
    ("maitri-mara-radar-site", "maitri", "maitri-outdoor", "MARA Radar Site", "outdoor", None, False, "documentary"),
    ("maitri-sankalp-cache", "maitri", "maitri-outdoor", "Sankalp Ice-Shelf Fuel Cache", "route_point", None, False, "documentary"),
    ("maitri-ship-transfer-point", "maitri", "maitri-outdoor", "Ship Transfer Point", "route_point", None, False, "documentary"),
]

BHARATI_ZONES: list[tuple[str, str, str | None, str, str, int | None, bool, str]] = [
    ("bharati-ground-floor", "bharati", None, "Ground Floor", "floor", 0, False, "documentary"),
    ("bharati-1st-floor", "bharati", None, "1st Floor (Master Station)", "floor", 1, False, "documentary"),
    ("bharati-2nd-floor", "bharati", None, "2nd Floor", "floor", 2, False, "documentary"),
    ("bharati-3rd-floor", "bharati", None, "3rd Floor", "floor", 3, False, "documentary"),

    # Ground floor
    ("bharati-garage", "bharati", "bharati-ground-floor", "Garage", "room", 0, False, "documentary"),
    ("bharati-workshop", "bharati", "bharati-ground-floor", "Workshop", "room", 0, False, "documentary"),
    ("bharati-chp-room", "bharati", "bharati-ground-floor", "CHP / Generator Room", "room", 0, False, "documentary"),
    ("bharati-store-room-1", "bharati", "bharati-ground-floor", "Store Room 1", "room", 0, False, "documentary"),
    ("bharati-store-room-2", "bharati", "bharati-ground-floor", "Store Room 2", "room", 0, False, "documentary"),
    ("bharati-dangri-room-west", "bharati", "bharati-ground-floor", "Dangri Room West", "room", 0, False, "documentary"),
    ("bharati-dangri-room-east", "bharati", "bharati-ground-floor", "Dangri Room East", "room", 0, False, "documentary"),
    ("bharati-heat-exchange-room", "bharati", "bharati-ground-floor", "Heat Exchange Room", "room", 0, False, "documentary"),
    ("bharati-chemical-room", "bharati", "bharati-ground-floor", "Chemical Room", "room", 0, False, "documentary"),
    ("bharati-wastewater-room", "bharati", "bharati-ground-floor", "Wastewater Room", "room", 0, False, "documentary"),
    ("bharati-imd-lab", "bharati", "bharati-ground-floor", "IMD Lab", "room", 0, False, "documentary"),
    ("bharati-barc-lab", "bharati", "bharati-ground-floor", "BARC Lab", "room", 0, False, "documentary"),
    ("bharati-gsi-lab", "bharati", "bharati-ground-floor", "GSI Lab", "room", 0, False, "documentary"),
    ("bharati-lab-store", "bharati", "bharati-ground-floor", "Lab Store", "room", 0, False, "documentary"),
    ("bharati-food-store", "bharati", "bharati-ground-floor", "Food Store", "room", 0, False, "documentary"),
    ("bharati-microbiology-lab", "bharati", "bharati-ground-floor", "Microbiology Lab", "room", 0, False, "documentary"),

    # 1st floor — Master Station
    ("bharati-leaders-office", "bharati", "bharati-1st-floor", "Leader's Office", "room", 1, False, "documentary"),
    ("bharati-communication-room", "bharati", "bharati-1st-floor", "Communication Room", "room", 1, False, "documentary"),
    ("bharati-satellite-control-room", "bharati", "bharati-1st-floor", "Satellite Control Room", "room", 1, True, "documentary"),
    ("bharati-library", "bharati", "bharati-1st-floor", "Library", "room", 1, False, "documentary"),
    ("bharati-internet-room", "bharati", "bharati-1st-floor", "Internet Room", "room", 1, False, "documentary"),
    ("bharati-gym", "bharati", "bharati-1st-floor", "Gym", "room", 1, False, "documentary"),
    ("bharati-mlb-room", "bharati", "bharati-1st-floor", "MLB Room", "room", 1, False, "documentary"),
    ("bharati-south-interspace", "bharati", "bharati-1st-floor", "South Interspace", "room", 1, False, "documentary"),
    ("bharati-north-interspace", "bharati", "bharati-1st-floor", "North Interspace", "room", 1, False, "documentary"),
    ("bharati-ups-room", "bharati", "bharati-1st-floor", "UPS Room", "room", 1, False, "documentary"),

    # 2nd floor
    ("bharati-living-quarters", "bharati", "bharati-2nd-floor", "Living Quarters", "room", 2, False, "documentary"),
    ("bharati-2f-kitchen", "bharati", "bharati-2nd-floor", "Kitchen", "room", 2, False, "documentary"),
    ("bharati-dining-hall", "bharati", "bharati-2nd-floor", "Dining Hall", "room", 2, False, "documentary"),
    ("bharati-medical-room", "bharati", "bharati-2nd-floor", "Medical Room", "room", 2, False, "documentary"),
    ("bharati-operation-theatre", "bharati", "bharati-2nd-floor", "Operation Theatre", "room", 2, True, "documentary"),
    ("bharati-2f-laundry", "bharati", "bharati-2nd-floor", "Laundry", "room", 2, False, "documentary"),
    ("bharati-2f-prayer-room", "bharati", "bharati-2nd-floor", "Prayer Room", "room", 2, False, "documentary"),
    ("bharati-vc-room", "bharati", "bharati-2nd-floor", "Entertainment / VC Room", "room", 2, False, "documentary"),
    ("bharati-daisy-bar", "bharati", "bharati-2nd-floor", "Daisy Bar Lounge", "room", 2, False, "documentary"),
    ("bharati-table-tennis-room", "bharati", "bharati-2nd-floor", "Table-Tennis Room", "room", 2, False, "documentary"),

    # 3rd floor
    ("bharati-ahu-plant-room", "bharati", "bharati-3rd-floor", "AHU Plant Room", "room", 3, False, "documentary"),
    ("bharati-terrace", "bharati", "bharati-3rd-floor", "Terrace", "outdoor", 3, False, "documentary"),
]


def build_zone(row: tuple) -> dict[str, Any]:
    zone_id, station_id, parent_id, name, kind, floor, restricted, provenance = row
    return {
        "id": zone_id, "station_id": station_id, "parent_id": parent_id, "name": name,
        "kind": kind, "floor": floor, "restricted": restricted, "layout": None, "provenance": provenance,
    }


# ─── Assets ──────────────────────────────────────────────────────────────────
# Each entry: id, station_id, zone_id, name, category, subtype, manufacturer,
# spec, controllable, life_safety, primary_series, primary_unit, provenance


def _fuel_tank(idx: int, capacity_l: float, zone_id: str, reserve_class: str = "routine") -> dict[str, Any]:
    return {
        "id": f"maitri-storage-fuel-tank-{idx:02d}", "station_id": "maitri", "zone_id": zone_id,
        "name": f"Fuel Tank {idx:02d}", "category": "storage", "subtype": "fuel_tank", "manufacturer": None,
        "spec": {"capacity_l": capacity_l, "fuel_type": "atf", "reserve_class": reserve_class},
        "controllable": False, "life_safety": False, "primary_series": "level_l", "primary_unit": "L",
        "provenance": "documentary" if reserve_class != "routine" else "simulated",
    }


MAITRI_ASSETS: list[dict[str, Any]] = [
    # ── Fuel farm — 8 of ~56-57 tanks, 3-24 kL each ────────────────────────
    _fuel_tank(1, 24_000.0, "maitri-fuel-farm"),
    _fuel_tank(2, 24_000.0, "maitri-fuel-farm"),
    _fuel_tank(3, 18_000.0, "maitri-fuel-farm"),
    _fuel_tank(4, 12_000.0, "maitri-fuel-farm"),
    _fuel_tank(5, 12_000.0, "maitri-fuel-farm"),
    _fuel_tank(6, 8_000.0, "maitri-fuel-farm"),
    _fuel_tank(7, 5_000.0, "maitri-fuel-farm"),
    _fuel_tank(8, 3_000.0, "maitri-fuel-farm"),

    # ── Emergency fuel caches / safety buffers ─────────────────────────────
    {
        "id": "maitri-storage-fuel-tank-sankalp", "station_id": "maitri", "zone_id": "maitri-sankalp-cache",
        "name": "Sankalp Ice-Shelf Fuel Cache", "category": "storage", "subtype": "fuel_tank", "manufacturer": None,
        "spec": {"capacity_l": 20_000.0, "fuel_type": "atf", "reserve_class": "emergency_cache"},
        "controllable": False, "life_safety": False, "primary_series": "level_l", "primary_unit": "L",
        "provenance": "documentary",
    },
    {
        "id": "maitri-storage-fuel-tank-ship-transfer", "station_id": "maitri", "zone_id": "maitri-ship-transfer-point",
        "name": "Ship Transfer Fuel Cache", "category": "storage", "subtype": "fuel_tank", "manufacturer": None,
        "spec": {"capacity_l": 24_000.0, "fuel_type": "atf", "reserve_class": "emergency_cache"},
        "controllable": False, "life_safety": False, "primary_series": "level_l", "primary_unit": "L",
        "provenance": "documentary",
    },
    {
        "id": "maitri-storage-fuel-tank-safety-01", "station_id": "maitri", "zone_id": "maitri-fuel-farm",
        "name": "Safety Buffer Tank 1", "category": "storage", "subtype": "fuel_tank", "manufacturer": None,
        "spec": {"capacity_l": 2_000.0, "fuel_type": "atf", "reserve_class": "safety_buffer"},
        "controllable": False, "life_safety": False, "primary_series": "level_l", "primary_unit": "L",
        "provenance": "documentary",
    },
    {
        "id": "maitri-storage-fuel-tank-safety-02", "station_id": "maitri", "zone_id": "maitri-fuel-farm",
        "name": "Safety Buffer Tank 2", "category": "storage", "subtype": "fuel_tank", "manufacturer": None,
        "spec": {"capacity_l": 2_000.0, "fuel_type": "atf", "reserve_class": "safety_buffer"},
        "controllable": False, "life_safety": False, "primary_series": "level_l", "primary_unit": "L",
        "provenance": "documentary",
    },

    # ── Generators ──────────────────────────────────────────────────────────
    {
        "id": "maitri-power-generator-01", "station_id": "maitri", "zone_id": "maitri-main-building",
        "name": "Generator 1", "category": "power", "subtype": "generator", "manufacturer": None,
        "spec": {"rated_kw": 62.5}, "controllable": True, "life_safety": False,
        "primary_series": "power_kw", "primary_unit": "kW", "provenance": "documentary",
    },
    {
        "id": "maitri-power-generator-02", "station_id": "maitri", "zone_id": "maitri-main-building",
        "name": "Generator 2", "category": "power", "subtype": "generator", "manufacturer": None,
        "spec": {"rated_kw": 62.5}, "controllable": True, "life_safety": False,
        "primary_series": "power_kw", "primary_unit": "kW", "provenance": "documentary",
    },
    {
        "id": "maitri-power-generator-03", "station_id": "maitri", "zone_id": "maitri-main-building",
        "name": "Generator 3", "category": "power", "subtype": "generator", "manufacturer": None,
        "spec": {"rated_kw": 62.5}, "controllable": True, "life_safety": False,
        "primary_series": "power_kw", "primary_unit": "kW", "provenance": "documentary",
    },

    # ── Waste / wastewater ──────────────────────────────────────────────────
    {
        "id": "maitri-waste-wastewater-tank-01", "station_id": "maitri", "zone_id": "maitri-orange-room",
        "name": "Orange Room Wastewater Tank", "category": "waste", "subtype": "wastewater_tank", "manufacturer": None,
        "spec": {"capacity_l": 5_000.0}, "controllable": False, "life_safety": False,
        "primary_series": "level_l", "primary_unit": "L", "provenance": "documentary",
    },
    {
        "id": "maitri-waste-stp-01", "station_id": "maitri", "zone_id": "maitri-kuber-waste-area",
        "name": "Sewage Treatment Plant (G&O)", "category": "waste", "subtype": "stp", "manufacturer": None,
        "spec": {}, "controllable": False, "life_safety": False,
        "primary_series": "tank_temp_c", "primary_unit": "degC", "provenance": "documentary",
    },

    # ── Science instruments ─────────────────────────────────────────────────
    {
        "id": "maitri-instrument-aws-01", "station_id": "maitri", "zone_id": "maitri-garden-hut",
        "name": "Automatic Weather Station", "category": "instrument", "subtype": "aws", "manufacturer": None,
        "spec": {}, "controllable": False, "life_safety": False,
        "primary_series": "temp_c", "primary_unit": "degC", "provenance": "documentary",
    },
    {
        "id": "maitri-instrument-pyranometer-01", "station_id": "maitri", "zone_id": "maitri-garden-hut",
        "name": "Sutron Pyranometer (Solar Radiation Logger)", "category": "instrument", "subtype": "pyranometer",
        "manufacturer": "Sutron", "spec": {}, "controllable": False, "life_safety": False,
        "primary_series": "solar_wm2", "primary_unit": "W/m2", "provenance": "documentary",
    },
    {
        "id": "maitri-instrument-magnetometer-fluxgate-01", "station_id": "maitri", "zone_id": "maitri-geomagnetism-lab",
        "name": "Fluxgate Magnetometer", "category": "instrument", "subtype": "magnetometer", "manufacturer": None,
        "spec": {"kind": "fluxgate"}, "controllable": False, "life_safety": False,
        "primary_series": "h_nt", "primary_unit": "nT", "provenance": "documentary",
    },
    {
        "id": "maitri-instrument-magnetometer-proton-01", "station_id": "maitri", "zone_id": "maitri-geomagnetism-lab",
        "name": "Proton Precession Magnetometer", "category": "instrument", "subtype": "magnetometer", "manufacturer": None,
        "spec": {"kind": "proton_precession"}, "controllable": False, "life_safety": False,
        "primary_series": "h_nt", "primary_unit": "nT", "provenance": "documentary",
    },
    {
        "id": "maitri-instrument-magnetometer-induction-01", "station_id": "maitri", "zone_id": "maitri-geomagnetism-lab",
        "name": "Induction Coil Magnetometer", "category": "instrument", "subtype": "magnetometer", "manufacturer": None,
        "spec": {"kind": "induction_coil"}, "controllable": False, "life_safety": False,
        "primary_series": "h_nt", "primary_unit": "nT", "provenance": "documentary",
    },
    {
        "id": "maitri-instrument-gec-01", "station_id": "maitri", "zone_id": "maitri-atmospheric-science-lab",
        "name": "GEC Sensor 1", "category": "instrument", "subtype": "gec", "manufacturer": None,
        "spec": {}, "controllable": False, "life_safety": False,
        "primary_series": "value", "primary_unit": "unit", "provenance": "documentary",
    },
    {
        "id": "maitri-instrument-gec-02", "station_id": "maitri", "zone_id": "maitri-atmospheric-science-lab",
        "name": "GEC Sensor 2", "category": "instrument", "subtype": "gec", "manufacturer": None,
        "spec": {}, "controllable": False, "life_safety": False,
        "primary_series": "value", "primary_unit": "unit", "provenance": "documentary",
    },
    {
        "id": "maitri-instrument-nox-analyzer-01", "station_id": "maitri", "zone_id": "maitri-atmospheric-science-lab",
        "name": "NOx Analyzer", "category": "instrument", "subtype": "nox_analyzer", "manufacturer": None,
        "spec": {}, "controllable": False, "life_safety": False,
        "primary_series": "value", "primary_unit": "unit", "provenance": "documentary",
    },
    {
        "id": "maitri-instrument-ionosonde-riometer-01", "station_id": "maitri", "zone_id": "maitri-geomagnetism-lab",
        "name": "Ionosonde / Riometer Array", "category": "instrument", "subtype": "ionosonde", "manufacturer": None,
        "spec": {}, "controllable": False, "life_safety": False,
        "primary_series": "value", "primary_unit": "unit", "provenance": "documentary",
    },
    {
        "id": "maitri-instrument-allsky-camera-01", "station_id": "maitri", "zone_id": "maitri-geomagnetism-lab",
        "name": "All-Sky Aurora Camera 1", "category": "instrument", "subtype": "allsky_camera", "manufacturer": None,
        "spec": {"of_total": 4}, "controllable": False, "life_safety": False,
        "primary_series": "value", "primary_unit": "unit", "provenance": "documentary",
    },
    {
        "id": "maitri-instrument-gnss-01", "station_id": "maitri", "zone_id": "maitri-geomagnetism-lab",
        "name": "GNSS Receiver", "category": "instrument", "subtype": "gnss", "manufacturer": None,
        "spec": {}, "controllable": False, "life_safety": False,
        "primary_series": "value", "primary_unit": "unit", "provenance": "documentary",
    },
    {
        "id": "maitri-instrument-seismograph-01", "station_id": "maitri", "zone_id": "maitri-geomagnetism-lab",
        "name": "Broadband Seismograph (3-axis)", "category": "instrument", "subtype": "seismograph", "manufacturer": None,
        "spec": {"axes": 3}, "controllable": False, "life_safety": False,
        "primary_series": "value", "primary_unit": "unit", "provenance": "documentary",
    },
    {
        "id": "maitri-instrument-radar-mara-01", "station_id": "maitri", "zone_id": "maitri-mara-radar-site",
        "name": "MARA Atmospheric Radar", "category": "instrument", "subtype": "radar", "manufacturer": None,
        "spec": {}, "controllable": False, "life_safety": False,
        "primary_series": "value", "primary_unit": "unit", "provenance": "documentary",
    },

    # ── Storage: deep freezers ───────────────────────────────────────────────
    {
        "id": "maitri-storage-freezer-01", "station_id": "maitri", "zone_id": "maitri-kitchen",
        "name": "Deep Freezer 1", "category": "storage", "subtype": "freezer", "manufacturer": None,
        "spec": {"target_range_c": [-20, -18]}, "controllable": False, "life_safety": False,
        "primary_series": "temp_c", "primary_unit": "degC", "provenance": "documentary",
    },
    {
        "id": "maitri-storage-freezer-02", "station_id": "maitri", "zone_id": "maitri-kitchen",
        "name": "Deep Freezer 2", "category": "storage", "subtype": "freezer", "manufacturer": None,
        "spec": {"target_range_c": [-20, -18]}, "controllable": False, "life_safety": False,
        "primary_series": "temp_c", "primary_unit": "degC", "provenance": "documentary",
    },

    # ── Vehicles ─────────────────────────────────────────────────────────────
    {
        "id": "maitri-vehicle-pistenbully-01", "station_id": "maitri", "zone_id": "maitri-outdoor",
        "name": "PistenBully 1", "category": "vehicle", "subtype": "pistenbully", "manufacturer": "Kassbohrer",
        "spec": {"cold_start_required": True}, "controllable": True, "life_safety": False,
        "primary_series": "coolant_c", "primary_unit": "degC", "provenance": "documentary",
    },
    {
        "id": "maitri-vehicle-pistenbully-02", "station_id": "maitri", "zone_id": "maitri-outdoor",
        "name": "PistenBully 2", "category": "vehicle", "subtype": "pistenbully", "manufacturer": "Kassbohrer",
        "spec": {"cold_start_required": True}, "controllable": True, "life_safety": False,
        "primary_series": "coolant_c", "primary_unit": "degC", "provenance": "documentary",
    },
    {
        "id": "maitri-vehicle-pistenbully-03", "station_id": "maitri", "zone_id": "maitri-outdoor",
        "name": "PistenBully 3", "category": "vehicle", "subtype": "pistenbully", "manufacturer": "Kassbohrer",
        "spec": {"cold_start_required": True}, "controllable": True, "life_safety": False,
        "primary_series": "coolant_c", "primary_unit": "degC", "provenance": "documentary",
    },
    {
        "id": "maitri-vehicle-pistenbully-04", "station_id": "maitri", "zone_id": "maitri-outdoor",
        "name": "PistenBully 4", "category": "vehicle", "subtype": "pistenbully", "manufacturer": "Kassbohrer",
        "spec": {"cold_start_required": True}, "controllable": True, "life_safety": False,
        "primary_series": "coolant_c", "primary_unit": "degC", "provenance": "documentary",
    },
    {
        "id": "maitri-vehicle-ambulance-01", "station_id": "maitri", "zone_id": "maitri-outdoor",
        "name": "Ambulance (PB-300 chassis)", "category": "vehicle", "subtype": "ambulance",
        "manufacturer": "Kassbohrer", "spec": {"chassis": "PB-300", "cold_start_required": True},
        "controllable": True, "life_safety": True,
        "primary_series": "coolant_c", "primary_unit": "degC", "provenance": "documentary",
    },
    {
        "id": "maitri-vehicle-crane-50t", "station_id": "maitri", "zone_id": "maitri-outdoor",
        "name": "50T Crane", "category": "vehicle", "subtype": "crane", "manufacturer": None,
        "spec": {"capacity_tonnes": 50}, "controllable": True, "life_safety": False,
        "primary_series": "runhours", "primary_unit": "h", "provenance": "documentary",
    },
    {
        "id": "maitri-vehicle-crane-02", "station_id": "maitri", "zone_id": "maitri-outdoor",
        "name": "Crane 2", "category": "vehicle", "subtype": "crane", "manufacturer": None,
        "spec": {}, "controllable": True, "life_safety": False,
        "primary_series": "runhours", "primary_unit": "h", "provenance": "documentary",
    },
    {
        "id": "maitri-vehicle-crane-03", "station_id": "maitri", "zone_id": "maitri-outdoor",
        "name": "Crane 3", "category": "vehicle", "subtype": "crane", "manufacturer": None,
        "spec": {}, "controllable": True, "life_safety": False,
        "primary_series": "runhours", "primary_unit": "h", "provenance": "documentary",
    },
    {
        "id": "maitri-vehicle-scooter-01", "station_id": "maitri", "zone_id": "maitri-outdoor",
        "name": "Snow Scooter 1", "category": "vehicle", "subtype": "scooter", "manufacturer": None,
        "spec": {}, "controllable": False, "life_safety": False,
        "primary_series": "runhours", "primary_unit": "h", "provenance": "documentary",
    },
    {
        "id": "maitri-vehicle-scooter-02", "station_id": "maitri", "zone_id": "maitri-outdoor",
        "name": "Snow Scooter 2", "category": "vehicle", "subtype": "scooter", "manufacturer": None,
        "spec": {}, "controllable": False, "life_safety": False,
        "primary_series": "runhours", "primary_unit": "h", "provenance": "documentary",
    },
    {
        "id": "maitri-vehicle-dozer-01", "station_id": "maitri", "zone_id": "maitri-outdoor",
        "name": "Excavator / Dozer 1", "category": "vehicle", "subtype": "dozer", "manufacturer": None,
        "spec": {}, "controllable": True, "life_safety": False,
        "primary_series": "runhours", "primary_unit": "h", "provenance": "documentary",
    },

    # ── Medical ───────────────────────────────────────────────────────────────
    {
        "id": "maitri-medical-hospital-01", "station_id": "maitri", "zone_id": "maitri-hospital",
        "name": "Maitri Hospital Equipment", "category": "medical", "subtype": "hospital", "manufacturer": None,
        "spec": {"anaesthesia_support": False, "note": "No anaesthesia support — documented capability gap"},
        "controllable": False, "life_safety": True,
        "primary_series": "value", "primary_unit": "unit", "provenance": "documentary",
    },

    # ── Heating (boiler — explicitly unverified in source material) ─────────
    {
        "id": "maitri-heating-boiler-01", "station_id": "maitri", "zone_id": "maitri-main-building",
        "name": "Boiler / Heat-Trace System", "category": "heating", "subtype": "boiler", "manufacturer": None,
        "spec": {}, "controllable": True, "life_safety": False,
        "primary_series": "supply_temp_c", "primary_unit": "degC", "provenance": "unverified",
    },
]


def _bharati_fuel_tank(idx: int, capacity_l: float) -> dict[str, Any]:
    return {
        "id": f"bharati-storage-fuel-tank-{idx:02d}", "station_id": "bharati", "zone_id": "bharati-ground-floor",
        "name": f"Fuel Tank {idx:02d}", "category": "storage", "subtype": "fuel_tank", "manufacturer": None,
        "spec": {"capacity_l": capacity_l, "fuel_type": "atf", "reserve_class": "routine"},
        "controllable": False, "life_safety": False, "primary_series": "level_l", "primary_unit": "L",
        "provenance": "simulated",
    }


BHARATI_ASSETS: list[dict[str, Any]] = [
    # ── Power / heating ──────────────────────────────────────────────────────
    {
        "id": "bharati-power-chp-01", "station_id": "bharati", "zone_id": "bharati-chp-room",
        "name": "CHP Unit 1", "category": "power", "subtype": "chp", "manufacturer": None,
        "spec": {"rated_kw": 80.0, "waste_heat_recovery": True}, "controllable": True, "life_safety": False,
        "primary_series": "power_kw", "primary_unit": "kW", "provenance": "documentary",
    },
    {
        "id": "bharati-power-chp-02", "station_id": "bharati", "zone_id": "bharati-chp-room",
        "name": "CHP Unit 2", "category": "power", "subtype": "chp", "manufacturer": None,
        "spec": {"rated_kw": 80.0, "waste_heat_recovery": True}, "controllable": True, "life_safety": False,
        "primary_series": "power_kw", "primary_unit": "kW", "provenance": "documentary",
    },
    {
        "id": "bharati-heating-ahu-01", "station_id": "bharati", "zone_id": "bharati-ahu-plant-room",
        "name": "AHU 1", "category": "heating", "subtype": "ahu", "manufacturer": None,
        "spec": {"duty_cycle": "24x7x365"}, "controllable": True, "life_safety": False,
        "primary_series": "supply_temp_c", "primary_unit": "degC", "provenance": "documentary",
    },

    # ── Waste ────────────────────────────────────────────────────────────────
    {
        "id": "bharati-waste-blackwater-tank-01", "station_id": "bharati", "zone_id": "bharati-wastewater-room",
        "name": "Black Water Tank", "category": "waste", "subtype": "blackwater_tank", "manufacturer": None,
        "spec": {"capacity_l": 4_000.0}, "controllable": False, "life_safety": False,
        "primary_series": "level_l", "primary_unit": "L", "provenance": "documentary",
    },
    {
        "id": "bharati-waste-greywater-tank-01", "station_id": "bharati", "zone_id": "bharati-wastewater-room",
        "name": "Clay (Grey) Water Tank", "category": "waste", "subtype": "greywater_tank", "manufacturer": None,
        "spec": {"capacity_l": 4_000.0}, "controllable": False, "life_safety": False,
        "primary_series": "level_l", "primary_unit": "L", "provenance": "documentary",
    },

    # ── Storage ───────────────────────────────────────────────────────────────
    {
        "id": "bharati-storage-freezer-01", "station_id": "bharati", "zone_id": "bharati-south-interspace",
        "name": "Interspace Freezer", "category": "storage", "subtype": "freezer", "manufacturer": None,
        "spec": {"target_range_c": [-20, -18]}, "controllable": False, "life_safety": False,
        "primary_series": "temp_c", "primary_unit": "degC", "provenance": "documentary",
    },
    {
        "id": "bharati-storage-chiller-01", "station_id": "bharati", "zone_id": "bharati-north-interspace",
        "name": "Interspace Chiller", "category": "storage", "subtype": "chiller", "manufacturer": None,
        "spec": {"target_c": 4}, "controllable": False, "life_safety": False,
        "primary_series": "temp_c", "primary_unit": "degC", "provenance": "documentary",
    },

    # ── Medical ───────────────────────────────────────────────────────────────
    {
        "id": "bharati-medical-ot-01", "station_id": "bharati", "zone_id": "bharati-operation-theatre",
        "name": "Operation Theatre Equipment", "category": "medical", "subtype": "ot", "manufacturer": None,
        "spec": {"anaesthesia_support": True, "note": "Boyle's apparatus / anaesthesia machine present"},
        "controllable": False, "life_safety": True,
        "primary_series": "value", "primary_unit": "unit", "provenance": "documentary",
    },

    # ── Vehicles ─────────────────────────────────────────────────────────────
    {
        "id": "bharati-vehicle-pistenbully-vitesta", "station_id": "bharati", "zone_id": "bharati-south-interspace",
        "name": "Vitesta", "category": "vehicle", "subtype": "pistenbully", "manufacturer": "Kassbohrer",
        "spec": {"cold_start_required": True}, "controllable": True, "life_safety": False,
        "primary_series": "coolant_c", "primary_unit": "degC", "provenance": "documentary",
    },

    # ── Fuel farm + seawater pump ────────────────────────────────────────────
    _bharati_fuel_tank(1, 15_000.0),
    _bharati_fuel_tank(2, 15_000.0),
    _bharati_fuel_tank(3, 8_000.0),
    {
        "id": "bharati-water-seawater-pump-01", "station_id": "bharati", "zone_id": "bharati-ground-floor",
        "name": "Seawater Pump 1", "category": "water", "subtype": "seawater_pump", "manufacturer": None,
        "spec": {}, "controllable": True, "life_safety": False,
        "primary_series": "value", "primary_unit": "unit", "provenance": "simulated",
    },

    # ── Lab instruments (IMD / BARC / GSI) ──────────────────────────────────
    {
        "id": "bharati-instrument-lab-imd-01", "station_id": "bharati", "zone_id": "bharati-imd-lab",
        "name": "IMD Lab Instrument 1", "category": "instrument", "subtype": "lab_instrument", "manufacturer": None,
        "spec": {"lab": "IMD"}, "controllable": False, "life_safety": False,
        "primary_series": "value", "primary_unit": "unit", "provenance": "documentary",
    },
    {
        "id": "bharati-instrument-lab-barc-01", "station_id": "bharati", "zone_id": "bharati-barc-lab",
        "name": "BARC Lab Instrument 1", "category": "instrument", "subtype": "lab_instrument", "manufacturer": None,
        "spec": {"lab": "BARC"}, "controllable": False, "life_safety": False,
        "primary_series": "value", "primary_unit": "unit", "provenance": "documentary",
    },
    {
        "id": "bharati-instrument-lab-gsi-01", "station_id": "bharati", "zone_id": "bharati-gsi-lab",
        "name": "GSI Lab Instrument 1", "category": "instrument", "subtype": "lab_instrument", "manufacturer": None,
        "spec": {"lab": "GSI"}, "controllable": False, "life_safety": False,
        "primary_series": "value", "primary_unit": "unit", "provenance": "documentary",
    },

    # ── Comms ────────────────────────────────────────────────────────────────
    {
        "id": "bharati-comms-ups-monitoring-01", "station_id": "bharati", "zone_id": "bharati-ups-room",
        "name": "UPS Room Monitoring / Camera System", "category": "comms", "subtype": "ups_monitoring",
        "manufacturer": None, "spec": {}, "controllable": False, "life_safety": False,
        "primary_series": "battery_pct", "primary_unit": "%", "provenance": "simulated",
    },
]

# ─── Inventory items ─────────────────────────────────────────────────────────

INVENTORY_ITEMS: list[dict[str, Any]] = [
    # Maitri — fuel (mirrors the fuel tanks/caches above)
    {"id": "maitri-inventory-fuel-routine", "station_id": "maitri", "zone_id": "maitri-fuel-farm", "kind": "fuel",
     "subtype": "atf", "name": "Fuel Farm — Routine Stock", "quantity": 82_000.0, "unit": "L", "capacity": 108_000.0,
     "reserve_class": "routine", "provenance": "simulated"},
    {"id": "maitri-inventory-fuel-emergency-cache", "station_id": "maitri", "zone_id": "maitri-sankalp-cache",
     "kind": "fuel", "subtype": "atf", "name": "Emergency Fuel Caches (Sankalp + Ship Transfer)",
     "quantity": 40_000.0, "unit": "L", "capacity": 44_000.0, "reserve_class": "emergency_cache",
     "provenance": "documentary"},
    {"id": "maitri-inventory-fuel-safety-buffer", "station_id": "maitri", "zone_id": "maitri-fuel-farm",
     "kind": "fuel", "subtype": "atf", "name": "Safety Buffer Tanks", "quantity": 3_800.0, "unit": "L",
     "capacity": 4_000.0, "reserve_class": "safety_buffer", "provenance": "documentary"},
    # Maitri — food (~2 years' stock)
    {"id": "maitri-inventory-food-dry", "station_id": "maitri", "zone_id": "maitri-kitchen", "kind": "food",
     "subtype": "dry", "name": "Dry Rations", "quantity": 48_000.0, "unit": "kg", "capacity": 55_000.0,
     "reserve_class": "routine", "provenance": "simulated"},
    {"id": "maitri-inventory-food-frozen", "station_id": "maitri", "zone_id": "maitri-kitchen", "kind": "food",
     "subtype": "frozen", "name": "Frozen Rations", "quantity": 21_000.0, "unit": "kg", "capacity": 24_000.0,
     "reserve_class": "routine", "provenance": "simulated"},
    # Maitri — spares
    {"id": "maitri-inventory-spare-pistenbully-tracks", "station_id": "maitri", "zone_id": "maitri-outdoor",
     "kind": "spare", "subtype": "vehicle_part", "name": "PistenBully Track Spares", "quantity": 4.0, "unit": "set",
     "capacity": None, "reserve_class": "routine", "provenance": "simulated"},
    {"id": "maitri-inventory-spare-generator-filters", "station_id": "maitri", "zone_id": "maitri-main-building",
     "kind": "spare", "subtype": "generator_part", "name": "Generator Fuel Filters", "quantity": 24.0, "unit": "pcs",
     "capacity": None, "reserve_class": "routine", "provenance": "simulated"},

    # Bharati — fuel
    {"id": "bharati-inventory-fuel-routine", "station_id": "bharati", "zone_id": "bharati-ground-floor",
     "kind": "fuel", "subtype": "atf", "name": "Fuel Farm — Routine Stock", "quantity": 30_000.0, "unit": "L",
     "capacity": 38_000.0, "reserve_class": "routine", "provenance": "simulated"},
    {"id": "bharati-inventory-fuel-safety-buffer", "station_id": "bharati", "zone_id": "bharati-ground-floor",
     "kind": "fuel", "subtype": "atf", "name": "Safety Buffer Stock", "quantity": 1_800.0, "unit": "L",
     "capacity": 2_000.0, "reserve_class": "safety_buffer", "provenance": "simulated"},
    # Bharati — food
    {"id": "bharati-inventory-food-dry", "station_id": "bharati", "zone_id": "bharati-food-store", "kind": "food",
     "subtype": "dry", "name": "Dry Rations", "quantity": 44_000.0, "unit": "kg", "capacity": 50_000.0,
     "reserve_class": "routine", "provenance": "simulated"},
    {"id": "bharati-inventory-food-frozen", "station_id": "bharati", "zone_id": "bharati-food-store", "kind": "food",
     "subtype": "frozen", "name": "Frozen Rations", "quantity": 19_000.0, "unit": "kg", "capacity": 22_000.0,
     "reserve_class": "routine", "provenance": "simulated"},
    # Bharati — spares
    {"id": "bharati-inventory-spare-pistenbully-tracks", "station_id": "bharati", "zone_id": "bharati-garage",
     "kind": "spare", "subtype": "vehicle_part", "name": "PistenBully Track Spares", "quantity": 2.0, "unit": "set",
     "capacity": None, "reserve_class": "routine", "provenance": "simulated"},
    {"id": "bharati-inventory-spare-chp-parts", "station_id": "bharati", "zone_id": "bharati-chp-room",
     "kind": "spare", "subtype": "generator_part", "name": "CHP Spare Parts Kit", "quantity": 2.0, "unit": "kit",
     "capacity": None, "reserve_class": "routine", "provenance": "simulated"},
]

for _item in INVENTORY_ITEMS:
    _item.setdefault("expiry", None)
    _item.setdefault("last_checked", None)
    _item.setdefault("checked_by", None)

# ─── Convoys ─────────────────────────────────────────────────────────────────

CONVOYS: list[dict[str, Any]] = [
    {
        "id": "maitri-convoy-2026", "station_id": "maitri", "season": "2025-26",
        "planned_start": None, "route_ref": "Ship (Priyadarshini) to Maitri via Novo runway",
        "distance_km": 120.0, "state": "planned", "medical_officer": "Station Medical Officer",
        "eta": None, "fuel_used_l": None, "fuel_planned_l": 6_000.0,
    },
    {
        "id": "bharati-convoy-2026", "station_id": "bharati", "season": "2025-26",
        "planned_start": None, "route_ref": "Ship to Bharati via Larsemann Hills coastal route",
        "distance_km": 30.0, "state": "planned", "medical_officer": "Station Medical Officer",
        "eta": None, "fuel_used_l": None, "fuel_planned_l": 2_000.0,
    },
]

CONVOY_ASSIGNMENTS: list[dict[str, Any]] = [
    {"name": "maitri-convoy-2026-member-1", "convoy_id": "maitri-convoy-2026", "member_name": "Convoy Lead",
     "vehicle_asset_id": "maitri-vehicle-pistenbully-01", "equipment_charge": "Navigation & comms"},
    {"name": "maitri-convoy-2026-member-2", "convoy_id": "maitri-convoy-2026", "member_name": "Vehicle Operator 1",
     "vehicle_asset_id": "maitri-vehicle-dozer-01", "equipment_charge": "Route grooming"},
    {"name": "maitri-convoy-2026-member-3", "convoy_id": "maitri-convoy-2026", "member_name": "Vehicle Operator 2",
     "vehicle_asset_id": "maitri-vehicle-crane-50t", "equipment_charge": "Cargo handling"},

    {"name": "bharati-convoy-2026-member-1", "convoy_id": "bharati-convoy-2026", "member_name": "Convoy Lead",
     "vehicle_asset_id": "bharati-vehicle-pistenbully-vitesta", "equipment_charge": "Navigation & comms"},
    {"name": "bharati-convoy-2026-member-2", "convoy_id": "bharati-convoy-2026", "member_name": "Medical Officer",
     "vehicle_asset_id": None, "equipment_charge": "Medical kit"},
]

# ─── Waste records ───────────────────────────────────────────────────────────

WASTE_RECORDS: list[dict[str, Any]] = [
    {"name": "maitri-waste-paper-1", "station_id": "maitri", "stream": "paper", "mass_kg": 12.5, "volume_l": None,
     "container_id": "maitri-kuber-waste-area", "disposition": "compacted", "recorded_by": "Station Ops"},
    {"name": "maitri-waste-plastic-1", "station_id": "maitri", "stream": "plastic", "mass_kg": 8.0, "volume_l": None,
     "container_id": "maitri-kuber-waste-area", "disposition": "stored", "recorded_by": "Station Ops"},
    {"name": "maitri-waste-metal-1", "station_id": "maitri", "stream": "metal", "mass_kg": 22.0, "volume_l": None,
     "container_id": "maitri-kuber-waste-area", "disposition": "stored", "recorded_by": "Station Ops"},
    {"name": "maitri-waste-food-1", "station_id": "maitri", "stream": "food", "mass_kg": None, "volume_l": 40.0,
     "container_id": "maitri-orange-room", "disposition": "compacted", "recorded_by": "Kitchen"},
    {"name": "maitri-waste-hazardous-1", "station_id": "maitri", "stream": "hazardous", "mass_kg": 3.5,
     "volume_l": None, "container_id": "maitri-kuber-waste-area", "disposition": "stored", "recorded_by": "Station Ops"},

    {"name": "bharati-waste-paper-1", "station_id": "bharati", "stream": "paper", "mass_kg": 9.0, "volume_l": None,
     "container_id": "bharati-wastewater-room", "disposition": "compacted", "recorded_by": "Station Ops"},
    {"name": "bharati-waste-glass-1", "station_id": "bharati", "stream": "glass", "mass_kg": 6.0, "volume_l": None,
     "container_id": "bharati-wastewater-room", "disposition": "stored", "recorded_by": "Station Ops"},
    {"name": "bharati-waste-food-1", "station_id": "bharati", "stream": "food", "mass_kg": None, "volume_l": 35.0,
     "container_id": "bharati-wastewater-room", "disposition": "compacted", "recorded_by": "2F Kitchen"},
    {"name": "bharati-waste-hazardous-1", "station_id": "bharati", "stream": "hazardous", "mass_kg": 2.0,
     "volume_l": None, "container_id": "bharati-chemical-room", "disposition": "backloaded", "recorded_by": "Station Ops"},
]

# ─── Alert rules ─────────────────────────────────────────────────────────────

ALERT_RULES: list[dict[str, Any]] = [
    # Freezer/chiller temperature out-of-band
    {"id": "maitri-freezer-01-temp-band", "station_id": None, "asset_id": "maitri-storage-freezer-01",
     "series_key": "temp_c", "type": "out_of_band", "params": {"min": -20, "max": -18}, "severity": "warning",
     "category": "environment", "escalate_after_seconds": 900},
    {"id": "maitri-freezer-02-temp-band", "station_id": None, "asset_id": "maitri-storage-freezer-02",
     "series_key": "temp_c", "type": "out_of_band", "params": {"min": -20, "max": -18}, "severity": "warning",
     "category": "environment", "escalate_after_seconds": 900},
    {"id": "bharati-freezer-01-temp-band", "station_id": None, "asset_id": "bharati-storage-freezer-01",
     "series_key": "temp_c", "type": "out_of_band", "params": {"min": -20, "max": -18}, "severity": "warning",
     "category": "environment", "escalate_after_seconds": 900},
    {"id": "bharati-chiller-01-temp-band", "station_id": None, "asset_id": "bharati-storage-chiller-01",
     "series_key": "temp_c", "type": "out_of_band", "params": {"min": 2, "max": 6}, "severity": "warning",
     "category": "environment", "escalate_after_seconds": 900},

    # Fuel tank low-level
    {"id": "maitri-fuel-tank-01-low", "station_id": None, "asset_id": "maitri-storage-fuel-tank-01",
     "series_key": "level_l", "type": "below", "params": {"threshold": 3_600.0}, "severity": "critical",
     "category": "logistics", "escalate_after_seconds": 600},
    {"id": "maitri-fuel-tank-safety-01-low", "station_id": None, "asset_id": "maitri-storage-fuel-tank-safety-01",
     "series_key": "level_l", "type": "below", "params": {"threshold": 500.0}, "severity": "emergency",
     "category": "logistics", "escalate_after_seconds": 300},
    {"id": "bharati-fuel-tank-01-low", "station_id": None, "asset_id": "bharati-storage-fuel-tank-01",
     "series_key": "level_l", "type": "below", "params": {"threshold": 2_250.0}, "severity": "critical",
     "category": "logistics", "escalate_after_seconds": 600},

    # Generator fault / stale telemetry
    {"id": "maitri-generator-01-stale", "station_id": None, "asset_id": "maitri-power-generator-01",
     "series_key": "power_kw", "type": "stale", "params": {}, "severity": "critical",
     "category": "power", "escalate_after_seconds": 300},
    {"id": "bharati-chp-01-stale", "station_id": None, "asset_id": "bharati-power-chp-01",
     "series_key": "power_kw", "type": "stale", "params": {}, "severity": "critical",
     "category": "power", "escalate_after_seconds": 300},
]

for _rule in ALERT_RULES:
    _rule.setdefault("enabled", True)
    _rule.setdefault("auto_generated", False)


# ─── Upsert helpers ──────────────────────────────────────────────────────────


async def upsert(session, model, pk_value, data: dict[str, Any]) -> bool:
    """Insert a row or update its columns in place if it already exists by
    primary key. Returns True if newly inserted."""
    existing = await session.get(model, pk_value)
    if existing is None:
        session.add(model(**data))
        return True
    for key, value in data.items():
        setattr(existing, key, value)
    return False


async def main() -> None:
    factory = get_session_factory()
    created = {"stations": 0, "zones": 0, "assets": 0, "inventory": 0, "convoys": 0,
               "assignments": 0, "waste": 0, "alert_rules": 0}

    async with factory() as session:
        for station in STATIONS:
            if await upsert(session, Station, station["id"], station):
                created["stations"] += 1
        await session.flush()

        for row in MAITRI_ZONES + BHARATI_ZONES:
            zone = build_zone(row)
            if await upsert(session, Zone, zone["id"], zone):
                created["zones"] += 1
        await session.flush()

        for asset in MAITRI_ASSETS + BHARATI_ASSETS:
            asset_data = dict(asset)
            asset_data.setdefault("responsible_user", None)
            asset_data.setdefault("status", "offline")
            asset_data.setdefault("health_score", 100.0)
            asset_data.setdefault("risk_score", 0.0)
            asset_data.setdefault("primary_value", None)
            asset_data.setdefault("approved", True)
            asset_data.setdefault("manifest", None)
            is_new = await session.get(Asset, asset_data["id"]) is None
            if is_new:
                asset_data["api_key"] = str(uuid.uuid4())
                session.add(Asset(**asset_data))
                created["assets"] += 1
            else:
                existing = await session.get(Asset, asset_data["id"])
                for key, value in asset_data.items():
                    if key == "id":
                        continue
                    setattr(existing, key, value)
        await session.flush()

        for item in INVENTORY_ITEMS:
            if await upsert(session, InventoryItem, item["id"], item):
                created["inventory"] += 1
        await session.flush()

        for convoy in CONVOYS:
            if await upsert(session, Convoy, convoy["id"], convoy):
                created["convoys"] += 1
        await session.flush()

        for assignment in CONVOY_ASSIGNMENTS:
            assignment_id = stable_uuid(assignment["name"])
            data = {k: v for k, v in assignment.items() if k != "name"}
            data["id"] = assignment_id
            if await upsert(session, ConvoyAssignment, assignment_id, data):
                created["assignments"] += 1
        await session.flush()

        for record in WASTE_RECORDS:
            record_id = stable_uuid(record["name"])
            data = {k: v for k, v in record.items() if k != "name"}
            data["id"] = record_id
            data.setdefault("processed_at", _utcnow() - timedelta(days=1))
            if await upsert(session, WasteRecord, record_id, data):
                created["waste"] += 1
        await session.flush()

        for rule in ALERT_RULES:
            if await upsert(session, AlertRule, rule["id"], rule):
                created["alert_rules"] += 1

        await session.commit()

    print("\nHIMADRI demo topology seeded successfully!")
    print(f"   Stations:          {len(STATIONS)} (new: {created['stations']})")
    print(f"   Zones:             {len(MAITRI_ZONES) + len(BHARATI_ZONES)} (new: {created['zones']})")
    print(f"   Assets:            {len(MAITRI_ASSETS) + len(BHARATI_ASSETS)} (new: {created['assets']})")
    print(f"   Inventory items:   {len(INVENTORY_ITEMS)} (new: {created['inventory']})")
    print(f"   Convoys:           {len(CONVOYS)} (new: {created['convoys']})")
    print(f"   Convoy assignments:{len(CONVOY_ASSIGNMENTS)} (new: {created['assignments']})")
    print(f"   Waste records:     {len(WASTE_RECORDS)} (new: {created['waste']})")
    print(f"   Alert rules:       {len(ALERT_RULES)} (new: {created['alert_rules']})")
    print("\n   Re-run any time — every row is upserted by a deterministic id.")


if __name__ == "__main__":
    asyncio.run(main())
