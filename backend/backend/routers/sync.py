"""Durable sync queue and HQ batch receiver for the v1 API."""

from __future__ import annotations

import gzip
import hashlib
import json
import zlib
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.database.postgres import get_db
from backend.dependencies import require_bearer
from backend.models.tables import SyncControl, SyncItem

router = APIRouter(prefix="/sync", tags=["Sync"], dependencies=[Depends(require_bearer)])
MAX_BATCH_BYTES = 10_000_000


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def content_hash(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()
    return hashlib.sha256(raw).hexdigest()


async def _control(db: AsyncSession) -> SyncControl:
    control = await db.get(SyncControl, settings.NODE_ID)
    if control is None:
        control = SyncControl(node_id=settings.NODE_ID, paused=False)
        db.add(control)
        await db.flush()
    return control


@router.get("/status", operation_id="get_sync_status")
async def get_sync_status(db: AsyncSession = Depends(get_db)) -> dict:
    control = await _control(db)
    depth = (await db.execute(select(func.count()).select_from(SyncItem).where(
        SyncItem.node_id == settings.NODE_ID, SyncItem.acked_at.is_(None)
    ))).scalar_one()
    return {"node_id": settings.NODE_ID, "link_state": settings.LINK_STATE,
            "paused": control.paused, "queue_depth": depth, "last_sync": control.last_sync,
            "bytes_budget": settings.SYNC_BYTES_BUDGET}


class PauseRequest(BaseModel):
    paused: bool = True


@router.post("/pause", operation_id="pause_sync")
async def pause_sync(body: PauseRequest, db: AsyncSession = Depends(get_db)) -> dict:
    control = await _control(db)
    control.paused = body.paused
    await db.flush()
    return {"node_id": control.node_id, "paused": control.paused}


def _serialize(item: SyncItem) -> dict:
    return {"node_id": item.node_id, "seq": item.seq, "table_name": item.table_name,
            "row_id": item.row_id, "op": item.op, "payload": item.payload,
            "content_hash": item.content_hash, "priority": item.priority,
            "created_at": item.created_at.isoformat()}


@router.post("/now", operation_id="sync_now")
async def sync_now(db: AsyncSession = Depends(get_db)) -> dict:
    control = await _control(db)
    if control.paused:
        raise HTTPException(status_code=409, detail="Sync is paused")
    if not settings.HQ_SYNC_URL:
        raise HTTPException(status_code=503, detail="HQ sync URL is not configured")
    items = (await db.execute(select(SyncItem).where(
        SyncItem.node_id == settings.NODE_ID, SyncItem.acked_at.is_(None)
    ).order_by(SyncItem.priority, SyncItem.seq).limit(1000))).scalars().all()
    if not items:
        return {"sent": 0, "acked": 0}
    payload = gzip.compress(json.dumps({"items": [_serialize(item) for item in items]}).encode())
    if len(payload) > settings.SYNC_BYTES_BUDGET:
        raise HTTPException(status_code=413, detail="Sync batch exceeds bytes budget")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{settings.HQ_SYNC_URL.rstrip('/')}/api/v1/sync/batch", content=payload,
                headers={"Authorization": f"Bearer {settings.API_SECRET_KEY}",
                         "Content-Type": "application/json", "Content-Encoding": "gzip"},
            )
            response.raise_for_status()
            acked = set(response.json().get("acked_seqs", [])) & {item.seq for item in items}
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="HQ receiver unreachable or rejected batch") from exc
    now = _now()
    for item in items:
        item.sent_at = now
        if item.seq in acked:
            item.acked_at = now
    control.last_sync = now
    await db.flush()
    return {"sent": len(items), "acked": len(acked)}


class BatchItem(BaseModel):
    node_id: str
    seq: int = Field(ge=0)
    table_name: str
    row_id: str
    op: str
    payload: dict
    content_hash: str
    priority: int = Field(ge=0, le=2)
    created_at: datetime | None = None


@router.post("/batch", operation_id="receive_sync_batch")
async def receive_sync_batch(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    raw = await request.body()
    if len(raw) > MAX_BATCH_BYTES:
        raise HTTPException(status_code=413, detail="Batch too large")
    try:
        if request.headers.get("content-encoding") == "gzip":
            decompressor = zlib.decompressobj(16 + zlib.MAX_WBITS)
            raw = decompressor.decompress(raw, MAX_BATCH_BYTES + 1)
            if len(raw) > MAX_BATCH_BYTES or not decompressor.eof:
                raise ValueError("Batch too large or incomplete")
        if len(raw) > MAX_BATCH_BYTES:
            raise ValueError("Batch too large")
        data = json.loads(raw)
        items = [BatchItem.model_validate(item) for item in data["items"]]
    except (OSError, zlib.error, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=422, detail="Invalid sync batch") from exc
    acked = []
    now = _now()
    for item in items:
        if content_hash(item.payload) != item.content_hash:
            raise HTTPException(status_code=422, detail=f"Content hash mismatch at seq {item.seq}")
        existing = await db.get(SyncItem, (item.node_id, item.seq))
        if existing is not None and existing.content_hash != item.content_hash:
            raise HTTPException(status_code=409, detail=f"Conflicting sync item at seq {item.seq}")
        if existing is None:
            db.add(SyncItem(**item.model_dump(exclude={"created_at"}),
                            created_at=item.created_at.replace(tzinfo=None) if item.created_at else now,
                            sent_at=now, acked_at=now))
        acked.append(item.seq)
    await db.flush()
    return {"received": len(items), "acked_seqs": acked}


class ExportRequest(BaseModel):
    date_from: datetime = Field(alias="from")
    date_to: datetime = Field(alias="to")


@router.post("/export", operation_id="export_sync_package")
async def export_sync_package(body: ExportRequest, db: AsyncSession = Depends(get_db)) -> Response:
    start = body.date_from.replace(tzinfo=None)
    end = body.date_to.replace(tzinfo=None)
    if start >= end:
        raise HTTPException(status_code=422, detail="from must be before to")
    items = (await db.execute(select(SyncItem).where(
        SyncItem.node_id == settings.NODE_ID,
        SyncItem.created_at >= start, SyncItem.created_at <= end,
    ).order_by(SyncItem.priority, SyncItem.seq))).scalars().all()
    package = gzip.compress(json.dumps({"items": [_serialize(item) for item in items]}).encode())
    return Response(package, media_type="application/gzip",
                    headers={"Content-Disposition": 'attachment; filename="himadri-sync.json.gz"'})
