"""
Router: Predictive / Risk / Diagnosis endpoints (FR-72…81).
GET  /analytics/risk?station=
POST /analytics/diagnose
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.postgres import get_db
from backend.dependencies import require_bearer
from backend.models.tables import Alert, Asset, InventoryItem, RiskCell, Station
from backend.schemas.schemas import DiagnoseRequest, DiagnoseResponse, RiskCellDetail
from backend.services import diagnosis_engine, risk_engine

router = APIRouter(prefix="/analytics", tags=["Predictive & Risk"])


@router.get("/risk", response_model=list[RiskCellDetail], dependencies=[Depends(require_bearer)], operation_id="get_risk_heatmap")
async def get_risk_heatmap(station: str, db: AsyncSession = Depends(get_db)) -> list[RiskCellDetail]:
    """
    Compute (and persist) the Antarctic Risk Heatmap for one station — one
    cell per subsystem, each fully explainable (FR-75…77). Recomputed on
    every call rather than cached, since the underlying inputs (alerts,
    fuel/food inventory) change continuously and the compute is cheap.
    """
    if not await db.get(Station, station):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Station not found")

    assets_result = await db.execute(select(Asset).where(Asset.station_id == station))
    assets = list(assets_result.scalars().all())
    alerts_result = await db.execute(select(Alert).where(Alert.station_id == station, Alert.state == "open"))
    open_alerts = list(alerts_result.scalars().all())

    fuel_result = await db.execute(
        select(InventoryItem).where(InventoryItem.station_id == station, InventoryItem.kind == "fuel", InventoryItem.reserve_class == "routine")
    )
    fuel_liters = sum((i.quantity for i in fuel_result.scalars().all()), 0.0) or 500_000.0
    isolation_remaining_days = 150.0
    fuel_endurance_days = fuel_liters / (27.0 * 24.0)

    weather_asset_result = await db.execute(select(Asset).where(Asset.station_id == station, Asset.subtype == "aws"))
    weather_assets = list(weather_asset_result.scalars().all())
    weather_severity_score = 30.0
    if weather_assets and weather_assets[0].primary_value is not None and (weather_assets[0].primary_unit or "").lower() in ("m/s", "ms"):
        weather_severity_score = min(max((weather_assets[0].primary_value - 5) * 8, 0.0), 100.0)

    medical_gap_score = 60.0 if station == "maitri" else 20.0  # Maitri lacks anaesthesia support (FR-76)
    medical_evidence = (
        "Maitri Hospital has no anaesthetic support for spinal/general anaesthesia"
        if station == "maitri"
        else "Bharati medical room has an anaesthesia machine (Boyle's apparatus)"
    )

    cells: list[RiskCellDetail] = []
    subsystems = sorted({a.category for a in assets}) or ["power", "logistics", "instrument"]
    for subsystem in subsystems:
        subsystem_assets = [a for a in assets if a.category == subsystem]
        subsystem_alerts = [a for a in open_alerts if a.asset_id in {x.id for x in subsystem_assets}]
        crit = sum(1 for a in subsystem_alerts if a.severity in ("critical", "emergency"))
        equipment_failure_pct = min(20.0 + crit * 25.0, 100.0)

        cell = risk_engine.compute_risk_cell(
            equipment_failure_prob_pct=equipment_failure_pct,
            equipment_evidence=f"{crit} open critical/emergency alert(s) among {len(subsystem_assets)} {subsystem} asset(s)",
            consumable_endurance_days=fuel_endurance_days if subsystem == "power" else isolation_remaining_days + 30,
            isolation_remaining_days=isolation_remaining_days,
            consumable_evidence=f"Fuel endurance ~{fuel_endurance_days:.0f}d" if subsystem == "power" else "",
            weather_severity_score=weather_severity_score,
            weather_evidence="Latest AWS wind-speed reading" if weather_assets else "No AWS reading available — using baseline",
            isolation_evidence="",
            medical_gap_score=medical_gap_score if subsystem == "medical" else medical_gap_score * 0.3,
            medical_evidence=medical_evidence,
        )
        row = RiskCell(
            station_id=station, zone_id=None, subsystem=subsystem, score=cell["score"], factors=cell["factors"],
            computed_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        db.add(row)
        await db.flush()
        cells.append(RiskCellDetail.model_validate(row))

    return cells


@router.post("/diagnose", response_model=DiagnoseResponse, dependencies=[Depends(require_bearer)], operation_id="diagnose_fault")
async def diagnose_fault(body: DiagnoseRequest, db: AsyncSession = Depends(get_db)) -> DiagnoseResponse:
    """Guided diagnosis (FR-78…80): ranked probable causes with evidence and
    a recommended check sequence for an asset category/subtype or a
    specific asset/alert."""
    category, subtype = body.category, body.subtype
    if body.asset_id:
        asset = await db.get(Asset, body.asset_id)
        if asset:
            category, subtype = asset.category, asset.subtype

    result = diagnosis_engine.diagnose(category, subtype, body.observed_evidence)
    return DiagnoseResponse(**result)
