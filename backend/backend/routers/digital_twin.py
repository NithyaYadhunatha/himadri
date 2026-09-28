"""
Router: Digital Twin live-telemetry API (Unity / PolarTwinDualBoard bridge).

GET  /api/devices, /api/devices/{deviceId}, /api/rooms,
     /api/rooms/{roomId}/devices, /api/telemetry/latest, /api/telemetry/{deviceId}
POST /api/v1/telemetry/ingest (canonical), /api/telemetry/ingest (legacy alias)
GET  /api/telemetry/commands/{gatewayId}/next
POST /api/v1/devices/{deviceId}/command (canonical), /api/devices/{deviceId}/command (legacy)
WS   /ws/digital-twin

Two routers are defined here rather than one: `router` carries the `/api`
prefix for the REST surface, `ws_router` is unprefixed so the websocket lands
at exactly `/ws/digital-twin` per the project's spec (not `/api/ws/digital-twin`).

Separate from the himadri/#-namespace asset pipeline (routers/devices.py,
services/mqtt_ingest.py) — this is the digitaltwin/#-namespace bridge for the
Unity 3D twin and its real PolarTwinDualBoard hardware, see
services/digitaltwin_bridge.py for the device catalog and state store.
"""

from __future__ import annotations

import hmac
import math
from typing import Any

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Response, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field, field_validator

from backend.config import settings
from backend.dependencies import require_bearer
from backend.services import digitaltwin_bridge
from backend.websocket.digital_twin_manager import digital_twin_ws

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api", tags=["Digital Twin"])
ws_router = APIRouter(tags=["Digital Twin"])


class DeviceCommand(BaseModel):
    command: str
    value: Any = None


class TelemetryReading(BaseModel):
    deviceId: str
    value: float
    unit: str = ""

    @field_validator("value")
    @classmethod
    def finite_value(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("value must be finite")
        return value


class TelemetryIngest(BaseModel):
    gatewayId: str = Field(min_length=1, max_length=128)
    timestamp: str | None = None
    readings: list[TelemetryReading] = Field(min_length=1, max_length=32)


def _require_ingest_key(x_device_key: str | None = Header(default=None)) -> None:
    configured = settings.DIGITAL_TWIN_INGEST_KEY
    if configured and (x_device_key is None or not hmac.compare_digest(x_device_key, configured)):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid device key")


@router.get("/devices", operation_id="list_digital_twin_devices")
async def list_devices() -> list[dict]:
    return digitaltwin_bridge.list_devices()


@router.get("/devices/{device_id}", operation_id="get_digital_twin_device")
async def get_device(device_id: str) -> dict:
    device = digitaltwin_bridge.get_device(device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown device")
    return device


@router.get("/rooms", operation_id="list_digital_twin_rooms")
async def list_rooms() -> list[dict]:
    return digitaltwin_bridge.list_rooms()


@router.get("/rooms/{room_id}/devices", operation_id="list_digital_twin_room_devices")
async def list_room_devices(room_id: str) -> list[dict]:
    return digitaltwin_bridge.list_room_devices(room_id)


@router.get("/telemetry/latest", operation_id="latest_digital_twin_telemetry")
async def latest_telemetry() -> list[dict]:
    return digitaltwin_bridge.list_devices()


@router.get("/telemetry/{device_id}", operation_id="get_digital_twin_telemetry")
async def get_telemetry(device_id: str) -> dict:
    device = digitaltwin_bridge.get_device(device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown device")
    return device


@router.post(
    "/v1/telemetry/ingest",
    dependencies=[Depends(_require_ingest_key)],
    operation_id="ingest_digital_twin_telemetry",
)
async def ingest_telemetry(body: TelemetryIngest) -> dict:
    unknown = sorted({reading.deviceId for reading in body.readings} - digitaltwin_bridge.DEVICE_CATALOG.keys())
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown device IDs: {', '.join(unknown)}",
        )
    readings = [reading.model_dump() for reading in body.readings]
    changed = await digitaltwin_bridge.ingest_readings(readings)
    return {
        "accepted": len(readings),
        "updated": [device["deviceId"] for device in changed],
        "gatewayId": body.gatewayId,
    }


@router.post(
    "/telemetry/ingest",
    dependencies=[Depends(_require_ingest_key)],
    include_in_schema=False,
)
async def ingest_telemetry_legacy(body: TelemetryIngest) -> dict:
    """Compatibility alias for gateways deployed before the v1 route."""
    return await ingest_telemetry(body)


@router.get(
    "/telemetry/commands/{gateway_id}/next",
    dependencies=[Depends(_require_ingest_key)],
    operation_id="next_digital_twin_hardware_command",
    responses={204: {"description": "No command queued"}},
)
async def next_hardware_command(gateway_id: str) -> Any:
    command = digitaltwin_bridge.take_hardware_command(gateway_id)
    if command is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return command


@router.post(
    "/v1/devices/{device_id}/command",
    dependencies=[Depends(require_bearer)],
    operation_id="send_digital_twin_command",
)
async def send_command(device_id: str, body: DeviceCommand) -> dict:
    accepted = await digitaltwin_bridge.publish_command(device_id, body.command, body.value)
    if not accepted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown device")
    return {"deviceId": device_id, "command": body.command, "value": body.value, "accepted": True}


@router.post(
    "/devices/{device_id}/command",
    dependencies=[Depends(require_bearer)],
    include_in_schema=False,
)
async def send_command_legacy(device_id: str, body: DeviceCommand) -> dict:
    return await send_command(device_id, body)


@ws_router.websocket("/ws/digital-twin")
async def digital_twin_stream(websocket: WebSocket) -> None:
    """Push-only live-telemetry stream for the Unity 3D twin. Clients don't
    need to send anything; the connection stays open until they disconnect."""
    await digital_twin_ws.connect(websocket)
    try:
        await websocket.send_json({"type": "CONNECTED", "devices": digitaltwin_bridge.list_devices()})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        digital_twin_ws.disconnect(websocket)
    except Exception as e:
        digital_twin_ws.disconnect(websocket)
        logger.warning("digital_twin_ws.client_error", error=str(e))
