"""
seed_predictive_maintenance_demo.py — Seed a realistic historical Reading/
Alert time series for a small set of HIMADRI demo assets, train a real
Predictive Maintenance model on it, and populate a clean, internally
coherent prediction history so the Predictive Maintenance dashboard has
something real to show instead of "no production model" placeholders.

Run AFTER scripts/seed_himadri_demo.py — this looks up its assets by id and
needs those rows to already exist. Also needs the backend container itself
running and reachable at http://localhost:8000 (docker compose up) — see
train_and_forecast_via_api()'s docstring for why. Only needs plain
SQLAlchemy/httpx (no scikit-learn/pandas needed in THIS script's own
environment — the live backend does the actual training):

    python scripts/seed_predictive_maintenance_demo.py

Scope note: deliberately scoped to 4 assets (3 "incident-prone" + 1 stable
healthy baseline) rather than every seeded asset — small enough to stay
readable, but NOT just 1-2 assets, because backend/analysis/train.py splits
chronologically (first 80% of rows train, last 20% validate) and a single
incident-prone asset risks a validation split with ~0 positive examples if
its one incident happens to land on the wrong side of that boundary (this
is a real, previously-hit failure mode — see the 6-incidents-per-asset /
fixed-fraction design below, which exists specifically to avoid it).

What it does, in order:
  1. Generates ~20 days of synthetic readings (15-min cadence) for the 4
     assets — the 3 incident-prone ones each get 6 realistic incidents
     (a multi-hour ramp on that asset's own primary series — power_kw
     dropping for a fuel-starved generator, temp_c climbing for a warming
     freezer, level_l draining for a leaking fuel tank — peaking past a
     threshold, then recovering) evenly spread across the FULL window
     (including past the 80/20 split boundary, not just before it — see
     INCIDENT_FRACS below), and 1 healthy asset with a flat baseline and no
     incidents. This mirrors the exact incident-spacing fix documented in
     this repo's own history for the old Waters/Node version of this
     script (see context/DEVELOPMENT_STATUS.md's 2026-09-04 entries) — a
     smaller number of evenly-slotted incidents put almost all of them
     inside the training split, leaving validation with ~0 positive
     examples and a classifier that scores as pure noise even though the
     underlying signal is real.
  2. Inserts a resolved CRITICAL Alert at each incident's peak — these are
     what feature_engineering.build_training_features() uses as failure
     labels.
  3. Triggers training via the live backend's own POST
     /model-accuracy/retrain and polls until it completes, rather than
     importing backend.analysis.train.run_training() directly — see
     train_and_forecast_via_api()'s docstring for why this matters
     (MLModelVersion.artifact_path is resolved relative to wherever the
     training PROCESS runs; only the container's own process can write a
     path the container's own predict.generate_forecasts() can later find).
  4. Calls the live backend's GET /model-accuracy/forecast to populate
     live/current per-asset risk for the Forecast tab.
  5. Seeds a small set of curated MLPrediction + MLPredictionOutcome pairs,
     mostly tied to real incidents generated above (CORRECT/EARLY/LATE),
     plus one FALSE_POSITIVE and one NO_FAILURE for realistic variety.

Idempotent: re-running first wipes every Reading row for these 4 assets,
every historical (resolved) Alert this script previously created for them,
and the ml_model_versions/ml_predictions/ml_prediction_outcomes tables
entirely, then regenerates everything fresh.
"""

import asyncio
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

# pyrefly: ignore [missing-import]
import httpx
# pyrefly: ignore [missing-import]
import structlog
# pyrefly: ignore [missing-import]
from sqlalchemy import delete, insert, select

from backend.config import settings
from backend.database.postgres import get_session_factory
from backend.models.tables import Alert, Asset, MLModelVersion, MLPrediction, MLPredictionOutcome, Reading
from backend.services.alert_engine import default_alert_category

logger = structlog.get_logger(__name__)

random.seed(7)  # reproducible-looking history across reseeds


