"""
predict.py — Generate live predictions for all assets using the latest production model.
"""
from __future__ import annotations

import os
import pickle
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

# pyrefly: ignore [missing-import]
import structlog
# pyrefly: ignore [missing-import]
from sqlalchemy import desc, select

from backend.analysis.data_loader import load_assets, load_readings_dataframe
from backend.analysis.feature_engineering import extract_latest_features
from backend.database.postgres import get_session_factory
from backend.models.tables import MLModelVersion, MLPrediction

logger = structlog.get_logger(__name__)

_RISK_THRESHOLDS = {"CRITICAL": 0.75, "HIGH": 0.5, "MEDIUM": 0.2}


def _risk_label(prob: float) -> str:
    if prob >= _RISK_THRESHOLDS["CRITICAL"]:
        return "CRITICAL"
    if prob >= _RISK_THRESHOLDS["HIGH"]:
        return "HIGH"
    if prob >= _RISK_THRESHOLDS["MEDIUM"]:
        return "MEDIUM"
    return "LOW"


def _risk_factors(row: Any) -> list[str]:
    factors = []
    if abs(row.get("value_slope", 0)) > (0.1 * max(abs(row.get("value", 1) or 1), 1)):
        factors.append("Rapid change in the asset's primary reading")
    if row.get("value_roll_mean_3", 0) and row.get("value") and abs(row["value"] - row["value_roll_mean_3"]) > (0.2 * abs(row["value_roll_mean_3"] or 1)):
        factors.append("Current reading deviates from its recent trend")
    return factors


async def generate_forecasts() -> dict | None:
    """
    Load the latest production model, run inference on recent readings,
    persist predictions, and return a forecast dict.
    Returns None if no production model exists.
    """
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(MLModelVersion).where(MLModelVersion.status == "production").order_by(desc(MLModelVersion.trained_at)).limit(1)
        )
        model_ver = result.scalar_one_or_none()

    if not model_ver or not model_ver.artifact_path:
        logger.warning("predict.no_production_model")
        return None

    if not os.path.exists(model_ver.artifact_path):
        logger.warning("predict.artifact_missing", path=model_ver.artifact_path)
        return None

    with open(model_ver.artifact_path, "rb") as fh:
        artifact = pickle.load(fh)

    clf = artifact["classifier"]
    reg = artifact.get("regressor")
    features = artifact["features"]

    # Load last 48h of readings for rolling feature computation
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=48)
    readings_df = await load_readings_dataframe(start_time=cutoff)
    if readings_df.empty:
        logger.warning("predict.no_recent_readings")
        return None

    latest_df = extract_latest_features(readings_df)
    if latest_df.empty:
        return None

    assets = await load_assets()
    asset_health = {a["id"]: a.get("health_score", 100) for a in assets}
    asset_name = {a["id"]: a["name"] for a in assets}

    X = latest_df[features].fillna(0)
    proba = clf.predict_proba(X)[:, 1] if len(clf.classes_) > 1 else clf.predict(X).astype(float)
    runtimes = reg.predict(X) if reg is not None else [None] * len(X)

    predictions_to_save: list[MLPrediction] = []
    systems: list[dict] = []

    for i, (_, row) in enumerate(latest_df.iterrows()):
        asset_id = str(row["asset_id"])
        prob = float(proba[i])
        runtime = float(runtimes[i]) if runtimes[i] is not None else None
        risk = _risk_label(prob)
        factors = _risk_factors(row)

        predictions_to_save.append(
            MLPrediction(
                id=str(uuid.uuid4()),
                asset_id=asset_id,
                model_version_id=model_ver.id,
                predicted_failure_prob=prob,
                predicted_runtime_minutes=runtime,
                confidence=0.82,
                risk_level=risk,
                primary_risk_factors=factors,
            )
        )
        systems.append(
            {
                "asset_id": asset_id,
                "asset_name": asset_name.get(asset_id, "Unknown"),
                "risk_level": risk,
                "failure_probability": round(prob, 4),
                "current_health_score": asset_health.get(asset_id, 100),
                "estimated_remaining_runtime_minutes": round(runtime, 1) if runtime else None,
                "confidence": 0.82,
                "risk_factors": factors,
                "prediction_status": "OK",
            }
        )

    async with factory() as db:
        db.add_all(predictions_to_save)
        await db.commit()

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model_version": model_ver.version,
        "forecast_horizon": "24h",
        "systems": systems,
    }
