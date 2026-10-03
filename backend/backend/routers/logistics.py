"""
Router: Energy & Logistics Supply Chain endpoints (FR-26…43).
GET  /inventory?station=&kind=
POST /inventory         (create a stock line by hand)
POST /inventory/{id}/count
GET  /logistics/endurance?station=
GET  /convoys           POST /convoys           POST /convoys/{id}/assign
GET  /vehicles?station=
GET  /waste?station=&from=&to=      POST /waste
GET  /advisories?station=&state=    POST /advisories/{id}/accept|reject
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database.postgres import get_db
from backend.dependencies import require_bearer
from backend.models.tables import Advisory, Asset, Convoy, ConvoyAssignment, InventoryItem, WasteRecord
from backend.schemas.schemas import (
    AdvisoryDetail,
    AssignConvoyRequest,
    CreateInventoryItemRequest,
    ConvoyDetail,
    CreateConvoyRequest,
    CreateWasteRecordRequest,
    DecideAdvisoryRequest,
    InventoryCountRequest,
    InventoryItemDetail,
    WasteRecordDetail,
)
from backend.services import audit_engine

router = APIRouter(tags=["Logistics"])


# ─── Inventory (fuel / food / spares / waste stock) ─────────────────────────


@router.get("/inventory", response_model=list[InventoryItemDetail], dependencies=[Depends(require_bearer)], operation_id="list_inventory")
async def list_inventory(station: str | None = Query(default=None), kind: str | None = Query(default=None), db: AsyncSession = Depends(get_db)) -> list[InventoryItemDetail]:
    q = select(InventoryItem)
    if station:
        q = q.where(InventoryItem.station_id == station)
    if kind:
        q = q.where(InventoryItem.kind == kind)
    result = await db.execute(q)
    return [InventoryItemDetail.model_validate(i) for i in result.scalars().all()]


@router.post(
    "/inventory",
    response_model=InventoryItemDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_bearer)],
    operation_id="create_inventory_item",
)
async def create_inventory_item(body: CreateInventoryItemRequest, db: AsyncSession = Depends(get_db)) -> InventoryItemDetail:
    """Create a stock line by hand — logistics inventory is entered by people, not sensors."""
    if body.kind not in {"fuel", "food", "spare", "waste"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="kind must be fuel, food, spare or waste")
    slug = "".join(c if c.isalnum() else "-" for c in body.name.lower()).strip("-")[:60] or "item"
    item = InventoryItem(
        id=f"{body.station_id}-inventory-{body.kind}-{slug}-{int(datetime.now(timezone.utc).timestamp())}",
        station_id=body.station_id,
        kind=body.kind,
        subtype=body.subtype,
        name=body.name,
        quantity=body.quantity,
        unit=body.unit,
        capacity=body.capacity,
        reserve_class=body.reserve_class,
        last_checked=datetime.now(timezone.utc).replace(tzinfo=None),
        checked_by=body.checked_by,
        provenance="unverified",
    )
    db.add(item)
    await db.flush()
    await audit_engine.record(db, user_id=body.checked_by, role=None, station_id=item.station_id, action="inventory.create", resource=item.id, detail={"quantity": body.quantity})
    return InventoryItemDetail.model_validate(item)


@router.post(
    "/inventory/{item_id}/count",
    response_model=InventoryItemDetail,
    dependencies=[Depends(require_bearer)],
    operation_id="count_inventory_item",
)
async def count_inventory_item(item_id: str, body: InventoryCountRequest, db: AsyncSession = Depends(get_db)) -> InventoryItemDetail:
    """Record a manual stock check (dip reading, freezer count...) — FR-27 for inventory."""
    item = await db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    item.quantity = body.quantity
    item.last_checked = datetime.now(timezone.utc).replace(tzinfo=None)
    item.checked_by = body.checked_by
    await db.flush()
    await audit_engine.record(db, user_id=body.checked_by, role=None, station_id=item.station_id, action="inventory.count", resource=item_id, detail={"quantity": body.quantity})
    return InventoryItemDetail.model_validate(item)


@router.get("/logistics/endurance", dependencies=[Depends(require_bearer)], operation_id="get_logistics_endurance")
async def get_logistics_endurance(station: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Days of fuel / food remaining vs the isolation window (FR-28, FR-38)."""
    fuel_result = await db.execute(
        select(InventoryItem).where(InventoryItem.station_id == station, InventoryItem.kind == "fuel", InventoryItem.reserve_class == "routine")
    )
    fuel_liters = sum((i.quantity for i in fuel_result.scalars().all()), 0.0)
    food_result = await db.execute(select(InventoryItem).where(InventoryItem.station_id == station, InventoryItem.kind == "food"))
    food_units = sum((i.quantity for i in food_result.scalars().all()), 0.0)

    base_burn_lph = 27.0
    fuel_days = round(fuel_liters / (base_burn_lph * 24.0), 1) if fuel_liters else 0.0
    return {
        "station_id": station,
        "fuel_liters_available": fuel_liters,
        "fuel_endurance_days": fuel_days,
        "food_units_available": food_units,
        "isolation_days_remaining": 150.0,
        "fuel_margin_ok": fuel_days >= 150.0,
    }


