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
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import WebSocket

logger = structlog.get_logger(__name__)


class ConnectionManager:
    """Thread-safe WebSocket connection pool with typed event broadcasting."""

    def __init__(self) -> None:
        # All active WebSocket connections
        self._connections: list[WebSocket] = []
        self._live_connections: dict[WebSocket, tuple[set[str], set[str] | None]] = {}

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
        self._live_connections.pop(websocket, None)
        logger.info("ws.client_disconnected", total=len(self._connections))

    def register_live(self, websocket: WebSocket, series: set[str], asset_ids: set[str] | None) -> None:
        self._live_connections[websocket] = (series, asset_ids)

    def update_live(self, websocket: WebSocket, series: set[str], asset_ids: set[str] | None) -> None:
        self._live_connections[websocket] = (series, asset_ids)

    async def broadcast(self, event: str, data: dict[str, Any], asset_id: str | None = None,
                        event_ts: datetime | None = None) -> None:
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

        for connection, (series_filter, station_assets) in list(self._live_connections.items()):
            if station_assets is not None and asset_id not in station_assets:
                continue
            messages: list[dict[str, Any]] = []
            if event == "reading.updated" and asset_id:
                for name, value in data.items():
                    key = f"{asset_id}.{name}"
                    if not series_filter or key in series_filter:
                        messages.append({"series_key": key, "ts": (event_ts or datetime.now(timezone.utc)).isoformat(), "value": value})
            elif event.startswith("alert."):
                live_event = event
                if event == "alert.triggered":
                    live_event = "alert.escalated" if str(data.get("message", "")).startswith("ESCALATED:") else "alert.created"
                messages.append({"event": live_event, "asset_id": asset_id, "data": data})
            for message in messages:
                try:
                    await connection.send_text(json.dumps(message, default=str))
                except Exception:
                    self.disconnect(connection)
                    break

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

    async def broadcast_reading_updated(self, asset_id: str, values: dict[str, Any], ts: datetime | None = None) -> None:
        await self.broadcast("reading.updated", values, asset_id=asset_id, event_ts=ts)

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
        return len(self._connections) + len(self._live_connections)


# Singleton — import and use this instance throughout the backend
ws_manager = ConnectionManager()
