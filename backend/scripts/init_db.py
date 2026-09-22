"""
init_db.py — Create all PostgreSQL tables and seed a MINIMAL starter set:
both stations (Maitri, Bharati), one zone each, and three demo assets each.
Run automatically on every container start (see docker-compose.yml /
backend/Dockerfile*) — kept intentionally small so a fresh environment boots
fast; for a rich, demo-ready topology run scripts/seed_himadri_demo.py
afterward (manual, not part of container startup).

Usage:
    python scripts/init_db.py
"""

import asyncio
import sys
import uuid
from datetime import date
from pathlib import Path

# Add project root to path so we can import backend modules
sys.path.insert(0, str(Path(__file__).parent.parent))

# pyrefly: ignore [missing-import]
import structlog
# pyrefly: ignore [missing-import]
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from backend.config import settings
from backend.database.postgres import Base
import backend.models.tables  # noqa: F401 — registers models with Base.metadata
from backend.models.tables import Asset, Station, Zone

logger = structlog.get_logger(__name__)

# ─── Minimal starter stations ────────────────────────────────────────────────

STATIONS = [
    {
        "id": "maitri",
        "name": "Maitri",
        "lat": -70.7667,
        "lon": 11.7333,
        "elevation_m": 117.0,
        "established": date(1989, 1, 1),
        "winter_capacity": 25,
        "summer_capacity": 45,
        "local_utc_offset_minutes": 180,
        "description": "Schirmacher Oasis, Queen Maud Land, East Antarctica.",
        "provenance": "verified",
    },
    {
        "id": "bharati",
        "name": "Bharati",
        "lat": -69.4000,
        "lon": 76.1833,
        "elevation_m": 35.0,
        "established": date(2012, 3, 18),
        "winter_capacity": 23,
        "summer_capacity": 46,
        "local_utc_offset_minutes": 300,
        "description": "Larsemann Hills, Prydz Bay, East Antarctica.",
        "provenance": "verified",
    },
]

ZONES = [
    {"id": "maitri-main-building", "station_id": "maitri", "parent_id": None, "name": "Main Building",
     "kind": "module", "floor": 0, "restricted": False, "provenance": "documentary"},
    {"id": "bharati-ground-floor", "station_id": "bharati", "parent_id": None, "name": "Ground Floor",
     "kind": "floor", "floor": 0, "restricted": False, "provenance": "documentary"},
]

# (id, station_id, zone_id, name, category, subtype, manufacturer, spec,
#  controllable, life_safety, primary_series, primary_unit)
ASSETS = [
    ("maitri-power-generator-01", "maitri", "maitri-main-building", "Generator 1", "power", "generator",
     None, {"rated_kw": 62.5}, True, False, "power_kw", "kW"),
    ("maitri-storage-freezer-01", "maitri", "maitri-main-building", "Deep Freezer 1", "storage", "freezer",
     None, {}, False, False, "temp_c", "degC"),
    ("maitri-instrument-aws-01", "maitri", "maitri-main-building", "Automatic Weather Station", "instrument", "aws",
     None, {}, False, False, "temp_c", "degC"),
    ("bharati-power-chp-01", "bharati", "bharati-ground-floor", "CHP Unit 1", "power", "chp",
     None, {"rated_kw": 80.0}, True, False, "power_kw", "kW"),
    ("bharati-storage-freezer-01", "bharati", "bharati-ground-floor", "Interspace Freezer", "storage", "freezer",
     None, {}, False, False, "temp_c", "degC"),
    ("bharati-instrument-aws-01", "bharati", "bharati-ground-floor", "Automatic Weather Station", "instrument", "aws",
     None, {}, False, False, "temp_c", "degC"),
]


async def main() -> None:
    logger.info("init_db.starting")

    engine = create_async_engine(settings.POSTGRES_URL, echo=True)

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("init_db.tables_created")

    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        for station_data in STATIONS:
            existing = await session.get(Station, station_data["id"])
            if existing:
                logger.info("init_db.station_already_exists", id=station_data["id"])
                continue
            session.add(Station(**station_data))
            logger.info("init_db.station_seeded", id=station_data["id"])

        for zone_data in ZONES:
            existing = await session.get(Zone, zone_data["id"])
            if existing:
                logger.info("init_db.zone_already_exists", id=zone_data["id"])
                continue
            session.add(Zone(**zone_data))
            logger.info("init_db.zone_seeded", id=zone_data["id"])

        await session.flush()

        for (asset_id, station_id, zone_id, name, category, subtype, manufacturer,
             spec, controllable, life_safety, primary_series, primary_unit) in ASSETS:
            existing = await session.get(Asset, asset_id)
            if existing:
                logger.info("init_db.asset_already_exists", id=asset_id)
                continue
            session.add(Asset(
                id=asset_id,
                station_id=station_id,
                zone_id=zone_id,
                name=name,
                category=category,
                subtype=subtype,
                manufacturer=manufacturer,
                spec=spec,
                controllable=controllable,
                life_safety=life_safety,
                status="offline",
                health_score=100.0,
                risk_score=0.0,
                primary_series=primary_series,
                primary_unit=primary_unit,
                api_key=str(uuid.uuid4()),
                approved=True,
                provenance="simulated",
            ))
            logger.info("init_db.asset_seeded", id=asset_id, name=name)

        await session.commit()

    await engine.dispose()
    logger.info("init_db.complete", stations=len(STATIONS), zones=len(ZONES), assets=len(ASSETS))
    print("\nDatabase initialized successfully!")
    print("   Tables created: stations, zones, assets, readings, alert_rules, alerts,")
    print("   commands, audit_events, reports, scenarios, inventory_items, convoys,")
    print("   convoy_assignments, waste_records, risk_cells, advisories,")
    print("   maintenance_events, ml_model_versions, ml_predictions, ml_prediction_outcomes")
    print(f"   Stations seeded: {len(STATIONS)} (maitri, bharati)")
    print(f"   Zones seeded: {len(ZONES)}")
    print(f"   Demo assets seeded: {len(ASSETS)}")
    print("   Next step: run python scripts/init_graph.py")
    print("   For a rich demo topology: python scripts/seed_himadri_demo.py")


if __name__ == "__main__":
    asyncio.run(main())
