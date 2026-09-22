"""
feature_engineering.py — Build ML feature matrices from raw readings/alerts.

Readings are heterogeneous across asset categories (fuel litres, freezer °C,
generator kW, magnetometer nT...), so unlike a fixed cpu/memory/disk vector
this pipeline works over each asset's single generalised "value" series
(data_loader._primary_value — the asset's declared primary series) plus a
rolling mean and slope over it. It's a smaller feature set than a
category-specific model would use, but it's the same one for every asset
category, which is what makes "add a new device type" (FR-99) not require a
retrain-pipeline change.
"""
from __future__ import annotations

# pyrefly: ignore [missing-import]
import numpy as np
import pandas as pd

FEATURE_COLS = [
    "value",
    "value_roll_mean_3",
    "value_slope",
]

# Bucket width for resampling raw readings before computing rolling/slope
# features. Kept well below HEARTBEAT_INTERVAL-driven data volume (default
# 10s heartbeats) so a model can train from minutes of live telemetry
# instead of requiring hours of uptime to fill hourly buckets — see
# train.py's minimum train/val row counts.
RESAMPLE_FREQ = "1min"


def _enrich_group(group: pd.DataFrame) -> pd.DataFrame:
    """Add rolling and slope features to a single-asset resampled group."""
    group = group.resample(RESAMPLE_FREQ).mean(numeric_only=True)
    group.dropna(how="all", inplace=True)
    group["value_roll_mean_3"] = group["value"].rolling(3, min_periods=1).mean()
    group["value_slope"] = group["value"].diff().fillna(0)
    return group


def build_training_features(
    readings_df: pd.DataFrame,
    alerts_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Build a feature-labelled DataFrame for model training.

    Labels:
      - label_failure_24h: 1 if a Critical/Emergency alert fires within 24 h, else 0
      - time_to_failure_min: minutes to next alert (NaN if none)
    """
    if readings_df.empty:
        raise ValueError("Insufficient data: no reading rows")

    readings_df = readings_df.sort_values(["asset_id", "collected_at"]).copy()
    readings_df = readings_df.set_index("collected_at")

    enriched_parts: list[pd.DataFrame] = []
    for asset_id, grp in readings_df.groupby("asset_id"):
        part = _enrich_group(grp.copy())
        part["asset_id"] = asset_id
        enriched_parts.append(part)

    if not enriched_parts:
        raise ValueError("Insufficient data after resampling")

    feature_df = pd.concat(enriched_parts).reset_index().rename(columns={"index": "collected_at"})
    feature_df = feature_df.dropna(subset=["value"])

    # Labels
    feature_df["label_failure_24h"] = 0
    feature_df["time_to_failure_min"] = np.nan

    if not alerts_df.empty:
        for asset_id, asset_feat in feature_df.groupby("asset_id"):
            asset_alerts = alerts_df[alerts_df["asset_id"] == asset_id].sort_values("triggered_at")
            for idx, row in asset_feat.iterrows():
                ts = row["collected_at"]
                future = asset_alerts[asset_alerts["triggered_at"] > ts]
                if not future.empty:
                    delta_min = (future.iloc[0]["triggered_at"] - ts).total_seconds() / 60.0
                    feature_df.at[idx, "time_to_failure_min"] = delta_min
                    if delta_min <= 1440:  # 24 h
                        feature_df.at[idx, "label_failure_24h"] = 1

    return feature_df


def extract_latest_features(readings_df: pd.DataFrame) -> pd.DataFrame:
    """Return the single most-recent feature vector per asset (for live inference)."""
    if readings_df.empty:
        return pd.DataFrame()

    readings_df = readings_df.sort_values(["asset_id", "collected_at"]).copy()
    readings_df = readings_df.set_index("collected_at")

    rows: list[pd.DataFrame] = []
    for asset_id, grp in readings_df.groupby("asset_id"):
        part = _enrich_group(grp.copy())
        if part.empty:
            continue
        latest = part.iloc[[-1]].copy()
        latest["asset_id"] = asset_id
        rows.append(latest)

    if not rows:
        return pd.DataFrame()

    return pd.concat(rows).reset_index().rename(columns={"index": "collected_at"})
