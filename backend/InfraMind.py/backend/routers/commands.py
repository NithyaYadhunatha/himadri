"""
Router: Remote Control / actuation endpoints (FR-9…14, C4).
POST /commands
POST /commands/{id}/approve
POST /commands/{id}/cancel
GET  /commands?station=&state=
GET  /commands/{id}
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.postgres import get_db
from backend.dependencies import require_bearer
from backend.models.tables import Asset, Command
from backend.schemas.schemas import ApproveCommandRequest, CommandDetail, CreateCommandRequest
from backend.services import audit_engine, command_engine

router = APIRouter(tags=["Commands"])


@router.post(
    "/commands", response_model=CommandDetail, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_bearer)],
    operation_id="create_command",
)
async def create_command(body: CreateCommandRequest, db: AsyncSession = Depends(get_db)) -> CommandDetail:
    """Issue a control command. life_safety assets automatically require a
    second, different authorised user's approval within 15 minutes (FR-11)."""
    asset = await db.get(Asset, body.asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    if not asset.controllable:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Asset is not controllable")

    command = await command_engine.create_command(
        db, asset=asset, action=body.action, payload=body.payload, issued_by=body.issued_by,
        issued_role=body.issued_role, issued_from=body.issued_from,
    )
    await audit_engine.record(
        db, user_id=body.issued_by, role=body.issued_role, station_id=asset.station_id, action="command.create",
        resource=command.id, detail={"asset_id": asset.id, "action": body.action, "payload": body.payload},
    )
    return CommandDetail.model_validate(command)


@router.post(
    "/commands/{command_id}/approve",
    response_model=CommandDetail,
    dependencies=[Depends(require_bearer)],
    operation_id="approve_command",
)
async def approve_command(command_id: str, body: ApproveCommandRequest, db: AsyncSession = Depends(get_db)) -> CommandDetail:
    command = await db.get(Command, command_id)
    if not command:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Command not found")

    try:
        command = await command_engine.approve_command(db, command, body.approver, body.approver_role)
    except command_engine.SameUserApproval as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except command_engine.CommandExpired as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    await audit_engine.record(
        db, user_id=body.approver, role=body.approver_role, station_id=command.station_id, action="command.approve",
        resource=command_id, detail=None,
    )
    return CommandDetail.model_validate(command)


@router.post(
    "/commands/{command_id}/cancel",
    response_model=CommandDetail,
    dependencies=[Depends(require_bearer)],
    operation_id="cancel_command",
)
async def cancel_command(command_id: str, db: AsyncSession = Depends(get_db)) -> CommandDetail:
    command = await db.get(Command, command_id)
    if not command:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Command not found")
    command = await command_engine.cancel_command(db, command)
    return CommandDetail.model_validate(command)


@router.get("/commands", response_model=list[CommandDetail], dependencies=[Depends(require_bearer)], operation_id="list_commands")
async def list_commands(
    station: str | None = Query(default=None), command_state: str | None = Query(default=None, alias="state"),
    db: AsyncSession = Depends(get_db),
) -> list[CommandDetail]:
    q = select(Command)
    if station:
        q = q.where(Command.station_id == station)
    if command_state:
        q = q.where(Command.state == command_state)
    q = q.order_by(Command.created_at.desc()).limit(200)
    result = await db.execute(q)
    return [CommandDetail.model_validate(c) for c in result.scalars().all()]


@router.get("/commands/{command_id}", response_model=CommandDetail, dependencies=[Depends(require_bearer)], operation_id="get_command")
async def get_command(command_id: str, db: AsyncSession = Depends(get_db)) -> CommandDetail:
    command = await db.get(Command, command_id)
    if not command:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Command not found")
    return CommandDetail.model_validate(command)
