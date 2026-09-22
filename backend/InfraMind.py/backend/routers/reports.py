"""
Router: Report endpoints.
GET  /reports               — list all reports
GET  /reports/{id}          — get report detail
POST /reports/generate      — generate + store + return a new report
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.postgres import get_db
from backend.dependencies import require_bearer
from backend.models.tables import Report
from backend.schemas.schemas import GenerateReportRequest, ReportDetail, ReportListItem
from backend.services.report_engine import generate_report

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("", response_model=list[ReportListItem], dependencies=[Depends(require_bearer)], operation_id="list_reports")
async def list_reports(db: AsyncSession = Depends(get_db)) -> list[ReportListItem]:
    """List all generated reports, newest first."""
    result = await db.execute(select(Report).order_by(Report.generated_at.desc()).limit(100))
    reports = result.scalars().all()
    return [ReportListItem.model_validate(r) for r in reports]


@router.get("/{report_id}", response_model=ReportDetail, dependencies=[Depends(require_bearer)], operation_id="get_report")
async def get_report(report_id: str, db: AsyncSession = Depends(get_db)) -> ReportDetail:
    """Return full report detail including content_json."""
    report = await db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return ReportDetail.model_validate(report)


@router.post(
    "/generate", response_model=ReportDetail, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_bearer)],
    operation_id="generate_report",
)
async def create_report(body: GenerateReportRequest, db: AsyncSession = Depends(get_db)) -> ReportDetail:
    """
    Generate and store a new report.
    - report_type: health | risk | environmental | daily_brief
    - station_id / asset_id: scope the report; None station_id + None asset_id = fleet-wide
    """
    try:
        report = await generate_report(db, body.report_type, body.station_id, body.asset_id, body.range_from, body.range_to)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await db.commit()
    await db.refresh(report)
    return ReportDetail.model_validate(report)
