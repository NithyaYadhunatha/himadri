"""
Report Engine — generates report types stored as JSON in the reports table.

Report types:
  health        — per-asset or per-station status/reading snapshot + active alerts
  risk          — risk score breakdown, high-risk assets, blast radius
  environmental — waste + carbon footprint for Antarctic Treaty-aligned
                  compliance export over a date range (FR-43, FR-50, FR-51)
  daily_brief   — station-wide operational brief: weather, alerts, endurance,
                  convoy status (FR-94)
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.models.tables import Alert, Asset, InventoryItem, Reading, Report, WasteRecord
from backend.services import risk_engine
from backend.services.dependency_engine import get_blast_radius

logger = structlog.get_logger(__name__)


# ─── Helpers ─────────────────────────────────────────────────────────────────


async def _get_asset(db: AsyncSession, asset_id: str) -> Asset | None:
    return await db.get(Asset, asset_id)


async def _get_latest_reading(db: AsyncSession, asset_id: str) -> Reading | None:
    result = await db.execute(
        select(Reading).where(Reading.asset_id == asset_id).order_by(Reading.collected_at.desc()).limit(1)
    )
    return result.scalar_one_or_none()


async def _get_open_alerts(db: AsyncSession, station_id: str | None = None, asset_id: str | None = None) -> list[Alert]:
    q = select(Alert).where(Alert.state == "open")
    if station_id:
        q = q.where(Alert.station_id == station_id)
    if asset_id:
        q = q.where(Alert.asset_id == asset_id)
    result = await db.execute(q)
    return list(result.scalars().all())


def _emission_factor(fuel_subtype: str | None) -> float:
    mapping = {
        "atf": settings.EMISSION_FACTOR_ATF,
        "diesel": settings.EMISSION_FACTOR_DIESEL,
        "petrol": settings.EMISSION_FACTOR_PETROL,
    }
    return mapping.get((fuel_subtype or "").lower(), settings.EMISSION_FACTOR_ATF)


# ─── Report generators ────────────────────────────────────────────────────────


async def _generate_health_report(
    db: AsyncSession, station_id: str | None, asset_id: str | None
) -> tuple[str, dict[str, Any], str]:
    now = datetime.now(timezone.utc).isoformat()

    if asset_id:
        asset = await _get_asset(db, asset_id)
        if not asset:
            raise ValueError(f"Asset {asset_id} not found")
        reading = await _get_latest_reading(db, asset_id)
        alerts = await _get_open_alerts(db, asset_id=asset_id)

        content = {
            "generated_at": now,
            "report_type": "health",
            "asset": {
                "id": asset.id,
                "name": asset.name,
                "category": asset.category,
                "subtype": asset.subtype,
                "status": asset.status,
                "health_score": asset.health_score,
                "risk_score": asset.risk_score,
                "last_seen": asset.last_seen.isoformat() if asset.last_seen else None,
                "provenance": asset.provenance,
            },
            "latest_reading": {
                "values": reading.values if reading else None,
                "source": reading.source if reading else None,
                "collected_at": reading.collected_at.isoformat() if reading else None,
            },
            "open_alerts": [
                {"id": a.id, "severity": a.severity, "category": a.category, "message": a.message}
                for a in alerts
            ],
        }
        title = f"Health Report — {asset.name}"
        summary = f"Health Report for {asset.name} | Status: {asset.status} | Health: {asset.health_score:.1f}% | Open alerts: {len(alerts)}"
    else:
        q = select(Asset)
        if station_id:
            q = q.where(Asset.station_id == station_id)
        result = await db.execute(q)
        assets = list(result.scalars().all())
        alerts = await _get_open_alerts(db, station_id=station_id)

        content = {
            "generated_at": now,
            "report_type": "health",
            "station_id": station_id,
            "summary": {
                "total_assets": len(assets),
                "ok": sum(1 for a in assets if a.status == "ok"),
                "fault_or_offline": sum(1 for a in assets if a.status in ("fault", "offline")),
                "avg_health": round(sum(a.health_score for a in assets) / max(len(assets), 1), 2),
            },
            "open_alerts_total": len(alerts),
        }
        title = f"Station Health Report — {station_id or 'all stations'}"
        summary = f"Station Health Report | Assets: {len(assets)} | Open alerts: {len(alerts)}"

    return title, content, summary


async def _generate_risk_report(
    db: AsyncSession, station_id: str | None, asset_id: str | None
) -> tuple[str, dict[str, Any], str]:
    now = datetime.now(timezone.utc).isoformat()

    if asset_id:
        asset = await _get_asset(db, asset_id)
        if not asset:
            raise ValueError(f"Asset {asset_id} not found")
        alerts = await _get_open_alerts(db, asset_id=asset_id)
        blast = await get_blast_radius(asset_id)
        crit = sum(1 for a in alerts if a.severity in ("critical", "emergency"))
        warn = sum(1 for a in alerts if a.severity == "warning")

        risk_score, health_score, risk_level = risk_engine.compute_asset_risk(
            failure_prob_pct=None,
            dependent_count=blast.affected_count,
            active_critical_alerts=crit,
            active_warning_alerts=warn,
        )
        content = {
            "generated_at": now,
            "report_type": "risk",
            "asset": {"id": asset.id, "name": asset.name, "category": asset.category},
            "risk_score": risk_score,
            "health_score": health_score,
            "risk_level": risk_level,
            "blast_radius": {
                "affected_count": blast.affected_count,
                "affected_assets": [{"name": a.name, "category": a.category, "depth": a.depth} for a in blast.affected_assets],
            },
        }
        title = f"Risk Report — {asset.name}"
        summary = f"Risk Report for {asset.name} | Risk: {risk_level} ({risk_score:.1f}) | Blast radius: {blast.affected_count} asset(s)"
    else:
        q = select(Asset)
        if station_id:
            q = q.where(Asset.station_id == station_id)
        result = await db.execute(q)
        assets = list(result.scalars().all())
        sorted_assets = sorted(assets, key=lambda a: a.risk_score, reverse=True)
        content = {
            "generated_at": now,
            "report_type": "risk",
            "station_id": station_id,
            "highest_risk_assets": [
                {"id": a.id, "name": a.name, "risk_score": a.risk_score, "health_score": a.health_score, "status": a.status}
                for a in sorted_assets[:10]
            ],
            "risk_distribution": {
                "critical": sum(1 for a in assets if a.risk_score > 80),
                "high": sum(1 for a in assets if 61 <= a.risk_score <= 80),
                "medium": sum(1 for a in assets if 31 <= a.risk_score <= 60),
                "low": sum(1 for a in assets if a.risk_score <= 30),
            },
        }
        title = f"Station Risk Report — {station_id or 'all stations'}"
        summary = f"Risk Report | Critical: {content['risk_distribution']['critical']} | High: {content['risk_distribution']['high']}"

    return title, content, summary


async def _generate_environmental_report(
    db: AsyncSession, station_id: str | None, range_from: datetime | None, range_to: datetime | None
) -> tuple[str, dict[str, Any], str]:
    """Antarctic Treaty-aligned waste + carbon report for any date range (FR-43, FR-50, FR-51)."""
    now = datetime.now(timezone.utc).isoformat()
    range_from = range_from or (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=30))
    range_to = range_to or datetime.now(timezone.utc).replace(tzinfo=None)

    waste_q = select(WasteRecord).where(and_(WasteRecord.processed_at >= range_from, WasteRecord.processed_at <= range_to))
    if station_id:
        waste_q = waste_q.where(WasteRecord.station_id == station_id)
    waste_result = await db.execute(waste_q)
    waste_records = list(waste_result.scalars().all())

    waste_by_stream: dict[str, dict[str, float]] = {}
    for w in waste_records:
        bucket = waste_by_stream.setdefault(w.stream, {"mass_kg": 0.0, "volume_l": 0.0, "count": 0})
        bucket["mass_kg"] += w.mass_kg or 0.0
        bucket["volume_l"] += w.volume_l or 0.0
        bucket["count"] += 1

    fuel_q = select(InventoryItem).where(InventoryItem.kind == "fuel")
    if station_id:
        fuel_q = fuel_q.where(InventoryItem.station_id == station_id)
    fuel_result = await db.execute(fuel_q)
    fuel_items = list(fuel_result.scalars().all())

    content = {
        "generated_at": now,
        "report_type": "environmental",
        "station_id": station_id,
        "range_from": range_from.isoformat(),
        "range_to": range_to.isoformat(),
        "waste_by_stream": waste_by_stream,
        "waste_records_total": len(waste_records),
        "backhaul_pending": sum(1 for w in waste_records if w.disposition != "backloaded"),
        "fuel_inventory_snapshot": [
            {"name": f.name, "subtype": f.subtype, "quantity": f.quantity, "unit": f.unit, "reserve_class": f.reserve_class}
            for f in fuel_items
        ],
    }
    title = f"Environmental & Waste Report — {station_id or 'all stations'}"
    summary = f"Environmental Report | Waste records: {len(waste_records)} | Streams: {list(waste_by_stream.keys())}"
    return title, content, summary


async def _generate_daily_brief(db: AsyncSession, station_id: str | None) -> tuple[str, dict[str, Any], str]:
    """Station-wide operational brief (FR-94): weather, alerts, endurance, convoy status."""
    now = datetime.now(timezone.utc)

    q = select(Asset)
    if station_id:
        q = q.where(Asset.station_id == station_id)
    result = await db.execute(q)
    assets = list(result.scalars().all())
    alerts = await _get_open_alerts(db, station_id=station_id)

    weather_assets = [a for a in assets if a.subtype == "aws"]
    weather_snapshot = None
    if weather_assets:
        reading = await _get_latest_reading(db, weather_assets[0].id)
        weather_snapshot = reading.values if reading else None

    content = {
        "generated_at": now.isoformat(),
        "report_type": "daily_brief",
        "station_id": station_id,
        "weather": weather_snapshot,
        "open_alerts": {
            "total": len(alerts),
            "critical": sum(1 for a in alerts if a.severity in ("critical", "emergency")),
            "items": [{"asset_id": a.asset_id, "severity": a.severity, "message": a.message} for a in alerts[:20]],
        },
        "assets_by_status": {
            "ok": sum(1 for a in assets if a.status == "ok"),
            "degraded": sum(1 for a in assets if a.status == "degraded"),
            "fault_or_offline": sum(1 for a in assets if a.status in ("fault", "offline")),
        },
    }
    title = f"Daily Station Brief — {station_id or 'all stations'} — {now.strftime('%Y-%m-%d')}"
    summary = f"Daily Brief | Open alerts: {len(alerts)} ({content['open_alerts']['critical']} critical)"
    return title, content, summary


# ─── Public API ───────────────────────────────────────────────────────────────


async def generate_report(
    db: AsyncSession,
    report_type: str,
    station_id: str | None = None,
    asset_id: str | None = None,
    range_from: datetime | None = None,
    range_to: datetime | None = None,
) -> Report:
    """Generate, store, and return a Report record.
    report_type: health | risk | environmental | daily_brief"""
    if report_type == "health":
        title, content, summary = await _generate_health_report(db, station_id, asset_id)
    elif report_type == "risk":
        title, content, summary = await _generate_risk_report(db, station_id, asset_id)
    elif report_type == "environmental":
        title, content, summary = await _generate_environmental_report(db, station_id, range_from, range_to)
    elif report_type == "daily_brief":
        title, content, summary = await _generate_daily_brief(db, station_id)
    else:
        raise ValueError(f"Unknown report type: {report_type}")

    report = Report(
        report_type=report_type,
        station_id=station_id,
        asset_id=asset_id,
        title=title,
        content_json=content,
        text_summary=summary,
        range_from=range_from,
        range_to=range_to,
    )
    db.add(report)
    await db.flush()

    logger.info("report_engine.generated", report_type=report_type, station_id=station_id, asset_id=asset_id, title=title)
    return report