def utcnow() -> datetime:
    """Naive UTC now, matching the TIMESTAMP WITHOUT TIME ZONE columns (same
    pattern as alert_engine.py's datetime.now(timezone.utc).replace(tzinfo=None))."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


WINDOW_DAYS = 20
SAMPLE_INTERVAL_MIN = 15

# ─── Asset profiles ──────────────────────────────────────────────────────────
# Reuses asset ids from scripts/seed_himadri_demo.py (run that first).
# "series" is the primary reading key (must be listed FIRST in each row's
# values dict — data_loader._primary_value takes the first declared series,
# matching each asset's own Asset.primary_series). "direction" is which way
# the incident pushes the value (down for power_kw/level_l, up for temp_c) —
# the classifier only needs a consistent pattern, not a specific sign.

INCIDENT_PROFILES: dict[str, dict] = {
    "maitri-power-generator-01": {
        "series": "power_kw", "unit": "kW", "direction": "down",
        "baseline": (32.0, 40.0), "peak": 4.0, "extra_series": {"runhours": 0.0, "fuel_lph": 14.0},
    },
    "maitri-storage-freezer-01": {
        "series": "temp_c", "unit": "degC", "direction": "up",
        "baseline": (-20.0, -18.5), "peak": 1.0, "extra_series": {},
    },
    "bharati-storage-fuel-tank-01": {
        "series": "level_l", "unit": "L", "direction": "down",
        "baseline": (9_000.0, 11_000.0), "peak": 200.0, "extra_series": {},
    },
}

HEALTHY_ASSET = "bharati-instrument-lab-imd-01"
HEALTHY_SERIES = "value"
HEALTHY_UNIT = "unit"
HEALTHY_BASELINE = (45.0, 55.0)

ALL_PM_ASSET_IDS = list(INCIDENT_PROFILES) + [HEALTHY_ASSET]


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


# train.py's run_training() splits chronologically — sorted by timestamp,
# first 80% of rows train, last 20% validate. Fixed fractions (not
# evenly-slotted across [0, n+1)) so the LAST incident lands solidly past
# that 80% mark on purpose, and 6 incidents (not 2-3) so no single incident
# dominates either split's class balance — see this file's module
# docstring and context/DEVELOPMENT_STATUS.md's 2026-09-04 entries for the
# full failure-mode history this design avoids.
INCIDENT_FRACS = (0.08, 0.24, 0.40, 0.56, 0.72, 0.88)


def gen_incidents(start: datetime, end: datetime) -> list[dict]:
    total_hours = (end - start).total_seconds() / 3600
    incidents = []
    for frac in INCIDENT_FRACS:
        jittered = clamp(frac + random.uniform(-0.03, 0.03), 0.05, 0.95)
        t = start + timedelta(hours=total_hours * jittered)
        incidents.append({
            "time": t,
            "ramp_hours": random.uniform(18.0, 23.0),
            "recovery_hours": random.uniform(0.5, 1.5),
        })
    return incidents


def incident_bump(
    t: datetime, incident_time: datetime, ramp_hours: float, recovery_hours: float,
    baseline: float, peak: float,
) -> float | None:
    """Value at time t if inside this incident's ramp/recovery window, else
    None. frac**0.25 front-loads the rise so most of the ~20h ramp sits
    clearly past baseline instead of in an ambiguous mid-range (see the old
    Waters version of this script's identical comment — same reasoning)."""
    ramp_start = incident_time - timedelta(hours=ramp_hours)
    recovery_end = incident_time + timedelta(hours=recovery_hours)
    if ramp_start <= t <= incident_time:
        frac = (t - ramp_start).total_seconds() / max((incident_time - ramp_start).total_seconds(), 1)
        return baseline + (peak - baseline) * (frac ** 0.25)
    if incident_time < t <= recovery_end:
        frac = (t - incident_time).total_seconds() / max((recovery_end - incident_time).total_seconds(), 1)
        return peak + (baseline - peak) * frac
    return None


def gen_asset_series(
    asset_id: str, profile: dict | None, start: datetime, end: datetime,
) -> tuple[list[dict], list[dict], str, str]:
    """Returns (reading_rows, incidents, series_key, unit). incidents is
    empty for the healthy asset."""
    if profile:
        series_key, unit = profile["series"], profile["unit"]
        lo_b, hi_b = profile["baseline"]
        base_value = random.uniform(lo_b, hi_b)
        peak = profile["peak"]
        incidents = gen_incidents(start, end)
        extra_series = profile["extra_series"]
        noise = abs(base_value) * 0.03 + 0.2
    else:
        series_key, unit = HEALTHY_SERIES, HEALTHY_UNIT
        base_value = random.uniform(*HEALTHY_BASELINE)
        peak = None
        incidents = []
        extra_series = {}
        noise = 1.0

    rows: list[dict] = []
    t = start
    step = timedelta(minutes=SAMPLE_INTERVAL_MIN)
    while t <= end:
        value = base_value + random.gauss(0, noise)
        for inc in incidents:
            bump = incident_bump(t, inc["time"], inc["ramp_hours"], inc["recovery_hours"], base_value, peak)
            if bump is not None:
                value = bump + random.gauss(0, noise * 0.5)

        values = {series_key: round(value, 3)}
        units_map = {series_key: unit}
        for extra_key, extra_base in extra_series.items():
            values[extra_key] = round(extra_base + random.gauss(0, abs(extra_base) * 0.1 + 0.1), 3)
            units_map[extra_key] = "h" if extra_key == "runhours" else ("L/h" if extra_key == "fuel_lph" else "")

        rows.append({
            "id": str(uuid.uuid4()),
            "asset_id": asset_id,
            "values": values,
            "units": units_map,
            "source": "simulated",
            "entered_by": None,
            "simulation_active": False,
            "simulation_type": None,
            "collected_at": t,
        })
        t += step

    return rows, incidents, series_key, unit


async def seed_history(now: datetime) -> dict[str, list[dict]]:
    """Insert Reading + resolved CRITICAL Alert rows. Returns {asset_id: incidents}."""
    start = now - timedelta(days=WINDOW_DAYS)
    factory = get_session_factory()
    all_incidents: dict[str, list[dict]] = {}

    async with factory() as db:
        assets = (await db.execute(select(Asset).where(Asset.id.in_(ALL_PM_ASSET_IDS)))).scalars().all()
        assets_by_id = {a.id: a for a in assets}

        for asset_id in ALL_PM_ASSET_IDS:
            asset = assets_by_id[asset_id]
            profile = INCIDENT_PROFILES.get(asset_id)
            rows, incidents, series_key, unit = gen_asset_series(asset_id, profile, start, now)
            all_incidents[asset_id] = incidents

            for chunk_start in range(0, len(rows), 2000):
                chunk = rows[chunk_start:chunk_start + 2000]
                await db.execute(insert(Reading), chunk)

            for inc in incidents:
                triggered_at = inc["time"]
                resolved_at = inc["time"] + timedelta(hours=inc["recovery_hours"])
                await db.execute(
                    insert(Alert),
                    [{
                        "id": str(uuid.uuid4()),
                        "rule_id": None,
                        "station_id": asset.station_id,
                        "asset_id": asset_id,
                        "series_key": series_key,
                        "severity": "critical",
                        "category": default_alert_category(asset.category),
                        "message": f"{series_key} critical on {asset.name}: historical incident",
                        "value": profile["peak"] if profile else None,
                        "first_seen": triggered_at,
                        "last_seen": resolved_at,
                        "occurrences": 1,
                        "state": "resolved",
                    }],
                )

            print(f"   + {asset_id}: {len(rows)} reading rows, {len(incidents)} historical incidents")

        await db.commit()

    return all_incidents


async def seed_prediction_history(
    incidents_by_asset: dict[str, list[dict]], model_version_id: str,
) -> None:
    """Curated MLPrediction + MLPredictionOutcome pairs — mostly tied to
    real incidents generated above, a few deliberately not, for realistic
    variety instead of a suspicious 100% CORRECT record."""
    factory = get_session_factory()
    specs: list[dict] = []

    def add_incident_outcome(asset_id: str, incident_idx: int, outcome: str, lead: timedelta) -> None:
        incidents = incidents_by_asset[asset_id]
        if incident_idx >= len(incidents):
            return
        inc = incidents[incident_idx]
        profile = INCIDENT_PROFILES[asset_id]
        incident_time = inc["time"]
        recovery_min = inc["recovery_hours"] * 60

        if outcome == "FALSE_NEGATIVE":
            prob, risk, factors = random.uniform(0.05, 0.15), "LOW", []
        else:
            prob, risk = random.uniform(0.78, 0.95), "CRITICAL"
            factors = [f"Trending {profile['series']} ({profile['direction']})"]

        specs.append({
            "asset_id": asset_id,
            "predicted_failure_prob": prob,
            "predicted_runtime_minutes": lead.total_seconds() / 60,
            "risk_level": risk,
            "primary_risk_factors": factors,
            "prediction_timestamp": incident_time - lead,
            "outcome": outcome,
            "actual_failure_time": incident_time,
            "actual_downtime_minutes": recovery_min,
            "evaluated_at": incident_time,
        })

    add_incident_outcome("maitri-power-generator-01", 0, "CORRECT", timedelta(hours=4))
    add_incident_outcome("maitri-power-generator-01", 1, "CORRECT", timedelta(hours=6))
    add_incident_outcome("maitri-storage-freezer-01", 0, "CORRECT", timedelta(hours=3))
    add_incident_outcome("maitri-storage-freezer-01", 1, "EARLY", timedelta(hours=20))
    add_incident_outcome("bharati-storage-fuel-tank-01", 0, "CORRECT", timedelta(hours=5))
    add_incident_outcome("bharati-storage-fuel-tank-01", 1, "LATE", timedelta(minutes=25))
    add_incident_outcome("maitri-power-generator-01", 2, "FALSE_NEGATIVE", timedelta(hours=3))

    fp_time = utcnow() - timedelta(days=6)
    specs.append({
        "asset_id": "maitri-storage-freezer-01",
        "predicted_failure_prob": random.uniform(0.8, 0.9),
        "predicted_runtime_minutes": 180.0,
        "risk_level": "CRITICAL",
        "primary_risk_factors": ["Trending temp_c (up)"],
        "prediction_timestamp": fp_time,
        "outcome": "FALSE_POSITIVE",
        "actual_failure_time": None,
        "actual_downtime_minutes": None,
        "evaluated_at": fp_time + timedelta(hours=24),
    })
    pt = utcnow() - timedelta(days=2)
    specs.append({
        "asset_id": HEALTHY_ASSET,
        "predicted_failure_prob": random.uniform(0.02, 0.1),
        "predicted_runtime_minutes": None,
        "risk_level": "LOW",
        "primary_risk_factors": [],
        "prediction_timestamp": pt,
        "outcome": "NO_FAILURE",
        "actual_failure_time": None,
        "actual_downtime_minutes": None,
        "evaluated_at": pt + timedelta(hours=24),
    })

    async with factory() as db:
        for spec in specs:
            prediction_id = str(uuid.uuid4())
            await db.execute(insert(MLPrediction), [{
                "id": prediction_id,
                "asset_id": spec["asset_id"],
                "model_version_id": model_version_id,
                "predicted_failure_prob": spec["predicted_failure_prob"],
                "predicted_runtime_minutes": spec["predicted_runtime_minutes"],
                "confidence": round(random.uniform(0.72, 0.94), 2),
                "risk_level": spec["risk_level"],
                "primary_risk_factors": spec["primary_risk_factors"],
                "prediction_timestamp": spec["prediction_timestamp"],
            }])
            await db.execute(insert(MLPredictionOutcome), [{
                "id": str(uuid.uuid4()),
                "prediction_id": prediction_id,
                "actual_failure_time": spec["actual_failure_time"],
                "actual_downtime_minutes": spec["actual_downtime_minutes"],
                "outcome": spec["outcome"],
                "evaluated_at": spec["evaluated_at"],
            }])
        await db.commit()

    print(f"   + {len(specs)} prediction/outcome pairs seeded")


async def reset_previous_run(asset_ids: list[str]) -> None:
    """Wipe this script's own prior output so reruns stay one clean
    generation instead of accumulating overlapping history."""
    factory = get_session_factory()
    async with factory() as db:
        await db.execute(delete(Reading).where(Reading.asset_id.in_(asset_ids)))
        await db.execute(
            delete(Alert).where(Alert.asset_id.in_(asset_ids), Alert.state == "resolved")
        )
        await db.execute(delete(MLPredictionOutcome))
        await db.execute(delete(MLPrediction))
        await db.execute(delete(MLModelVersion))
        await db.commit()
    print("   (cleared this script's previous run — readings, historical alerts, ML tables)")


API_BASE = "http://localhost:8000"
AUTH_HEADERS = {"Authorization": f"Bearer {settings.API_SECRET_KEY}"}


async def train_and_forecast_via_api() -> dict:
    """Drive training + live inference through the backend's own HTTP API
    instead of importing train.run_training()/predict.generate_forecasts()
    directly — MLModelVersion.artifact_path is resolved relative to
    wherever the training PROCESS runs, and the live backend serves from
    inside its own container; a model trained by this script's own process
    would write a path the container's predict.generate_forecasts() can't
    find, silently emptying the Forecast tab despite /accuracy correctly
    reporting a production model."""
    async with httpx.AsyncClient(base_url=API_BASE, headers=AUTH_HEADERS, timeout=60.0) as client:
        before = (await client.get("/model-accuracy/accuracy")).json()["model_version"]

        retrain = await client.post("/model-accuracy/retrain")
        retrain.raise_for_status()

        train_result: dict | None = None
        for _ in range(60):
            await asyncio.sleep(1)
            acc = (await client.get("/model-accuracy/accuracy")).json()
            if acc["model_version"] != before and acc["model_version"] != "none":
                train_result = acc
                break
        if train_result is None:
            raise SystemExit("Training via POST /model-accuracy/retrain did not complete in time")

        forecast_resp = await client.get("/model-accuracy/forecast")
        forecast_resp.raise_for_status()
        forecast = forecast_resp.json()

    return {"version": train_result["model_version"], "classification": train_result["classification"], "forecast": forecast}


async def main() -> None:
    now = utcnow()
    factory = get_session_factory()

    async with factory() as db:
        result = await db.execute(select(Asset).where(Asset.id.in_(ALL_PM_ASSET_IDS)))
        assets = result.scalars().all()

    found_ids = {a.id for a in assets}
    missing = set(ALL_PM_ASSET_IDS) - found_ids
    if missing:
        raise SystemExit(
            f"Missing assets (run scripts/seed_himadri_demo.py first): {sorted(missing)}"
        )

    await reset_previous_run(ALL_PM_ASSET_IDS)

    print(f"Seeding {WINDOW_DAYS} days of history for {len(ALL_PM_ASSET_IDS)} assets...")
    incidents_by_asset = await seed_history(now)

    print(f"Training via the live backend's own API ({API_BASE}/model-accuracy/retrain)...")
    result = await train_and_forecast_via_api()
    print(f"   Model {result['version']} trained: {result['classification']}")
    print(f"   Live forecast generated for {len(result['forecast']['systems'])} assets")

    async with factory() as db:
        model = (
            await db.execute(select(MLModelVersion).where(MLModelVersion.status == "production"))
        ).scalar_one()

    print("Seeding curated prediction history...")
    await seed_prediction_history(incidents_by_asset, model.id)

    print("\nPredictive Maintenance demo data seeded successfully!")
    print(f"   Model version: {result['version']}")
    print(f"   Classification: {result['classification']}")


if __name__ == "__main__":
    asyncio.run(main())