# ─── Vehicles (Asset category='vehicle') ────────────────────────────────────


@router.get("/vehicles", dependencies=[Depends(require_bearer)], operation_id="list_vehicles")
async def list_vehicles(station: str | None = Query(default=None), db: AsyncSession = Depends(get_db)) -> list[dict]:
    q = select(Asset).where(Asset.category == "vehicle")
    if station:
        q = q.where(Asset.station_id == station)
    result = await db.execute(q)
    return [
        {
            "id": a.id, "name": a.name, "subtype": a.subtype, "status": a.status,
            "spec": a.spec, "responsible_user": a.responsible_user,
        }
        for a in result.scalars().all()
    ]


# ─── Convoys (FR-34…36) ──────────────────────────────────────────────────────


@router.get("/convoys", response_model=list[ConvoyDetail], dependencies=[Depends(require_bearer)], operation_id="list_convoys")
async def list_convoys(station: str | None = Query(default=None), db: AsyncSession = Depends(get_db)) -> list[ConvoyDetail]:
    q = select(Convoy).options(selectinload(Convoy.assignments))
    if station:
        q = q.where(Convoy.station_id == station)
    result = await db.execute(q)
    return [ConvoyDetail.model_validate(c) for c in result.scalars().all()]


@router.post(
    "/convoys", response_model=ConvoyDetail, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_bearer)],
    operation_id="create_convoy",
)
async def create_convoy(body: CreateConvoyRequest, db: AsyncSession = Depends(get_db)) -> ConvoyDetail:
    convoy = Convoy(
        id=body.id, station_id=body.station_id, season=body.season, planned_start=body.planned_start,
        route_ref=body.route_ref, distance_km=body.distance_km, state="planned",
        medical_officer=body.medical_officer, fuel_planned_l=body.fuel_planned_l,
    )
    db.add(convoy)
    await db.flush()
    await db.refresh(convoy, attribute_names=["assignments"])
    return ConvoyDetail.model_validate(convoy)


@router.post(
    "/convoys/{convoy_id}/assign",
    response_model=ConvoyDetail,
    dependencies=[Depends(require_bearer)],
    operation_id="assign_convoy_member",
)
async def assign_convoy_member(convoy_id: str, body: AssignConvoyRequest, db: AsyncSession = Depends(get_db)) -> ConvoyDetail:
    result = await db.execute(select(Convoy).where(Convoy.id == convoy_id).options(selectinload(Convoy.assignments)))
    convoy = result.scalar_one_or_none()
    if not convoy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Convoy not found")

    if body.vehicle_asset_id:
        for existing in convoy.assignments:
            if existing.vehicle_asset_id == body.vehicle_asset_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vehicle already assigned to this convoy")  # FR-35

    assignment = ConvoyAssignment(convoy_id=convoy_id, member_name=body.member_name, vehicle_asset_id=body.vehicle_asset_id, equipment_charge=body.equipment_charge)
    db.add(assignment)
    await db.flush()
    await db.refresh(convoy, attribute_names=["assignments"])
    return ConvoyDetail.model_validate(convoy)


