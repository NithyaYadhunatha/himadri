"""
HIMADRI — FastAPI Application Entry Point.

Antarctic Research Station Digital Twin, PS 26060 (ISRO / NCPOR),
Smart India Hackathon 2026. Stations in scope: Maitri and Bharati.

Includes:
  - Lifespan context manager (startup/shutdown)
  - CORS middleware
  - All routers
  - Offline / stale-data detection background task
  - Command-expiry sweep (life-safety second-approval window)
  - Health check endpoint
  - MCP server for the natural-language Operations Agent
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator

import structlog
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_mcp import AuthConfig, FastApiMCP
from sqlalchemy import select

from backend.config import settings
from backend.database.neo4j_client import close_driver, verify_connectivity
from backend.database.postgres import close_engine, create_all_tables, get_session_factory
from backend.dependencies import require_bearer
from backend.models.tables import Asset
from backend.routers import (
    agents,
    alerts,
    analytics,
    assets,
    audit,
    commands,
    devices,
    logistics,
    notifications,
    predictive_maintenance,
    reports,
    scenarios,
    stations,
    websocket,
)
from backend.services import alert_engine, command_engine, email_service, mqtt_ingest
from backend.websocket.manager import ws_manager

# Curated set of operation_ids exposed as MCP tools for the natural-language
# Operations Agent (FR-89…94). Deliberately excludes /agent/register and
# /agent/heartbeat (device-only, high-frequency telemetry ingestion — never
# an LLM tool), and every mutating/actuation route: the agent may only
# pre-fill a command for human confirmation (FR-91), never execute one
# directly, so create_command/approve_command are never exposed here.
MCP_TOOL_OPERATIONS = [
    "list_stations",
    "get_station",
    "list_station_zones",
    "get_station_summary",
    "get_station_twin_graph",
    "list_assets",
    "get_asset",
    "get_asset_readings",
    "get_asset_dependencies",
    "get_blast_radius",
    "get_asset_alerts",
    "get_asset_passport",
    "list_alerts",
    "list_alert_rules",
    "list_reports",
    "get_report",
    "generate_report",
    "list_scenario_presets",
    "run_scenario",
    "list_scenarios",
    "get_scenario",
    "compare_scenarios",
    "get_risk_heatmap",
    "diagnose_fault",
    "list_inventory",
    "get_logistics_endurance",
    "list_vehicles",
    "list_convoys",
    "list_waste_records",
    "list_advisories",
]

logger = structlog.get_logger(__name__)

# ─── Background tasks ────────────────────────────────────────────────────────

OFFLINE_CHECK_INTERVAL_SECONDS = 5


async def _offline_detection_loop() -> None:
    """Every OFFLINE_CHECK_INTERVAL_SECONDS, check for assets that haven't
    reported within OFFLINE_TIMEOUT_SECONDS — a stale series is an alert,
    never a silently-blank chart (architecture doc, "Errors" cross-cutting
    concern) — and sweep expired life-safety commands (FR-11)."""
    logger.info("offline_detector.started", interval=OFFLINE_CHECK_INTERVAL_SECONDS, timeout=settings.OFFLINE_TIMEOUT_SECONDS)
    while True:
        await asyncio.sleep(OFFLINE_CHECK_INTERVAL_SECONDS)
        try:
            await _check_stale_assets()
            await _sweep_commands_and_alerts()
        except Exception as e:
            logger.error("offline_detector.error", error=str(e))


async def _check_stale_assets() -> None:
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=settings.OFFLINE_TIMEOUT_SECONDS)
    factory = get_session_factory()

    async with factory() as db:
        try:
            result = await db.execute(select(Asset).where(Asset.last_seen < cutoff, Asset.status != "offline"))
            stale_assets = result.scalars().all()

            for asset in stale_assets:
                logger.warning("offline_detector.asset_offline", asset_id=asset.id, name=asset.name, last_seen=asset.last_seen)
                asset.status = "offline"

                alert = await alert_engine.trigger_stale_alert(db, asset)

                await ws_manager.broadcast_asset_status_changed(asset.id, "offline", asset.health_score)
                if alert:
                    await ws_manager.broadcast_alert_triggered(
                        asset.id, {"id": alert.id, "severity": alert.severity, "category": alert.category, "message": alert.message}
                    )

            await db.commit()
            if stale_assets:
                logger.info("offline_detector.marked_offline", count=len(stale_assets))
        except Exception as e:
            await db.rollback()
            logger.error("offline_detector.db_error", error=str(e))


async def _sweep_commands_and_alerts() -> None:
    """Expire life-safety commands past their approval window (FR-11) and
    escalate unacked Critical/Emergency alerts past their timer (FR-60)."""
    factory = get_session_factory()
    async with factory() as db:
        try:
            expired = await command_engine.expire_due_commands(db)
            for command in expired:
                await ws_manager.broadcast_command_updated(command.id, "expired")

            escalated = await alert_engine.escalate_due_alerts(db)
            for alert in escalated:
                await ws_manager.broadcast_alert_triggered(
                    alert.asset_id, {"id": alert.id, "severity": alert.severity, "category": alert.category, "message": f"ESCALATED: {alert.message}"}
                )
            await db.commit()

            # Email notification is deliberately fired here — after the
            # commit, outside alert_engine.py — rather than inside
            # escalate_due_alerts() itself, so the alert engine stays free of
            # a mail-sending side effect and a Resend outage can never roll
            # back (or even see) the alert-escalation transaction. Its own
            # try/except keeps a notification failure from being logged as a
            # sweep failure (email_service already never raises, but this
            # is the resilience boundary regardless).
            if escalated:
                try:
                    await email_service.notify_escalated_alerts(db, escalated)
                except Exception as e:
                    logger.error("notification.escalation_sweep_error", error=str(e))
        except Exception as e:
            await db.rollback()
            logger.error("command_alert_sweep.error", error=str(e))


# ─── Lifespan ─────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan — startup and shutdown hooks."""
    logger.info("himadri.startup_begin")

    await create_all_tables()
    logger.info("himadri.postgres_ready")

    try:
        await verify_connectivity()
        logger.info("himadri.neo4j_ready")
    except Exception as e:
        logger.warning("himadri.neo4j_unavailable", error=str(e))
        # Non-fatal for startup — the twin/dependency-graph features degrade
        # gracefully; telemetry ingest and alerting still work (C1/NFR-8).

    if settings.MQTT_ENABLED:
        # Non-fatal for startup, same posture as Neo4j above — start()
        # only schedules a background task (backend/services/mqtt_ingest.py)
        # that retries its own connection forever; a Mosquitto that's down
        # or unreachable never blocks startup or affects the HTTP heartbeat
        # ingest path.
        await mqtt_ingest.start()
        logger.info("himadri.mqtt_listener_started")
    else:
        logger.info("himadri.mqtt_disabled")

    detection_task = asyncio.create_task(_offline_detection_loop())
    logger.info("himadri.background_tasks_started")

    logger.info("himadri.startup_complete", host="0.0.0.0", port=8000)

    yield  # Application runs here

    logger.info("himadri.shutdown_begin")
    detection_task.cancel()
    try:
        await detection_task
    except asyncio.CancelledError:
        pass

    if settings.MQTT_ENABLED:
        await mqtt_ingest.stop()

    await close_engine()
    await close_driver()
    logger.info("himadri.shutdown_complete")


