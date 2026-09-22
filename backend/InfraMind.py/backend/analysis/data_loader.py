"""
data_loader.py — Async helpers for loading raw data from PostgreSQL for the
predictive-maintenance pipeline.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

import pandas as pd
# pyrefly: ignore [missing-import]
from sqlalchemy import select

from backend.database.postgres import get_session_factory
from backend.models.tables import Alert, Asset, Reading


def _primary_value(values: dict) -> float | None:
    """A Reading's values dict is heterogeneous across asset categories
    (litres, °C, kW, nT...) — take the first declared series as "the"
    numeric value for this generic ML pipeline, matching Asset.primary_series
    (the series the rest of the app treats as the asset's headline number)."""
    if not values:
        return None
    return next(iter(values.values()), None)


async def load_readings_dataframe(start_time: datetime | None = None) -> pd.DataFrame:
    """Return all Reading rows as a pandas DataFrame, optionally filtered by start_time."""
    factory = get_session_factory()
    async with factory() as db:
        q = select(Reading)
        if start_time:
            q = q.where(Reading.collected_at >= start_time)
        q = q.order_by(Reading.collected_at.asc())
        result = await db.execute(q)
        rows = result.scalars().all()

    if not rows:
        return pd.DataFrame()

    data = [
        {
            "asset_id": r.asset_id,
            "value": _primary_value(r.values),
            "collected_at": r.collected_at,
        }
        for r in rows
    ]
    df = pd.DataFrame(data)
    df["collected_at"] = pd.to_datetime(df["collected_at"])
    return df


async def load_alerts_dataframe(start_time: datetime | None = None) -> pd.DataFrame:
    """Return CRITICAL/EMERGENCY Alert rows as a DataFrame (used as failure labels)."""
    factory = get_session_factory()
    async with factory() as db:
        q = select(Alert).where(Alert.severity.in_(["critical", "emergency"]))
        if start_time:
            q = q.where(Alert.first_seen >= start_time)
        result = await db.execute(q)
        rows = result.scalars().all()

    if not rows:
        return pd.DataFrame()

    data = [
        {
            "asset_id": a.asset_id,
            "triggered_at": a.first_seen,
            "last_seen": a.last_seen,
        }
        for a in rows
    ]
    df = pd.DataFrame(data)
    df["triggered_at"] = pd.to_datetime(df["triggered_at"])
    df["last_seen"] = pd.to_datetime(df["last_seen"])
    return df


async def load_assets() -> List[Dict[str, Any]]:
    """Return a list of asset dicts: id, name, health_score."""
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(select(Asset))
        assets = result.scalars().all()
    return [{"id": a.id, "name": a.name, "health_score": a.health_score} for a in assets]