@router.patch("/convoys/{convoy_id}/depart", response_model=ConvoyDetail, dependencies=[Depends(require_bearer)], operation_id="depart_convoy")
async def depart_convoy(convoy_id: str, db: AsyncSession = Depends(get_db)) -> ConvoyDetail:
    """Blocks departure if the convoy has no medical officer or no ambulance
    escort among its assigned vehicles (FR-35)."""
    result = await db.execute(select(Convoy).where(Convoy.id == convoy_id).options(selectinload(Convoy.assignments)))
    convoy = result.scalar_one_or_none()
    if not convoy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Convoy not found")
    if not convoy.medical_officer:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Convoy has no medical officer assigned")

    vehicle_ids = [a.vehicle_asset_id for a in convoy.assignments if a.vehicle_asset_id]
    if vehicle_ids:
        assets_result = await db.execute(select(Asset).where(Asset.id.in_(vehicle_ids)))
        vehicles = list(assets_result.scalars().all())
        if not any(v.subtype == "ambulance" for v in vehicles):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Convoy has no ambulance escort")

    convoy.state = "underway"
    await db.flush()
    return ConvoyDetail.model_validate(convoy)


# ─── Waste (FR-42, FR-43) ────────────────────────────────────────────────────


@router.get("/waste", response_model=list[WasteRecordDetail], dependencies=[Depends(require_bearer)], operation_id="list_waste_records")
async def list_waste_records(
    station: str | None = Query(default=None), date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"), db: AsyncSession = Depends(get_db),
) -> list[WasteRecordDetail]:
    q = select(WasteRecord)
    if station:
        q = q.where(WasteRecord.station_id == station)
    if date_from:
        q = q.where(WasteRecord.processed_at >= date_from)
    if date_to:
        q = q.where(WasteRecord.processed_at <= date_to)
    result = await db.execute(q.order_by(WasteRecord.processed_at.desc()).limit(500))
    return [WasteRecordDetail.model_validate(w) for w in result.scalars().all()]


@router.post(
    "/waste", response_model=WasteRecordDetail, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_bearer)],
    operation_id="create_waste_record",
)
async def create_waste_record(body: CreateWasteRecordRequest, db: AsyncSession = Depends(get_db)) -> WasteRecordDetail:
    record = WasteRecord(**body.model_dump())
    db.add(record)
    await db.flush()
    return WasteRecordDetail.model_validate(record)


# ─── Advisories (FR-52, FR-53) ───────────────────────────────────────────────


@router.get("/advisories", response_model=list[AdvisoryDetail], dependencies=[Depends(require_bearer)], operation_id="list_advisories")
async def list_advisories(station: str | None = Query(default=None), advisory_state: str | None = Query(default=None, alias="state"), db: AsyncSession = Depends(get_db)) -> list[AdvisoryDetail]:
    q = select(Advisory)
    if station:
        q = q.where(Advisory.station_id == station)
    if advisory_state:
        q = q.where(Advisory.state == advisory_state)
    result = await db.execute(q.order_by(Advisory.created_at.desc()))
    return [AdvisoryDetail.model_validate(a) for a in result.scalars().all()]


@router.post("/advisories/{advisory_id}/accept", response_model=AdvisoryDetail, dependencies=[Depends(require_bearer)], operation_id="accept_advisory")
async def accept_advisory(advisory_id: str, body: DecideAdvisoryRequest, db: AsyncSession = Depends(get_db)) -> AdvisoryDetail:
    advisory = await db.get(Advisory, advisory_id)
    if not advisory:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Advisory not found")
    advisory.state = "accepted"
    advisory.decided_by = body.decided_by
    advisory.decided_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()
    await audit_engine.record(db, user_id=body.decided_by, role=None, station_id=advisory.station_id, action="advisory.accept", resource=advisory_id, detail=None)
    return AdvisoryDetail.model_validate(advisory)


@router.post("/advisories/{advisory_id}/reject", response_model=AdvisoryDetail, dependencies=[Depends(require_bearer)], operation_id="reject_advisory")
async def reject_advisory(advisory_id: str, body: DecideAdvisoryRequest, db: AsyncSession = Depends(get_db)) -> AdvisoryDetail:
    advisory = await db.get(Advisory, advisory_id)
    if not advisory:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Advisory not found")
    advisory.state = "rejected"
    advisory.decided_by = body.decided_by
    advisory.decided_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()
    return AdvisoryDetail.model_validate(advisory)
