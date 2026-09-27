"""
Digital Twin WebSocket connection manager — dedicated to /ws/digital-twin,
deliberately separate from backend.websocket.manager.ws_manager: a different
message contract ({"type":"DEVICE_UPDATE",...} vs {"event":...,"asset_id":...})
serving an unrelated data model (the digitaltwin/# room/device bridge, not the
Postgres-backed asset pipeline ws_manager serves).
"""

from __future__ import annotations

import json
from typing import Any

import structlog
from fastapi import WebSocket

logger = structlog.get_logger(__name__)


class DigitalTwinConnectionManager:
    """Plain push-only WebSocket connection pool — no per-connection filters."""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.append(websocket)
        logger.info("digital_twin_ws.client_connected", total=len(self._connections))

    def disconnect(self, websocket: WebSocket) -> None:
        try:
            self._connections.remove(websocket)
        except ValueError:
            pass
        logger.info("digital_twin_ws.client_disconnected", total=len(self._connections))

    async def broadcast(self, payload: dict[str, Any]) -> None:
        message = json.dumps(payload, default=str)
        dead: list[WebSocket] = []
        for connection in self._connections:
            try:
                await connection.send_text(message)
            except Exception:
                dead.append(connection)
        for connection in dead:
            self.disconnect(connection)

    @property
    def connection_count(self) -> int:
        return len(self._connections)


# Singleton — import and use this instance throughout the digital twin bridge.
digital_twin_ws = DigitalTwinConnectionManager()
