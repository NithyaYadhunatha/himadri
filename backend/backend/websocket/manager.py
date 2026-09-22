"""
WebSocket Connection Manager.
Manages all active WebSocket connections and broadcasts typed events.

Event types:
  reading.updated      — new heartbeat/reading received
  alert.triggered      — new alert created
  asset.status_changed — asset went ok/degraded/fault/offline
  scenario.result      — a what-if scenario run completed
  asset.registered     — new device/asset registered
  command.updated      — a command's state machine advanced
"""

from __future__ import annotations

import json
from typing import Any

import structlog
from fastapi import WebSocket

logger = structlog.get_logger(__name__)


class ConnectionManager:
    """Thread-safe WebSocket connection pool with typed event broadcasting."""

    def __init__(self) -> None:
        # All active WebSocket connections
        self._connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        self._connections.append(websocket)
        logger.info("ws.client_connected", total=len(self._connections))

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a disconnected WebSocket."""
        try:
            self._connections.remove(websocket)
        except ValueError:
            pass
        logger.info("ws.client_disconnected", total=len(self._connections))

    async def broadcast(self, event: str, data: dict[str, Any], asset_id: str | None = None) -> None:
        """
        Broadcast a typed event to all connected clients.
        Silently removes any connections that have dropped.
        """
        payload = json.dumps(
            {
                "event": event,
                "asset_id": asset_id,
                "data": data,
            },
            default=str,  # handles datetime serialization
        )

        dead_connections: list[WebSocket] = []
        for connection in self._connections:
            try:
                await connection.send_text(payload)
            except Exception:
                dead_connections.append(connection)

        for dead in dead_connections:
            self.disconnect(dead)

        if self._connections:
            # NOTE: structlog's logger methods take the log message as a
            # positional "event" argument internally — a kwarg literally
            # named `event` collides with that and raises TypeError, so this
            # is deliberately `event_type`, not `event`.
            logger.debug(
                "ws.broadcast",
                event_type=event,
                asset_id=asset_id,
                recipients=len(self._connections),
            )

    # ── Typed broadcast helpers ───────────────────────────────────────────────

    async def broadcast_reading_updated(self, asset_id: str, values: dict[str, Any]) -> None:
        await self.broadcast("reading.updated", values, asset_id=asset_id)

    async def broadcast_alert_triggered(self, asset_id: str, alert: dict[str, Any]) -> None:
        await self.broadcast("alert.triggered", alert, asset_id=asset_id)

    async def broadcast_asset_status_changed(self, asset_id: str, status: str, health_score: float) -> None:
        await self.broadcast(
            "asset.status_changed",
            {"status": status, "health_score": health_score},
            asset_id=asset_id,
        )

    async def broadcast_scenario_result(self, station_id: str, result: dict[str, Any]) -> None:
        await self.broadcast("scenario.result", result, asset_id=station_id)

    async def broadcast_asset_registered(self, asset: dict[str, Any]) -> None:
        await self.broadcast("asset.registered", asset)

    async def broadcast_command_updated(self, command_id: str, state: str) -> None:
        await self.broadcast("command.updated", {"command_id": command_id, "state": state})

    @property
    def connection_count(self) -> int:
        return len(self._connections)


# Singleton — import and use this instance throughout the backend
ws_manager = ConnectionManager()
