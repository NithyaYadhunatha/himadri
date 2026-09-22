"""
Router: Notification Recipients — email-alerting config for HIMADRI asset
escalations (restored/re-adapted from the old InfraMind IT-outage-alert
feature; now fires on a Critical/Emergency alert escalation, FR-60).

NOT a user/account concept — see context/BACKLOG.md's "Boundary reminder":
this backend never learns about users, roles, or departments. A recipient
here is a plain email address to notify, optionally scoped to one station —
structurally closer to AlertRule (station_id nullable = unrestricted) than
to a User.

GET    /notification-recipients?station=
POST   /notification-recipients
PATCH  /notification-recipients/{id}
DELETE /notification-recipients/{id}
POST   /notification-recipients/send-test
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.postgres import get_db
from backend.dependencies import require_bearer
from backend.models.tables import NotificationRecipient, new_uuid
from backend.schemas.schemas import (
    CreateNotificationRecipientRequest,
    NotificationRecipientDetail,
    SendTestNotificationRequest,
    UpdateNotificationRecipientRequest,
)
from backend.services import email_service

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["Notifications"])


@router.get(
    "/notification-recipients",
    response_model=list[NotificationRecipientDetail],
    dependencies=[Depends(require_bearer)],
    operation_id="list_notification_recipients",
)
async def list_notification_recipients(
    station: str | None = Query(default=None), db: AsyncSession = Depends(get_db)
) -> list[NotificationRecipientDetail]:
    q = select(NotificationRecipient)
    if station:
        q = q.where(NotificationRecipient.station_id == station)
    q = q.order_by(NotificationRecipient.created_at.desc())
    result = await db.execute(q)
    return [NotificationRecipientDetail.model_validate(r) for r in result.scalars().all()]


@router.post(
    "/notification-recipients",
    response_model=NotificationRecipientDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_bearer)],
    operation_id="create_notification_recipient",
)
async def create_notification_recipient(
    body: CreateNotificationRecipientRequest, db: AsyncSession = Depends(get_db)
) -> NotificationRecipientDetail:
    recipient = NotificationRecipient(
        id=new_uuid(),
        email=body.email,
        name=body.name,
        station_id=body.station_id,
        active=body.active,
    )
    db.add(recipient)
    await db.flush()
    return NotificationRecipientDetail.model_validate(recipient)


@router.patch(
    "/notification-recipients/{recipient_id}",
    response_model=NotificationRecipientDetail,
    dependencies=[Depends(require_bearer)],
    operation_id="update_notification_recipient",
)
async def update_notification_recipient(
    recipient_id: str, body: UpdateNotificationRecipientRequest, db: AsyncSession = Depends(get_db)
) -> NotificationRecipientDetail:
    recipient = await db.get(NotificationRecipient, recipient_id)
    if not recipient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification recipient not found")

    if body.email is not None:
        recipient.email = body.email
    if body.name is not None:
        recipient.name = body.name
    if body.station_id is not None:
        recipient.station_id = body.station_id
    if body.active is not None:
        recipient.active = body.active

    await db.flush()
    return NotificationRecipientDetail.model_validate(recipient)


@router.delete(
    "/notification-recipients/{recipient_id}",
    dependencies=[Depends(require_bearer)],
    operation_id="delete_notification_recipient",
)
async def delete_notification_recipient(recipient_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    recipient = await db.get(NotificationRecipient, recipient_id)
    if not recipient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification recipient not found")
    await db.delete(recipient)
    await db.flush()
    return {"id": recipient_id, "deleted": True}


@router.post(
    "/notification-recipients/send-test",
    dependencies=[Depends(require_bearer)],
    operation_id="send_test_notification",
)
async def send_test_notification(body: SendTestNotificationRequest, db: AsyncSession = Depends(get_db)) -> dict:
    """Fires a realistic sample Critical-escalation email so an admin can
    see the format without waiting for a real alert to escalate (FR-60)."""
    result = await email_service.send_test_email(db, to_email=body.email, station_id=body.station_id)
    if not result["api_key_configured"]:
        logger.warning("notification.send_test_no_api_key")
    return result
