"""
Router: Station, Zone, and Twin (2D floor-plan graph) endpoints.
GET /stations
GET /stations/{station_id}
GET /stations/{station_id}/zones
GET /stations/{station_id}/summary
GET /stations/{station_id}/twin-graph
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.postgres import get_db
from backend.dependencies import require_bearer
from backend.models.tables import Alert, Asset, Station, Zone
from backend.schemas.schemas import FullGraph, GraphAssetNode, GraphEdge, StationDetail, TwinSummary, ZoneDetail
from backend.services.dependency_engine import get_full_twin_graph

router = APIRouter(tags=["Stations & Twin"])


@router.get("/stations", response_model=list[StationDetail], dependencies=[Depends(require_bearer)], operation_id="list_stations")
async def list_stations(db: AsyncSession = Depends(get_db)) -> list[StationDetail]:
    result = await db.execute(select(Station))
    return [StationDetail.model_validate(s) for s in result.scalars().all()]


@router.get(
    "/stations/{station_id}", response_model=StationDetail, dependencies=[Depends(require_bearer)], operation_id="get_station"
)
async def get_station(station_id: str, db: AsyncSession = Depends(get_db)) -> StationDetail:
    station = await db.get(Station, station_id)
    if not station:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Station not found")
    return StationDetail.model_validate(station)


@router.get(
    "/stations/{station_id}/zones",
    response_model=list[ZoneDetail],
    dependencies=[Depends(require_bearer)],
    operation_id="list_station_zones",
)
async def list_station_zones(station_id: str, db: AsyncSession = Depends(get_db)) -> list[ZoneDetail]:
    result = await db.execute(select(Zone).where(Zone.station_id == station_id))
    return [ZoneDetail.model_validate(z) for z in result.scalars().all()]


@router.get(
    "/stations/{station_id}/summary",
    response_model=TwinSummary,
    dependencies=[Depends(require_bearer)],
    operation_id="get_station_summary",
)
async def get_station_summary(station_id: str, db: AsyncSession = Depends(get_db)) -> TwinSummary:
    """Overview-dashboard tile data: asset status mix + open alert counts."""
    assets_result = await db.execute(select(Asset).where(Asset.station_id == station_id))
    assets = list(assets_result.scalars().all())

    alerts_result = await db.execute(select(Alert).where(Alert.station_id == station_id, Alert.state == "open"))
    open_alerts = list(alerts_result.scalars().all())

    total = len(assets)
    return TwinSummary(
        station_id=station_id,
        total_assets=total,
        ok_assets=sum(1 for a in assets if a.status == "ok"),
        degraded_assets=sum(1 for a in assets if a.status == "degraded"),
        fault_or_offline_assets=sum(1 for a in assets if a.status in ("fault", "offline")),
        avg_health_score=round(sum(a.health_score for a in assets) / max(total, 1), 2),
        open_alerts=len(open_alerts),
        critical_alerts=sum(1 for a in open_alerts if a.severity in ("critical", "emergency")),
    )


@router.get(
    "/stations/{station_id}/twin-graph",
    response_model=FullGraph,
    dependencies=[Depends(require_bearer)],
    operation_id="get_station_twin_graph",
)
async def get_station_twin_graph(station_id: str) -> FullGraph:
    """Asset dependency graph for one station — backs the 2D twin / floor
    plan view and overlay modes. A Unity WebGL 3D twin (built separately)
    will consume the same station/zone/asset data via GET /assets and
    GET /stations/{id}/zones rather than this graph endpoint."""
    raw = await get_full_twin_graph(station_id)
    return FullGraph(
        nodes=[GraphAssetNode(**n) for n in raw["nodes"]],
        edges=[GraphEdge(**e) for e in raw["edges"]],
    )
