"""
Router: Simulation & What-If endpoints (FR-82…88).
GET  /scenarios/presets
POST /scenarios
GET  /scenarios?station=
GET  /scenarios/{id}
GET  /scenarios/compare?ids=
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.postgres import get_db
from backend.dependencies import require_bearer
from backend.models.tables import InventoryItem, Scenario, Station
from backend.schemas.schemas import RunScenarioRequest, ScenarioDetail
from backend.services import scenario_engine
from backend.websocket.manager import ws_manager

router = APIRouter(tags=["Scenarios"])


@router.get("/scenarios/presets", dependencies=[Depends(require_bearer)], operation_id="list_scenario_presets")
async def list_scenario_presets() -> dict:
    return {name: cfg["label"] for name, cfg in scenario_engine.PRESET_DEFAULTS.items()}


async def _build_context(db: AsyncSession, station_id: str) -> dict:
    station = await db.get(Station, station_id)
    headcount = (station.winter_capacity if station else None) or 25

    fuel_result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.station_id == station_id, InventoryItem.kind == "fuel", InventoryItem.reserve_class == "routine"
        )
    )
    fuel_liters = sum((i.quantity for i in fuel_result.scalars().all()), 0.0)

    food_result = await db.execute(select(InventoryItem).where(InventoryItem.station_id == station_id, InventoryItem.kind == "food"))
    food_items = list(food_result.scalars().all())
    # Rough days-of-food: treat each food item's quantity as person-days if unit is
    # already "person_days", otherwise assume 1 unit ~= 1 person-day as a fallback.
    food_days_available = sum((i.quantity for i in food_items), 0.0) or (headcount * 365 * 2)

    return {
        "headcount": headcount,
        "fuel_liters": fuel_liters or 500_000.0,
        "food_days_available": food_days_available,
        "base_fuel_burn_lph": 27.0,
        "isolation_days_remaining": 150.0,
    }


@router.post(
    "/scenarios", response_model=ScenarioDetail, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_bearer)],
    operation_id="run_scenario",
)
async def run_scenario(body: RunScenarioRequest, db: AsyncSession = Depends(get_db)) -> ScenarioDetail:
    """Run a what-if scenario. Never writes live state — results are always
    projections (FR-87)."""
    inputs = dict(body.inputs)
    if body.preset:
        preset_inputs = scenario_engine.preset_inputs(body.preset)
        preset_inputs.update(inputs)
        inputs = preset_inputs

    context = await _build_context(db, body.station_id)
    outputs = scenario_engine.run_scenario(horizon_days=body.horizon_days, inputs=inputs, context=context)

    scenario = Scenario(
        station_id=body.station_id,
        name=body.name,
        preset=body.preset,
        horizon_days=body.horizon_days,
        inputs=inputs,
        status="completed",
        outputs=outputs,
        fuel_endurance_days=outputs["fuel_endurance_days"],
        food_endurance_days=outputs["food_endurance_days"],
        survivability_verdict=outputs["survivability_verdict"],
        first_failure_at_day=outputs["first_failure_at_day"],
        first_failure_cause=outputs["first_failure_cause"],
        cost_inr=outputs["cost_inr"]["total"],
        carbon_kg_co2e=outputs["carbon_kg_co2e"],
        created_by=body.created_by,
        completed_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(scenario)
    await db.flush()

    await ws_manager.broadcast_scenario_result(body.station_id, {"scenario_id": scenario.id, "verdict": scenario.survivability_verdict})
    return ScenarioDetail.model_validate(scenario)


@router.get("/scenarios", response_model=list[ScenarioDetail], dependencies=[Depends(require_bearer)], operation_id="list_scenarios")
async def list_scenarios(station: str | None = Query(default=None), db: AsyncSession = Depends(get_db)) -> list[ScenarioDetail]:
    q = select(Scenario)
    if station:
        q = q.where(Scenario.station_id == station)
    q = q.order_by(Scenario.created_at.desc()).limit(100)
    result = await db.execute(q)
    return [ScenarioDetail.model_validate(s) for s in result.scalars().all()]


@router.get("/scenarios/compare", response_model=list[ScenarioDetail], dependencies=[Depends(require_bearer)], operation_id="compare_scenarios")
async def compare_scenarios(ids: str = Query(..., description="Comma-separated scenario ids"), db: AsyncSession = Depends(get_db)) -> list[ScenarioDetail]:
    id_list = [i.strip() for i in ids.split(",") if i.strip()]
    result = await db.execute(select(Scenario).where(Scenario.id.in_(id_list)))
    return [ScenarioDetail.model_validate(s) for s in result.scalars().all()]


@router.get("/scenarios/{scenario_id}", response_model=ScenarioDetail, dependencies=[Depends(require_bearer)], operation_id="get_scenario")
async def get_scenario(scenario_id: str, db: AsyncSession = Depends(get_db)) -> ScenarioDetail:
    scenario = await db.get(Scenario, scenario_id)
    if not scenario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    return ScenarioDetail.model_validate(scenario)
