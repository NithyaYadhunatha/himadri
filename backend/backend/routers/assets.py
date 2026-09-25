"""
Router: Asset endpoints.
GET    /assets?station=&category=&zone=&status=
GET    /assets/{asset_id}
GET    /assets/{asset_id}/credentials
GET    /assets/{asset_id}/readings
POST   /assets/{asset_id}/readings/manual
GET    /assets/{asset_id}/dependencies
GET    /assets/{asset_id}/blast-radius
GET    /assets/{asset_id}/alerts
GET    /assets/{asset_id}/passport
POST   /assets/{asset_id}/maintenance
POST   /assets/{asset_id}/stop-simulation
POST   /assets/{asset_id}/edges
DELETE /assets/{asset_id}/edges/{target_id}
DELETE /assets/{asset_id}
POST   /assets (admin-created, non-device asset e.g. a structure/zone fixture)
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.neo4j_client import InvalidRelationshipType
from backend.database.postgres import get_db
from backend.dependencies import require_bearer
from backend.models.tables import Alert, Asset, Reading, new_uuid, slugify
from backend.schemas.schemas import (
    AddEdgeRequest,
    AddEdgeResponse,
    AlertDetail,
    AssetCredentials,
    AssetDetail,
    AssetListItem,
    BlastRadius,
    CreateAssetRequest,
    DependencyAsset,
    LogMaintenanceRequest,
    ManualReadingRequest,
    MaintenanceEventDetail,
    ReadingRecord,
    StopSimulationResponse,
)
from backend.services import dependency_engine, passport_engine, pending_commands

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["Assets"])


@router.get("/assets", response_model=list[AssetListItem], dependencies=[Depends(require_bearer)], operation_id="list_assets")
async def list_assets(
    station: str | None = Query(default=None),
    category: str | None = Query(default=None),
    zone: str | None = Query(default=None),
    asset_status: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
) -> list[AssetListItem]:
    """Return assets, optionally filtered by station/category/zone/status."""
    q = select(Asset)
    if station:
        q = q.where(Asset.station_id == station)
    if category:
        q = q.where(Asset.category == category)
    if zone:
        q = q.where(Asset.zone_id == zone)
    if asset_status:
        q = q.where(Asset.status == asset_status)
    q = q.order_by(Asset.registered_at.desc())

    result = await db.execute(q)
    assets = result.scalars().all()
    return [AssetListItem.model_validate(a) for a in assets]


@router.post(
    "/assets",
    response_model=AssetDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_bearer)],
    operation_id="create_asset",
)
async def create_asset(body: CreateAssetRequest, db: AsyncSession = Depends(get_db)) -> AssetDetail:
    """Admin-created asset (e.g. a structural fixture with no device attached
    yet). Devices normally arrive via POST /agent/register instead."""
    base_id = slugify(body.station_id, body.category, body.name)
    asset_id = base_id
    suffix = 1
    while await db.get(Asset, asset_id):
        suffix += 1
        asset_id = f"{base_id}-{suffix}"

    asset = Asset(
        id=asset_id,
        name=body.name,
        station_id=body.station_id,
        zone_id=body.zone_id,
        category=body.category,
        subtype=body.subtype,
        manufacturer=body.manufacturer,
        spec=body.spec,
        controllable=body.controllable,
        life_safety=body.life_safety,
        status="offline",
        api_key=new_uuid(),
        provenance=body.provenance,
    )
    db.add(asset)
    await db.flush()
    await dependency_engine.register_asset_in_graph(
        asset_id=asset_id, name=body.name, category=body.category, station_id=body.station_id
    )
    return AssetDetail.model_validate(asset)


@router.get("/assets/{asset_id}", response_model=AssetDetail, dependencies=[Depends(require_bearer)], operation_id="get_asset", include_in_schema=False)
async def get_asset(asset_id: str, db: AsyncSession = Depends(get_db)) -> AssetDetail:
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return AssetDetail.model_validate(asset)


@router.get(
    "/assets/{asset_id}/credentials",
    response_model=AssetCredentials,
    dependencies=[Depends(require_bearer)],
    operation_id="get_asset_credentials",
)
async def get_asset_credentials(asset_id: str, db: AsyncSession = Depends(get_db)) -> AssetCredentials:
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return AssetCredentials(asset_id=asset.id, api_key=asset.api_key, asset_name=asset.name)


@router.get(
    "/assets/{asset_id}/readings",
    response_model=list[ReadingRecord],
    dependencies=[Depends(require_bearer)],
    operation_id="get_asset_readings",
)
async def get_asset_readings(
    asset_id: str, limit: int = Query(default=100, ge=1, le=2000), db: AsyncSession = Depends(get_db)
) -> list[ReadingRecord]:
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    result = await db.execute(
        select(Reading).where(Reading.asset_id == asset_id).order_by(Reading.collected_at.desc()).limit(limit)
    )
    return [ReadingRecord.model_validate(r) for r in result.scalars().all()]


@router.post(
    "/assets/{asset_id}/readings/manual",
    response_model=ReadingRecord,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_bearer)],
    operation_id="log_manual_reading",
)
async def log_manual_reading(asset_id: str, body: ManualReadingRequest, db: AsyncSession = Depends(get_db)) -> ReadingRecord:
    """Log a manually-entered reading (fuel dip, freezer check...) — FR-27.
    Distinguished from sensor/simulated readings via source='manual' and
    entered_by, and audited by the caller (see routers/audit.py usage)."""
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    reading = Reading(
        asset_id=asset_id, values=body.values, units=body.units, source="manual", entered_by=body.entered_by
    )
    db.add(reading)
    if asset.primary_series and asset.primary_series in body.values:
        asset.primary_value = body.values[asset.primary_series]
    await db.flush()
    return ReadingRecord.model_validate(reading)


@router.get(
    "/assets/{asset_id}/dependencies",
    response_model=list[DependencyAsset],
    dependencies=[Depends(require_bearer)],
    operation_id="get_asset_dependencies",
)
async def get_asset_dependencies(asset_id: str, db: AsyncSession = Depends(get_db)) -> list[DependencyAsset]:
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return await dependency_engine.get_asset_dependencies(asset_id)


@router.get(
    "/assets/{asset_id}/blast-radius",
    response_model=BlastRadius,
    dependencies=[Depends(require_bearer)],
    operation_id="get_blast_radius",
)
async def get_blast_radius(asset_id: str, db: AsyncSession = Depends(get_db)) -> BlastRadius:
    """What would be impacted if this asset fails — backs the What-If
    Scenario engine and the Antarctic Risk Heatmap's evidence."""
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return await dependency_engine.get_blast_radius(asset_id)


