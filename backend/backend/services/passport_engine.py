"""
Asset Passport — QR Passport for Historical and Current Data (FR-95…98).

The backend's job is to assemble the passport payload; the physical QR code
itself is rendered client-side (the QR payload is just this asset's stable
id/URL — no server-side image rendering needed, keeping this dependency-free).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.tables import Asset, MaintenanceEvent, Reading


async def build_passport(db: AsyncSession, asset: Asset) -> dict[str, Any]:
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=30)
    readings_result = await db.execute(
        select(Reading)
        .where(Reading.asset_id == asset.id, Reading.collected_at >= cutoff)
        .order_by(Reading.collected_at.desc())
        .limit(500)
    )
    readings = list(readings_result.scalars().all())

    maintenance_result = await db.execute(
        select(MaintenanceEvent).where(MaintenanceEvent.asset_id == asset.id).order_by(MaintenanceEvent.logged_at.desc())
    )
    maintenance = list(maintenance_result.scalars().all())

    return {
        "identity": {
            "id": asset.id,
            "name": asset.name,
            "station_id": asset.station_id,
            "zone_id": asset.zone_id,
            "category": asset.category,
            "subtype": asset.subtype,
            "manufacturer": asset.manufacturer,
            "spec": asset.spec,
            "provenance": asset.provenance,
        },
        "current_state": {
            "status": asset.status,
            "health_score": asset.health_score,
            "risk_score": asset.risk_score,
            "primary_value": asset.primary_value,
            "primary_unit": asset.primary_unit,
            "last_seen": asset.last_seen.isoformat() if asset.last_seen else None,
        },
        "telemetry_history_30d": [
            {
                "values": r.values,
                "source": r.source,
                "entered_by": r.entered_by,
                "collected_at": r.collected_at.isoformat(),
            }
            for r in readings
        ],
        "maintenance_and_faults": [
            {
                "event_type": m.event_type,
                "description": m.description,
                "fault_code": m.fault_code,
                "logged_by": m.logged_by,
                "logged_at": m.logged_at.isoformat(),
            }
            for m in maintenance
        ],
        "responsible_user": asset.responsible_user,
        "controllable": asset.controllable,
        "life_safety": asset.life_safety,
    }


async def log_maintenance_event(
    db: AsyncSession,
    asset: Asset,
    *,
    event_type: str,
    description: str,
    fault_code: str | None,
    logged_by: str | None,
) -> MaintenanceEvent:
    event = MaintenanceEvent(
        asset_id=asset.id,
        event_type=event_type,
        description=description,
        fault_code=fault_code,
        logged_by=logged_by,
    )
    db.add(event)
    await db.flush()
    return event
