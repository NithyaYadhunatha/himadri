"""
Ingest Engine — the shared reading -> alert -> risk -> graph -> WebSocket
pipeline behind every telemetry entry point.

Extracted out of backend/routers/agents.py's receive_heartbeat() (the
device agent's HTTP heartbeat) so the new MQTT listener
(backend/services/mqtt_ingest.py) runs the exact same pipeline instead of a
second, independently-maintained copy. Both callers do the same thing once
they have an Asset and a values/units dict in hand: store the Reading,
evaluate threshold alert rules, recompute risk/health, keep the Neo4j
dependency graph in sync, and broadcast the resulting WebSocket events.

Deliberately NOT responsible for anything transport-specific:
  - the heartbeat's simulation_active "simulating" status override and its
    INFO-severity simulation-flag alert (backend/services/alert_engine.py's
    evaluate_simulation_flag) stay in receive_heartbeat() — MQTT readings
    have no such flag
  - pending-command delivery (next_deliverable_command) and the
    HeartbeatResponse shape stay in receive_heartbeat()
  - MQTT topic/payload parsing, unknown/unapproved-asset handling, and
    manifest unit validation stay in backend/services/mqtt_ingest.py
Callers resolve all of that themselves and pass this function only what the
shared pipeline actually needs.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.tables import Alert, AlertRule, Asset, Reading
from backend.services import alert_engine, dependency_engine, risk_engine
from backend.websocket.manager import ws_manager

logger = structlog.get_logger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@dataclass
class IngestResult:
    """Everything a caller might need after ingest_reading() runs. The
    heartbeat response needs open_alerts/health_score/risk_score in addition
    to new_alerts; the MQTT listener only logs new_alerts and discards the
    rest."""

    reading: Reading
    new_alerts: list[Alert]
    open_alerts: list[Alert]
    risk_score: float
    health_score: float
    previous_status: str
    effective_status: str


async def ingest_reading(
    db: AsyncSession,
    asset: Asset,
    *,
    values: dict[str, float],
    units: dict[str, str] | None,
    source: str = "simulated",
    status: str = "ok",
    simulation_active: bool = False,
    simulation_type: str | None = None,
) -> IngestResult:
    """
    The shared pipeline behind every telemetry entry point: create the
    Reading row, evaluate alert rules, recompute risk/health, update the
    Neo4j graph, and broadcast the resulting WebSocket events.

    `status` is the asset status this reading implies. Callers resolve any
    transport-specific override themselves before calling in — e.g.
    receive_heartbeat() turns `simulation_active` into `"simulating"` before
    passing `status` here; the MQTT listener always passes the default
    `"ok"` since the MQTT payload contract has no status/simulation concept.
    """
    now = _utcnow()

    reading = Reading(
        asset_id=asset.id,
        values=values,
        units=units,
        source=source,
        simulation_active=simulation_active,
        simulation_type=simulation_type,
    )
    db.add(reading)
    await db.flush()

    # Update the denormalised "latest value" tile from the asset's own
    # primary series, if declared.
    if asset.primary_series and asset.primary_series in values:
        asset.primary_value = values[asset.primary_series]

    # ── Evaluate alert rules for this asset ──────────────────────────────
    rules_result = await db.execute(
        select(AlertRule).where(
            AlertRule.enabled == True,  # noqa: E712
            (AlertRule.asset_id == asset.id) | (AlertRule.asset_id.is_(None)),
        )
    )
    rules = [r for r in rules_result.scalars().all() if r.asset_id == asset.id or r.station_id in (None, asset.station_id)]
    new_alerts = await alert_engine.evaluate_reading(db, asset, values, rules)

    if asset.status in ("offline", "fault"):
        await alert_engine.resolve_stale_alert(db, asset.id)

    # ── Recompute risk score ──────────────────────────────────────────────
    dependent_count = await dependency_engine.get_dependents_count(asset.id)
    open_alerts = await alert_engine.get_open_alerts_for_asset(db, asset.id)
    crit_count, warn_count = alert_engine.count_open_alerts(open_alerts)

    risk_score, health_score, _ = risk_engine.compute_asset_risk(
        failure_prob_pct=None,
        dependent_count=dependent_count,
        active_critical_alerts=crit_count,
        active_warning_alerts=warn_count,
    )

    previous_status = asset.status
    asset.status = status
    asset.health_score = health_score
    asset.risk_score = risk_score
    asset.last_seen = now

    await dependency_engine.update_asset_in_graph(
        asset_id=asset.id,
        status=status,
        health_score=health_score,
        name=asset.name,
        category=asset.category,
        station_id=asset.station_id,
    )

    await ws_manager.broadcast_reading_updated(asset.id, values, reading.collected_at)
    if status != previous_status:
        await ws_manager.broadcast_asset_status_changed(asset.id, status, health_score)
    for alert in new_alerts:
        await ws_manager.broadcast_alert_triggered(
            asset.id, {"id": alert.id, "severity": alert.severity, "category": alert.category, "message": alert.message}
        )

    logger.debug(
        "ingest_engine.reading_ingested",
        asset_id=asset.id,
        source=source,
        status=status,
        risk_score=risk_score,
        new_alerts=len(new_alerts),
    )

    return IngestResult(
        reading=reading,
        new_alerts=new_alerts,
        open_alerts=open_alerts,
        risk_score=risk_score,
        health_score=health_score,
        previous_status=previous_status,
        effective_status=status,
    )
