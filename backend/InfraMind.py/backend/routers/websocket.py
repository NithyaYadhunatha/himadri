"""
Router: WebSocket endpoint.
WS /ws — real-time event stream to frontend clients.
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.websocket.manager import ws_manager

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """
    WebSocket endpoint for real-time event streaming.

    Clients receive JSON events in this shape:
    {
        "event": "reading.updated" | "alert.triggered" | "asset.status_changed"
                 | "scenario.result" | "asset.registered" | "command.updated",
        "asset_id": "<id or null>",
        "data": { ... }
    }

    The client does not need to send any messages — this is a push-only channel.
    The connection stays open until the client disconnects.
    """
    await ws_manager.connect(websocket)
    try:
        # Send a welcome message so clients know they are connected
        await websocket.send_json(
            {
                "event": "connected",
                "asset_id": None,
                "data": {
                    "message": "Connected to HIMADRI real-time stream",
                    "active_connections": ws_manager.connection_count,
                },
            }
        )

        # Keep connection alive — wait for disconnect
        while True:
            # We don't process client messages, but we need to keep the loop alive
            # Any message from client is safely discarded
            await websocket.receive_text()

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
        logger.info("ws.client_disconnected_cleanly")
    except Exception as e:
        ws_manager.disconnect(websocket)
        logger.warning("ws.client_error", error=str(e))
