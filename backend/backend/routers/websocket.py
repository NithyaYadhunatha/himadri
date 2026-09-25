"""
Router: WebSocket endpoint.
WS /ws — real-time event stream to frontend clients.
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from backend.config import settings
from backend.database.postgres import get_session_factory
from backend.models.tables import Asset
from backend.websocket.manager import ws_manager

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["WebSocket"])


@router.websocket("/live")
async def contract_live(websocket: WebSocket) -> None:
    """Authenticated series/station subscription from the v1 contract."""
    if websocket.headers.get("authorization") != f"Bearer {settings.API_SECRET_KEY}":
        await websocket.close(code=4401)
        return
    await websocket.accept()
    registered = False
    try:
        while True:
            payload = await websocket.receive_json()
            subscription = payload.get("subscribe", payload) if isinstance(payload, dict) else {}
            series = subscription.get("series", [])
            station = subscription.get("station")
            if (not isinstance(series, list) or not all(isinstance(s, str) for s in series)
                    or (station is not None and not isinstance(station, str))
                    or (not series and not station)):
                await websocket.send_json({"error": {"code": "VALIDATION_FAILED", "message": "Subscribe with series or station"}})
                continue
            asset_ids = None
            if station:
                async with get_session_factory()() as db:
                    asset_ids = set((await db.execute(select(Asset.id).where(Asset.station_id == station))).scalars().all())
            if registered:
                ws_manager.update_live(websocket, set(series), asset_ids)
            else:
                # The handshake was accepted above to allow a subscription
                # message before adding the socket to the broadcast pool.
                ws_manager.register_live(websocket, set(series), asset_ids)
                registered = True
            await websocket.send_json({"event": "subscribed", "series": series, "station": station})
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(websocket)


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
