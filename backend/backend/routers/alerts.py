"""
Router: Alert & Anomaly System endpoints (FR-56…64).
GET    /alerts?station=&state=&severity=&category=
POST   /alerts/{id}/ack
POST   /alerts/{id}/resolve
GET    /alert-rules
POST   /alert-rules
PATCH  /alert-rules/{id}
"""

from __future__ import annotations

from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.postgres import get_db
from backend.dependencies import require_bearer
from backend.models.tables import Alert, AlertRule, new_uuid
from backend.schemas.schemas import (
    AckAlertRequest,
    AlertDetail,
    AlertRuleDetail,
    CreateAlertRuleRequest,
)
from backend.services import alert_engine, audit_engine
from backend.websocket.manager import ws_manager

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["Alerts"])


@router.get("/alerts", response_model=list[AlertDetail], dependencies=[Depends(require_bearer)], operation_id="list_alerts")
async def list_alerts(
    station: str | None = Query(default=None),
    alert_state: str | None = Query(default=None, alias="state"),
    severity: str | None = Query(default=None),
    category: str | None = Query(default=None),
    since: datetime | None = Query(default=None),
    until: datetime | None = Query(default=None),
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    db: AsyncSession = Depends(get_db),
) -> list[AlertDetail]:
    q = select(Alert)
    if station:
        q = q.where(Alert.station_id == station)
    if alert_state:
        q = q.where(Alert.state == alert_state)
    if severity:
        q = q.where(Alert.severity == severity)
    if category:
        q = q.where(Alert.category == category)
    if date_from or since:
        q = q.where(Alert.first_seen >= (date_from or since))
    if date_to or until:
        q = q.where(Alert.first_seen <= (date_to or until))
    q = q.order_by(Alert.last_seen.desc()).limit(500)

    result = await db.execute(q)
    return [AlertDetail.model_validate(a) for a in result.scalars().all()]


@router.post(
    "/alerts/{alert_id}/ack", response_model=AlertDetail, dependencies=[Depends(require_bearer)], operation_id="ack_alert"
)
async def ack_alert(alert_id: str, body: AckAlertRequest, db: AsyncSession = Depends(get_db)) -> AlertDetail:
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    alert = await alert_engine.ack_alert(db, alert, body.user, body.note)
    await audit_engine.record(
        db, user_id=body.user, role=None, station_id=alert.station_id, action="alert.ack", resource=alert_id, detail={"note": body.note}
    )
    await ws_manager.broadcast("alert.acked", {"id": alert.id, "acked_by": alert.acked_by,
                                                "acked_at": alert.acked_at}, asset_id=alert.asset_id)
    return AlertDetail.model_validate(alert)


@router.post(
    "/alerts/{alert_id}/resolve",
    response_model=AlertDetail,
    dependencies=[Depends(require_bearer)],
    operation_id="resolve_alert",
)
async def resolve_alert(alert_id: str, db: AsyncSession = Depends(get_db)) -> AlertDetail:
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    alert = await alert_engine.resolve_alert(db, alert)
    return AlertDetail.model_validate(alert)


@router.get(
    "/alert-rules", response_model=list[AlertRuleDetail], dependencies=[Depends(require_bearer)], operation_id="list_alert_rules"
)
async def list_alert_rules(
    station: str | None = Query(default=None), asset: str | None = Query(default=None), db: AsyncSession = Depends(get_db)
) -> list[AlertRuleDetail]:
    q = select(AlertRule)
    if station:
        q = q.where(AlertRule.station_id == station)
    if asset:
        q = q.where(AlertRule.asset_id == asset)
    result = await db.execute(q)
    return [AlertRuleDetail.model_validate(r) for r in result.scalars().all()]


@router.post(
    "/alert-rules",
    response_model=AlertRuleDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_bearer)],
    operation_id="create_alert_rule",
)
async def create_alert_rule(body: CreateAlertRuleRequest, db: AsyncSession = Depends(get_db)) -> AlertRuleDetail:
    rule = AlertRule(
        id=new_uuid(),
        station_id=body.station_id,
        asset_id=body.asset_id,
        series_key=body.series_key,
        type=body.type,
        params=body.params,
        severity=body.severity,
        category=body.category,
        escalate_after_seconds=body.escalate_after_seconds,
    )
    db.add(rule)
    await db.flush()
    return AlertRuleDetail.model_validate(rule)


@router.patch(
    "/alert-rules/{rule_id}",
    response_model=AlertRuleDetail,
    dependencies=[Depends(require_bearer)],
    operation_id="update_alert_rule",
)
async def update_alert_rule(rule_id: str, body: CreateAlertRuleRequest, db: AsyncSession = Depends(get_db)) -> AlertRuleDetail:
    rule = await db.get(AlertRule, rule_id)
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule not found")
    rule.station_id = body.station_id
    rule.asset_id = body.asset_id
    rule.series_key = body.series_key
    rule.type = body.type
    rule.params = body.params
    rule.severity = body.severity
    rule.category = body.category
    rule.escalate_after_seconds = body.escalate_after_seconds
    await db.flush()
    return AlertRuleDetail.model_validate(rule)


@router.post("/alerts/escalate-due", dependencies=[Depends(require_bearer)], operation_id="escalate_due_alerts")
async def escalate_due_alerts(db: AsyncSession = Depends(get_db)) -> dict:
    """Escalate unacked Critical/Emergency alerts past their timer (FR-60).
    Intended to be called on a schedule (or the background loop in main.py)."""
    due = await alert_engine.escalate_due_alerts(db)
    for alert in due:
        await ws_manager.broadcast_alert_triggered(
            alert.asset_id, {"id": alert.id, "severity": alert.severity, "category": alert.category, "message": f"ESCALATED: {alert.message}"}
        )
    return {"escalated": len(due)}
