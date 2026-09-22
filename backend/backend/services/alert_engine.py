"""
Alert Engine — rule-driven threshold alerting, de-duplication, and escalation
(FR-56…64).

Unlike a hardcoded cpu/memory/disk checker, this evaluates configurable
AlertRule rows against an asset's incoming Reading.values — new devices get
default rules from their manifest (FR-100) instead of requiring a code
change (FR-99). An alert's natural key is (rule_id, asset_id, series_key,
state='open') — a repeat firing bumps `occurrences` and `last_seen` rather
than creating a new row (FR-61 dedup / flap-damping).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.tables import Alert, AlertRule, Asset

logger = structlog.get_logger(__name__)

# Maps an asset category to the alert category vocabulary used everywhere
# else (safety | power | environment | logistics | science | security) —
# used as the default category for auto-generated rules and synthetic
# (non-rule-backed) alerts like stale-data/simulation notices.
_CATEGORY_FOR_ASSET_CATEGORY: dict[str, str] = {
    "power": "power",
    "heating": "power",
    "water": "environment",
    "waste": "environment",
    "vehicle": "logistics",
    "instrument": "science",
    "storage": "logistics",
    "medical": "safety",
    "comms": "security",
    "structure": "safety",
}


def default_alert_category(asset_category: str) -> str:
    return _CATEGORY_FOR_ASSET_CATEGORY.get(asset_category, "safety")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ─── Internal helpers ────────────────────────────────────────────────────────


async def _get_open_alert(
    db: AsyncSession, rule_id: str | None, asset_id: str, series_key: str | None
) -> Alert | None:
    result = await db.execute(
        select(Alert).where(
            and_(
                Alert.rule_id == rule_id,
                Alert.asset_id == asset_id,
                Alert.series_key == series_key,
                Alert.state == "open",
            )
        )
    )
    return result.scalar_one_or_none()


async def _raise_or_bump(
    db: AsyncSession,
    *,
    rule_id: str | None,
    station_id: str,
    asset_id: str,
    series_key: str | None,
    severity: str,
    category: str,
    message: str,
    value: float | None,
    new_alerts: list[Alert],
) -> None:
    existing = await _get_open_alert(db, rule_id, asset_id, series_key)
    now = _utcnow()
    if existing:
        existing.last_seen = now
        existing.occurrences += 1
        existing.value = value
        await db.flush()
        return

    alert = Alert(
        rule_id=rule_id,
        station_id=station_id,
        asset_id=asset_id,
        series_key=series_key,
        severity=severity,
        category=category,
        message=message,
        value=value,
        first_seen=now,
        last_seen=now,
        occurrences=1,
        state="open",
    )
    db.add(alert)
    await db.flush()
    logger.info("alert.created", asset_id=asset_id, severity=severity, category=category, message=message)
    new_alerts.append(alert)


async def _auto_resolve(
    db: AsyncSession, rule_id: str | None, asset_id: str, series_key: str | None
) -> None:
    existing = await _get_open_alert(db, rule_id, asset_id, series_key)
    if existing:
        existing.state = "resolved"
        await db.flush()
        logger.info("alert.auto_resolved", asset_id=asset_id, alert_id=existing.id)


# ─── Rule evaluation ─────────────────────────────────────────────────────────


def _rule_condition_met(rule: AlertRule, value: float) -> bool:
    params = rule.params or {}
    if rule.type == "above":
        return value > float(params.get("threshold", float("inf")))
    if rule.type == "below":
        return value < float(params.get("threshold", float("-inf")))
    if rule.type == "out_of_band":
        lo, hi = params.get("min"), params.get("max")
        return (lo is not None and value < lo) or (hi is not None and value > hi)
    # rate_of_change / anomaly are evaluated elsewhere (need history); ignored here
    return False


async def evaluate_reading(
    db: AsyncSession,
    asset: Asset,
    values: dict[str, float],
    rules: list[AlertRule],
) -> list[Alert]:
    """
    Evaluate every enabled threshold rule that applies to this asset against
    the just-ingested reading values. Returns newly-created/escalated alerts.
    """
    new_alerts: list[Alert] = []

    for rule in rules:
        if not rule.enabled or rule.series_key is None:
            continue
        if rule.series_key not in values:
            continue
        value = values[rule.series_key]
        met = _rule_condition_met(rule, value)
        if met:
            await _raise_or_bump(
                db,
                rule_id=rule.id,
                station_id=asset.station_id,
                asset_id=asset.id,
                series_key=rule.series_key,
                severity=rule.severity,
                category=rule.category,
                message=f"{rule.series_key} {rule.type} threshold on {asset.name}: {value}",
                value=value,
                new_alerts=new_alerts,
            )
        else:
            await _auto_resolve(db, rule.id, asset.id, rule.series_key)

    return new_alerts


async def evaluate_simulation_flag(
    db: AsyncSession, asset: Asset, simulation_active: bool, simulation_type: str | None
) -> list[Alert]:
    """A demo-visible INFO notice while a device is running an injected fault
    (the fault itself is expected to also trip a real threshold rule above)."""
    new_alerts: list[Alert] = []
    if simulation_active:
        await _raise_or_bump(
            db,
            rule_id=None,
            station_id=asset.station_id,
            asset_id=asset.id,
            series_key="__simulation__",
            severity="info",
            category=default_alert_category(asset.category),
            message=f"{asset.name} is running an injected fault: {simulation_type or 'unknown'}",
            value=None,
            new_alerts=new_alerts,
        )
    else:
        await _auto_resolve(db, None, asset.id, "__simulation__")
    return new_alerts


async def trigger_stale_alert(db: AsyncSession, asset: Asset) -> Alert | None:
    """Called by the offline-detection loop when an asset hasn't reported
    within its stale-data window (FR-47, architecture's 'stale-data' rule —
    a stale series is an alert, never a silently-blank chart)."""
    new_alerts: list[Alert] = []
    await _raise_or_bump(
        db,
        rule_id=None,
        station_id=asset.station_id,
        asset_id=asset.id,
        series_key="__stale__",
        severity="critical",
        category=default_alert_category(asset.category),
        message=f"{asset.name} has not reported — data continuity lost",
        value=None,
        new_alerts=new_alerts,
    )
    return new_alerts[0] if new_alerts else None


async def resolve_stale_alert(db: AsyncSession, asset_id: str) -> None:
    await _auto_resolve(db, None, asset_id, "__stale__")


# ─── Query helpers ───────────────────────────────────────────────────────────


async def get_open_alerts_for_asset(db: AsyncSession, asset_id: str) -> list[Alert]:
    result = await db.execute(
        select(Alert).where(and_(Alert.asset_id == asset_id, Alert.state == "open"))
    )
    return list(result.scalars().all())


def count_open_alerts(alerts: list[Alert]) -> tuple[int, int]:
    """Return (critical_count, warning_count) from a list of Alert ORM objects."""
    critical = sum(1 for a in alerts if a.severity in ("critical", "emergency") and a.state == "open")
    warning = sum(1 for a in alerts if a.severity == "warning" and a.state == "open")
    return critical, warning


async def ack_alert(db: AsyncSession, alert: Alert, user: str, note: str | None) -> Alert:
    alert.state = "acked"
    alert.acked_by = user
    alert.acked_at = _utcnow()
    alert.ack_note = note
    await db.flush()
    logger.info("alert.acked", alert_id=alert.id, user=user)
    return alert


async def resolve_alert(db: AsyncSession, alert: Alert) -> Alert:
    alert.state = "resolved"
    await db.flush()
    return alert


async def escalate_due_alerts(db: AsyncSession, escalate_after_seconds: int = 900) -> list[Alert]:
    """Escalate open, unacked critical/emergency alerts older than the
    threshold (FR-60: unacked Critical/Emergency escalates on a timer)."""
    cutoff = _utcnow() - timedelta(seconds=escalate_after_seconds)
    result = await db.execute(
        select(Alert).where(
            and_(
                Alert.state == "open",
                Alert.severity.in_(["critical", "emergency"]),
                Alert.escalated_at.is_(None),
                Alert.first_seen <= cutoff,
            )
        )
    )
    due = list(result.scalars().all())
    for alert in due:
        alert.escalated_at = _utcnow()
    if due:
        await db.flush()
        logger.info("alert.escalated_batch", count=len(due))
    return due