@router.get(
    "/assets/{asset_id}/alerts",
    response_model=list[AlertDetail],
    dependencies=[Depends(require_bearer)],
    operation_id="get_asset_alerts",
)
async def get_asset_alerts(
    asset_id: str, open_only: bool = Query(default=False), db: AsyncSession = Depends(get_db)
) -> list[AlertDetail]:
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    q = select(Alert).where(Alert.asset_id == asset_id)
    if open_only:
        q = q.where(Alert.state == "open")
    q = q.order_by(Alert.first_seen.desc()).limit(100)
    result = await db.execute(q)
    return [AlertDetail.model_validate(a) for a in result.scalars().all()]


@router.get(
    "/assets/{asset_id}/passport",
    dependencies=[Depends(require_bearer)],
    operation_id="get_asset_passport",
)
async def get_asset_passport(asset_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Full QR Asset Passport payload (FR-95…98) — identity, current state,
    30-day telemetry history, maintenance/fault log, provenance."""
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return await passport_engine.build_passport(db, asset)


@router.post(
    "/assets/{asset_id}/maintenance",
    response_model=MaintenanceEventDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_bearer)],
    operation_id="log_maintenance_event",
)
async def log_maintenance_event(
    asset_id: str, body: LogMaintenanceRequest, db: AsyncSession = Depends(get_db)
) -> MaintenanceEventDetail:
    """Log a maintenance/fault event from the passport page — works from a
    phone against the station node, FR-97."""
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    event = await passport_engine.log_maintenance_event(
        db, asset, event_type=body.event_type, description=body.description, fault_code=body.fault_code, logged_by=body.logged_by
    )
    return MaintenanceEventDetail.model_validate(event)


@router.post(
    "/assets/{asset_id}/stop-simulation",
    response_model=StopSimulationResponse,
    dependencies=[Depends(require_bearer)],
    operation_id="stop_asset_simulation",
)
async def stop_asset_simulation(asset_id: str, db: AsyncSession = Depends(get_db)) -> StopSimulationResponse:
    """Queue a stop-fault command for this asset's device agent, relayed on
    its next heartbeat (see services/pending_commands.py)."""
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    pending_commands.queue_stop_simulation(asset_id)
    logger.info("asset.stop_simulation_queued", asset_id=asset_id)
    return StopSimulationResponse(asset_id=asset_id, queued=True)


@router.delete(
    "/assets/{asset_id}",
    response_model=None,
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_bearer)],
    operation_id="delete_asset",
)
async def delete_asset(asset_id: str, db: AsyncSession = Depends(get_db)) -> None:
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    await dependency_engine.delete_asset_from_graph(asset_id)
    await db.delete(asset)
    await db.commit()
    logger.info("asset.deleted", asset_id=asset_id)


@router.post(
    "/assets/{asset_id}/edges",
    response_model=AddEdgeResponse,
    dependencies=[Depends(require_bearer)],
    operation_id="add_asset_edge",
)
async def add_asset_edge(asset_id: str, body: AddEdgeRequest, db: AsyncSession = Depends(get_db)) -> AddEdgeResponse:
    """Add a directed dependency-graph edge asset_id -[rel_type]-> target_id
    (e.g. a heater DEPENDS_ON a generator)."""
    if asset_id == body.target_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An asset cannot depend on itself")
    if not await db.get(Asset, asset_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source asset not found")
    if not await db.get(Asset, body.target_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target asset not found")

    try:
        await dependency_engine.add_relationship(asset_id, body.target_id, body.rel_type)
    except InvalidRelationshipType as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    logger.info("asset.edge_added", source_id=asset_id, target_id=body.target_id, rel_type=body.rel_type)
    return AddEdgeResponse(source_id=asset_id, target_id=body.target_id, rel_type=body.rel_type)


@router.delete(
    "/assets/{asset_id}/edges/{target_id}",
    response_model=None,
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_bearer)],
    operation_id="remove_asset_edge",
)
async def remove_asset_edge(asset_id: str, target_id: str) -> None:
    await dependency_engine.remove_relationship(asset_id, target_id)
    logger.info("asset.edge_removed", source_id=asset_id, target_id=target_id)
