"""
Audit Engine — hash-chained, append-only privileged-action log (NFR-14).

Every privileged action (actuation, alert-rule changes, user management,
data export, advisory acceptance — FR-68) is written here. Each row stores
prev_hash and hash = sha256(prev_hash + canonical_json(row)); verify_chain()
walks the whole table and reports the first row where the chain breaks, so
tampering by direct SQL (bypassing the API) is detectable. The table itself
has UPDATE/DELETE revoked from the application role (see migrations/README
note in scripts/init_db.py) — this module never issues an UPDATE/DELETE.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.models.tables import AuditEvent, SyncItem

logger = structlog.get_logger(__name__)

GENESIS_HASH = "0" * 64


def _canonical_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))


def _compute_hash(prev_hash: str, row: dict[str, Any]) -> str:
    return hashlib.sha256((prev_hash + _canonical_json(row)).encode("utf-8")).hexdigest()


async def _last_hash(db: AsyncSession) -> str:
    result = await db.execute(select(AuditEvent.hash).order_by(AuditEvent.seq.desc()).limit(1))
    row = result.scalar_one_or_none()
    return row or GENESIS_HASH


async def record(
    db: AsyncSession,
    *,
    user_id: str | None,
    role: str | None,
    station_id: str | None,
    action: str,
    resource: str | None = None,
    detail: dict[str, Any] | None = None,
) -> AuditEvent:
    ts = datetime.now(timezone.utc).replace(tzinfo=None)
    prev_hash = await _last_hash(db)
    body = {
        "ts": ts,
        "user_id": user_id,
        "role": role,
        "station_id": station_id,
        "action": action,
        "resource": resource,
        "detail": detail,
    }
    row_hash = _compute_hash(prev_hash, body)

    event = AuditEvent(
        ts=ts,
        user_id=user_id,
        role=role,
        station_id=station_id,
        action=action,
        resource=resource,
        detail=detail,
        prev_hash=prev_hash,
        hash=row_hash,
    )
    db.add(event)
    await db.flush()
    sync_payload = {"seq": event.seq, "ts": ts.isoformat(), "user_id": user_id,
                    "role": role, "station_id": station_id, "action": action,
                    "resource": resource, "detail": detail, "prev_hash": prev_hash,
                    "hash": row_hash}
    db.add(SyncItem(
        node_id=settings.NODE_ID, seq=event.seq, table_name="audit_event",
        row_id=str(event.seq), op="insert", payload=sync_payload,
        content_hash=hashlib.sha256(_canonical_json(sync_payload).encode()).hexdigest(),
        priority=0,
    ))
    await db.flush()
    logger.info("audit.recorded", action=action, user_id=user_id, resource=resource)
    return event


async def verify_chain(db: AsyncSession) -> dict[str, Any]:
    """Walk the whole audit_events table in seq order and recompute each
    hash from its stored prev_hash + row content. Returns the first seq at
    which the stored hash no longer matches, or valid=True if none."""
    result = await db.execute(select(AuditEvent).order_by(AuditEvent.seq.asc()))
    rows = list(result.scalars().all())

    expected_prev = GENESIS_HASH
    total = len(rows)
    for row in rows:
        body = {
            "ts": row.ts,
            "user_id": row.user_id,
            "role": row.role,
            "station_id": row.station_id,
            "action": row.action,
            "resource": row.resource,
            "detail": row.detail,
        }
        if row.prev_hash != expected_prev:
            return {"valid": False, "first_break_seq": row.seq, "checked": total}
        recomputed = _compute_hash(row.prev_hash, body)
        if recomputed != row.hash:
            return {"valid": False, "first_break_seq": row.seq, "checked": total}
        expected_prev = row.hash

    return {"valid": True, "first_break_seq": None, "checked": total}


async def count_events(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(AuditEvent))
    return result.scalar_one()