# ─── App factory ──────────────────────────────────────────────────────────────


def create_app() -> FastAPI:
    app = FastAPI(
        title="HIMADRI API",
        description=(
            "Digital twin and remote-management platform for India's Antarctic "
            "research stations, Maitri and Bharati. PS 26060 — ISRO / NCPOR, "
            "Smart India Hackathon 2026."
        ),
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(agents.router)
    app.include_router(stations.router)
    app.include_router(assets.router)
    app.include_router(alerts.router)
    app.include_router(commands.router)
    app.include_router(scenarios.router)
    app.include_router(analytics.router)
    app.include_router(logistics.router)
    app.include_router(reports.router)
    app.include_router(devices.router)
    app.include_router(audit.router)
    app.include_router(notifications.router)
    app.include_router(websocket.router)
    app.include_router(predictive_maintenance.router)

    # ── Health check ─────────────────────────────────────────────────────────
    @app.get("/health", tags=["Health"])
    async def health() -> dict:
        return {
            "status": "healthy",
            "service": "HIMADRI Backend",
            "version": "1.0.0",
            "ws_connections": ws_manager.connection_count,
        }

    # ── MCP server (natural-language Operations Agent, FR-89…94) ────────────
    if settings.MCP_ENABLED:
        mcp = FastApiMCP(
            app,
            name="HIMADRI Operations Agent",
            description=(
                "Query the Maitri/Bharati digital twin: station and asset status, "
                "telemetry, alerts, fuel/food/logistics endurance, the Antarctic "
                "Risk Heatmap, guided fault diagnosis, reports, and what-if "
                "scenarios. Read-only — never executes actuation directly."
            ),
            include_operations=MCP_TOOL_OPERATIONS,
            auth_config=AuthConfig(dependencies=[Depends(require_bearer)]),
        )
        mcp.mount_http()
        logger.info("himadri.mcp_mounted", path="/mcp", tools=len(MCP_TOOL_OPERATIONS))

    return app


app = create_app()
