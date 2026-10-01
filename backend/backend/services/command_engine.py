"""
Command Engine — two-phase actuation state machine (FR-9…14, C4).

A command is a row, not an RPC: queued -> sent -> acked -> applied, plus
failed/expired. life_safety assets require a second, different, authorised
user to approve within 15 minutes or the command expires untouched.
Optimistic UI is forbidden here on purpose — the device (agent) side must
ack before anything is considered delivered, and "applied" only happens once
the device reports the resulting telemetry change.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.tables import Asset, Command

logger = structlog.get_logger(__name__)

LIFE_SAFETY_APPROVAL_WINDOW_MINUTES = 15
STANDARD_DELIVERY_WINDOW_MINUTES = 30


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class SecondApproverRequired(Exception):
    pass


class SameUserApproval(Exception):
    """A life-safety command's second approval must come from a different
    authorised user than whoever issued it (FR-11)."""


class CommandExpired(Exception):
    pass


def _same_person(a: str | None, b: str | None) -> bool:
    """Identity comparison for the two-person rule. Case, surrounding whitespace
    and repeated inner whitespace must not let one person pose as two."""
    def norm(s: str | None) -> str:
        return " ".join((s or "").casefold().split())

    return norm(a) != "" and norm(a) == norm(b)


async def create_command(
    db: AsyncSession,
    *,
    asset: Asset,
    action: str,
    payload: dict,
    issued_by: str,
    issued_role: str,
    issued_from: str,
) -> Command:
    requires_second_approval = asset.life_safety
    window = (
        LIFE_SAFETY_APPROVAL_WINDOW_MINUTES
        if requires_second_approval
        else STANDARD_DELIVERY_WINDOW_MINUTES
    )
    command = Command(
        station_id=asset.station_id,
        asset_id=asset.id,
        action=action,
        payload=payload,
        issued_by=issued_by,
        issued_role=issued_role,
        issued_from=issued_from,
        requires_second_approval=requires_second_approval,
        state="queued",
        expires_at=_utcnow() + timedelta(minutes=window),
    )
    db.add(command)
    await db.flush()
    logger.info(
        "command.created",
        command_id=command.id,
        asset_id=asset.id,
        action=action,
        requires_second_approval=requires_second_approval,
    )
    return command


async def approve_command(db: AsyncSession, command: Command, approver: str, approver_role: str) -> Command:
    if not command.requires_second_approval:
        return command
    if command.state != "queued":
        raise CommandExpired(f"Command {command.id} is {command.state}, cannot approve")
    if _utcnow() > command.expires_at:
        command.state = "expired"
        await db.flush()
        raise CommandExpired(f"Command {command.id} expired at {command.expires_at}")
    if _same_person(approver, command.issued_by):
        raise SameUserApproval("A second, different authorised user must approve this command")

    command.approved_by = approver
    command.approved_at = _utcnow()
    await db.flush()
    logger.info("command.approved", command_id=command.id, approver=approver, approver_role=approver_role)
    return command


async def cancel_command(db: AsyncSession, command: Command) -> Command:
    if command.state in ("applied", "failed", "expired"):
        return command
    command.state = "failed"
    command.result = {"reason": "cancelled"}
    await db.flush()
    return command


async def expire_due_commands(db: AsyncSession) -> list[Command]:
    """Sweep queued life-safety commands whose approval window has lapsed."""
    now = _utcnow()
    result = await db.execute(
        select(Command).where(
            and_(
                Command.state == "queued",
                Command.requires_second_approval == True,  # noqa: E712
                Command.approved_at.is_(None),
                Command.expires_at < now,
            )
        )
    )
    due = list(result.scalars().all())
    for command in due:
        command.state = "expired"
    if due:
        await db.flush()
        logger.info("command.expired_batch", count=len(due))
    return due


async def next_deliverable_command(db: AsyncSession, asset_id: str) -> Command | None:
    """Return (and mark 'sent') the next command ready for the device to
    execute: not requiring approval, or already approved."""
    result = await db.execute(
        select(Command).where(
            and_(
                Command.asset_id == asset_id,
                Command.state == "queued",
                Command.expires_at > _utcnow(),
            )
        ).order_by(Command.created_at.asc())
    )
    for command in result.scalars().all():
        if command.requires_second_approval and command.approved_at is None:
            continue
        command.state = "sent"
        await db.flush()
        return command
    return None


async def ack_command(db: AsyncSession, command: Command) -> Command:
    command.state = "acked"
    command.acked_at = _utcnow()
    await db.flush()
    return command


async def apply_command(db: AsyncSession, command: Command, result: dict) -> Command:
    command.state = "applied"
    command.applied_at = _utcnow()
    command.result = result
    await db.flush()
    logger.info("command.applied", command_id=command.id, result=result)
    return command
