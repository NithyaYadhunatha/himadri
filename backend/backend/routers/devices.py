"""
Router: Device Scalability endpoints (FR-99…102).
GET  /devices?pending=true
POST /devices/manifest
POST /devices/{asset_id}/approve
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.postgres import get_db
from backend.dependencies import require_bearer
from backend.models.tables import Asset, AlertRule, new_uuid
from backend.schemas.schemas import DeviceManifest, PendingDeviceItem
from backend.services import audit_engine

router = APIRouter(prefix="/devices", tags=["Device Scalability"])


@router.get("", response_model=list[PendingDeviceItem], dependencies=[Depends(require_bearer)], operation_id="list_devices")
async def list_devices(pending: bool = Query(default=False), db: AsyncSession = Depends(get_db)) -> list[PendingDeviceItem]:
    q = select(Asset)
    if pending:
        q = q.where(Asset.approved == False)  # noqa: E712
    result = await db.execute(q)
    return [PendingDeviceItem(
        asset_id=asset.id,
        asset_name=asset.name,
        station_id=asset.station_id,
        category=asset.category,
        approved=asset.approved,
        manifest=asset.manifest,
        last_seen=asset.last_seen,
    ) for asset in result.scalars().all()]


@router.post(
    "/manifest",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_bearer)],
    operation_id="register_device_manifest",
)
async def register_device_manifest(body: DeviceManifest, db: AsyncSession = Depends(get_db)) -> dict:
    """
    Self-describing device manifest (FR-100): auto-creates default alert
    rules for each declared series against the existing asset. Adding a new
    device is registration + a manifest — no code change, no redeploy
    (FR-99).
    """
    asset = await db.get(Asset, body.asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found — register the asset first, then post its manifest")

    asset.manifest = body.model_dump()
    if not asset.primary_series and body.series:
        asset.primary_series = body.series[0].name

    created_rules = 0
    for series in body.series:
        for rule_spec in series.default_rules:
            rule = AlertRule(
                id=new_uuid(), station_id=None, asset_id=asset.id, series_key=series.name,
                type=rule_spec.type, params=rule_spec.params, severity=rule_spec.severity,
                category=rule_spec.category, auto_generated=True,
            )
            db.add(rule)
            created_rules += 1

    await db.flush()
    await audit_engine.record(db, user_id=None, role=None, station_id=asset.station_id, action="device.manifest_registered", resource=asset.id, detail={"series_count": len(body.series), "rules_created": created_rules})
    return {"asset_id": asset.id, "series_registered": len(body.series), "alert_rules_created": created_rules}


@router.post("/{asset_id}/approve", dependencies=[Depends(require_bearer)], operation_id="approve_device")
async def approve_device(asset_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Move a device out of the pending-approval queue (FR-101)."""
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    asset.approved = True
    await db.flush()
    await audit_engine.record(db, user_id=None, role=None, station_id=asset.station_id, action="device.approved", resource=asset_id, detail=None)
    return {"asset_id": asset_id, "approved": True}
