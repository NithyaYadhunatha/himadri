"""
train.py — Train RF classifier + regressor and register in ml_model_versions.
"""
from __future__ import annotations

import os
import pickle
import uuid
from datetime import datetime, timezone

# pyrefly: ignore [missing-import]
import structlog
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    recall_score,
    roc_auc_score,
)
# pyrefly: ignore [missing-import]
from sqlalchemy import select

from backend.analysis.data_loader import load_alerts_dataframe, load_readings_dataframe
from backend.analysis.feature_engineering import FEATURE_COLS, build_training_features
from backend.database.postgres import get_session_factory
from backend.models.tables import MLModelVersion

logger = structlog.get_logger(__name__)

ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "..", "models", "artifacts")


async def run_training() -> dict:
    """
    Full train pipeline:
      1. Load data from DB
      2. Feature engineering
      3. Chronological 80/20 split
      4. Train classifier (failure_24h) + regressor (time_to_failure)
      5. Evaluate, save pickle, register in DB
    """
    logger.info("train.start")
    os.makedirs(ARTIFACT_DIR, exist_ok=True)

    readings_df = await load_readings_dataframe()
    alerts_df = await load_alerts_dataframe()

    if readings_df.empty:
        logger.warning("train.insufficient_data")
        return {"status": "INSUFFICIENT_DATA", "reason": "No reading rows in DB"}

    try:
        feat_df = build_training_features(readings_df, alerts_df)
    except ValueError as exc:
        logger.warning("train.feature_error", error=str(exc))
        return {"status": "INSUFFICIENT_DATA", "reason": str(exc)}

    feat_df = feat_df.sort_values("collected_at")
    n = len(feat_df)
    split = int(n * 0.8)
    train_df = feat_df.iloc[:split]
    val_df = feat_df.iloc[split:]

    if len(train_df) < 5 or len(val_df) < 2:
        return {"status": "INSUFFICIENT_DATA", "reason": "Too few samples after split"}

    X_train = train_df[FEATURE_COLS].fillna(0)
    y_train = train_df["label_failure_24h"]
    X_val = val_df[FEATURE_COLS].fillna(0)
    y_val = val_df["label_failure_24h"]

    # ── Classifier ─────────────────────────────────────────────────────────────
    clf = RandomForestClassifier(n_estimators=100, max_depth=6, class_weight="balanced", random_state=42)
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_val)
    y_proba = clf.predict_proba(X_val)[:, 1] if len(clf.classes_) > 1 else y_pred.astype(float)

    cls_metrics = {
        "accuracy": float(accuracy_score(y_val, y_pred)) * 100,
        "precision": float(precision_score(y_val, y_pred, zero_division=0)) * 100,
        "recall": float(recall_score(y_val, y_pred, zero_division=0)) * 100,
        "f1": float(f1_score(y_val, y_pred, zero_division=0)) * 100,
        "roc_auc": float(roc_auc_score(y_val, y_proba)) * 100 if len(set(y_val)) > 1 else 50.0,
    }

    # ── Regressor (time to failure) ─────────────────────────────────────────────
    reg = None
    reg_metrics = {"mae_minutes": 0.0, "rmse_minutes": 0.0}
    train_reg = train_df.dropna(subset=["time_to_failure_min"])
    val_reg = val_df.dropna(subset=["time_to_failure_min"])
    if len(train_reg) >= 5 and len(val_reg) >= 2:
        reg = RandomForestRegressor(n_estimators=100, max_depth=6, random_state=42)
        reg.fit(train_reg[FEATURE_COLS].fillna(0), train_reg["time_to_failure_min"])
        y_reg_pred = reg.predict(val_reg[FEATURE_COLS].fillna(0))
        reg_metrics = {
            "mae_minutes": float(mean_absolute_error(val_reg["time_to_failure_min"], y_reg_pred)),
            "rmse_minutes": float(mean_squared_error(val_reg["time_to_failure_min"], y_reg_pred) ** 0.5),
        }

    # ── Feature importance ──────────────────────────────────────────────────────
    feat_imp = sorted(
        [{"feature": f, "importance": float(i)} for f, i in zip(FEATURE_COLS, clf.feature_importances_)],
        key=lambda x: x["importance"],
        reverse=True,
    )

    metrics_json = {
        "classification": cls_metrics,
        "regression": reg_metrics,
        "feature_importance": feat_imp,
        "n_train": int(len(train_df)),
        "n_val": int(len(val_df)),
    }

    # ── Persist model pickle ────────────────────────────────────────────────────
    version_str = f"v_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    artifact_path = os.path.join(ARTIFACT_DIR, f"{version_str}.pkl")
    with open(artifact_path, "wb") as fh:
        pickle.dump({"classifier": clf, "regressor": reg, "features": FEATURE_COLS, "version": version_str}, fh)

    # ── Register in DB ──────────────────────────────────────────────────────────
    factory = get_session_factory()
    async with factory() as db:
        # Retire old production models
        # pyrefly: ignore [missing-import]
        from sqlalchemy import update
        await db.execute(
            update(MLModelVersion)
            .where(MLModelVersion.status == "production")
            .values(status="retired")
        )
        new_model = MLModelVersion(
            id=str(uuid.uuid4()),
            version=version_str,
            data_start=feat_df["collected_at"].min().to_pydatetime(),
            data_end=feat_df["collected_at"].max().to_pydatetime(),
            metrics_json=metrics_json,
            status="production",
            artifact_path=artifact_path,
        )
        db.add(new_model)
        await db.commit()

    logger.info("train.complete", version=version_str, metrics=cls_metrics)
    return {"status": "SUCCESS", "version": version_str, "metrics": metrics_json}
