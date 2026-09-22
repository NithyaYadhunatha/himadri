"""
Router: Audit endpoints (NFR-14, FR-68, FR-69).
GET /audit?from=&to=&user=
GET /audit/verify
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.postgres import get_db
from backend.dependencies import require_bearer
from backend.models.tables import AuditEvent
from backend.schemas.schemas import AuditEventDetail, AuditVerifyResponse
from backend.services import audit_engine

router = APIRouter(prefix="/audit", tags=["Audit"])


@router.get("", response_model=list[AuditEventDetail], dependencies=[Depends(require_bearer)], operation_id="list_audit_events")
async def list_audit_events(
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    user: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[AuditEventDetail]:
    """Read-only, append-only privileged-action log — never editable or
    deletable through any interface (FR-69)."""
    q = select(AuditEvent)
    if date_from:
        q = q.where(AuditEvent.ts >= date_from)
    if date_to:
        q = q.where(AuditEvent.ts <= date_to)
    if user:
        q = q.where(AuditEvent.user_id == user)
    q = q.order_by(AuditEvent.seq.desc()).limit(500)
    result = await db.execute(q)
    return [AuditEventDetail.model_validate(e) for e in result.scalars().all()]


@router.get("/verify", response_model=AuditVerifyResponse, dependencies=[Depends(require_bearer)], operation_id="verify_audit_chain")
async def verify_audit_chain(db: AsyncSession = Depends(get_db)) -> AuditVerifyResponse:
    """Walk the hash chain and report the first broken row, if any."""
    result = await audit_engine.verify_chain(db)
    return AuditVerifyResponse(**result)
