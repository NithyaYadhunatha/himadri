"""
Router: Device agent endpoints — registration, identity, heartbeat.
POST /agent/register
GET  /agent/whoami
POST /agent/heartbeat
POST /agent/command-result
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.postgres import get_db
from backend.dependencies import require_api_key, require_api_key_rate_limited, require_bearer
from backend.models.tables import Asset, Command, slugify
from backend.schemas.schemas import (
    AlertSummary,
    CommandDelivery,
    CommandResultRequest,
    HeartbeatRequest,
    HeartbeatResponse,
    RegisterRequest,
    RegisterResponse,
    WhoAmIResponse,
)
from backend.services import alert_engine, command_engine, dependency_engine, ingest_engine, pending_commands
from backend.websocket.manager import ws_manager

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/agent", tags=["Device Agent"])


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_bearer)],
)
async def register_agent(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> RegisterResponse:
    """
    Admin-only: create a new asset record (called from the HIMADRI frontend's
    "Connect New Device" flow, not by the device agent itself — the agent
    never self-registers). Returns asset_id and api_key to paste into the
    device agent running against that instrument/sensor.
    """
    base_id = slugify(body.station_id, body.category, body.asset_name)
    asset_id = base_id
    suffix = 1
    while await db.get(Asset, asset_id):
        suffix += 1
        asset_id = f"{base_id}-{suffix}"

    api_key = str(uuid.uuid4())

    asset = Asset(
        id=asset_id,
        name=body.asset_name,
        station_id=body.station_id,
        zone_id=body.zone_id,
        category=body.category,
        subtype=body.subtype,
        manufacturer=body.manufacturer,
        spec=body.spec,
        controllable=body.controllable,
        life_safety=body.life_safety,
        status="offline",
        health_score=100.0,
        risk_score=0.0,
        api_key=api_key,
        approved=True,
        provenance="simulated",
        last_seen=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(asset)
    await db.flush()

    await dependency_engine.register_asset_in_graph(
        asset_id=asset_id,
        name=body.asset_name,
        category=body.category,
        station_id=body.station_id,
    )

    await ws_manager.broadcast_asset_registered(
        {"asset_id": asset_id, "name": body.asset_name, "category": body.category, "station_id": body.station_id}
    )

    logger.info("agent.registered", asset_id=asset_id, name=body.asset_name)
    return RegisterResponse(
        asset_id=asset_id,
        api_key=api_key,
        message=f"Asset '{body.asset_name}' registered. Store the api_key — it cannot be retrieved again.",
    )


@router.get("/whoami", response_model=WhoAmIResponse)
async def whoami(asset: Asset = Depends(require_api_key)) -> WhoAmIResponse:
    """Identify the device behind an X-API-Key — lets the device agent
    connect with just asset_id + api_key and learn its own identity."""
    return WhoAmIResponse(
        asset_id=asset.id,
        asset_name=asset.name,
        category=asset.category,
        subtype=asset.subtype,
        station_id=asset.station_id,
    )


@router.post("/heartbeat", response_model=HeartbeatResponse)
async def receive_heartbeat(
    body: HeartbeatRequest,
    asset: Asset = Depends(require_api_key_rate_limited),
    db: AsyncSession = Depends(get_db),
) -> HeartbeatResponse:
    """
    Accept a heartbeat from a device agent: stores the reading, evaluates
    alert rules, recomputes risk, updates the Neo4j graph, broadcasts
    WebSocket events, and returns open alerts + any queued command.

    The shared reading -> alert -> risk -> graph -> WS pipeline lives in
    backend/services/ingest_engine.py (also used by the MQTT listener,
    backend/services/mqtt_ingest.py) — this handler only resolves
    heartbeat-specific concerns: the simulation_active status override, the
    simulation-flag INFO alert, and pending-command delivery.
    """
    effective_status = "simulating" if body.simulation_active else body.status

    # Heartbeat-only: a demo-visible INFO notice while a device is running
    # an injected fault. Raised before ingest_reading() so it's already
    # `open` by the time that function queries open alerts for this asset —
    # matching the pre-refactor ordering exactly.
    sim_alerts = await alert_engine.evaluate_simulation_flag(db, asset, body.simulation_active, body.simulation_type)
    for alert in sim_alerts:
        await ws_manager.broadcast_alert_triggered(
            asset.id, {"id": alert.id, "severity": alert.severity, "category": alert.category, "message": alert.message}
        )

    result = await ingest_engine.ingest_reading(
        db,
        asset,
        values=body.reading.values,
        units=body.reading.units,
        source="simulated",
        status=effective_status,
        simulation_active=body.simulation_active,
        simulation_type=body.simulation_type,
    )

    active_alert_summaries = [
        AlertSummary(
            id=a.id,
            asset_id=a.asset_id,
            severity=a.severity,
            category=a.category,
            message=a.message,
            first_seen=a.first_seen,
            last_seen=a.last_seen,
            occurrences=a.occurrences,
            state=a.state,
        )
        for a in result.open_alerts
    ]

    stop_simulation = pending_commands.consume_stop_simulation(asset.id)

    pending_command = await command_engine.next_deliverable_command(db, asset.id)
    command_delivery = None
    if pending_command:
        command_delivery = CommandDelivery(
            command_id=pending_command.id, action=pending_command.action, payload=pending_command.payload
        )

    logger.debug(
        "heartbeat.received",
        asset_id=asset.id,
        status=effective_status,
        risk_score=result.risk_score,
        new_alerts=len(result.new_alerts) + len(sim_alerts),
    )

    return HeartbeatResponse(
        received=True,
        alerts=active_alert_summaries,
        stop_simulation=stop_simulation,
        pending_command=command_delivery,
    )


@router.post("/command-result")
async def report_command_result(
    body: CommandResultRequest,
    asset: Asset = Depends(require_api_key),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """The device agent's ack/apply round trip for a delivered command."""
    command = await db.get(Command, body.command_id)
    if not command or command.asset_id != asset.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Command not found for this asset")

    await command_engine.ack_command(db, command)
    if body.success:
        await command_engine.apply_command(db, command, body.result)
        await ws_manager.broadcast_command_updated(command.id, "applied")
    else:
        command.state = "failed"
        command.result = body.result
        await db.flush()
        await ws_manager.broadcast_command_updated(command.id, "failed")

    return {"received": True}
