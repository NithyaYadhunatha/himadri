"""
Digital Twin bridge -- MQTT subscriber -> in-memory device state store ->
WebSocket broadcast, for the Unity/PolarTwinDualBoard live-telemetry feature.
Separate from, and non-invasive to, the existing himadri/#-namespace asset
pipeline in services/mqtt_ingest.py / services/ingest_engine.py: different
topic namespace (digitaltwin/# vs himadri/#), different data model (a small
fixed room/device catalog vs the Postgres Station/Zone/Asset/Reading tables),
same Mosquitto broker (backend.config.settings.MQTT_BROKER_HOST/PORT).

Device catalog below mirrors the 14 devices built in the
Unity project's Assets/Editor/DigitalTwinSceneBuilder.cs (the Data(...) calls
in PopulateEnvironment/PopulateSafety/PopulateEquipment), plus `servo-01`,
which is a Pi-owned physical actuator exposed through the API.

Nine devices have a real sensor/actuator on the PolarTwinDualBoard
rig (see PolarTwin/himadri/PolarTwinDualBoard/docs/architecture.md). The rest
are either backend-derived from a sibling device's status (status-led-01,
equipment-state-01, failure-indicator-01, occupancy-indicator-01, via
DERIVED_RULES below -- ported from Unity's own MockDataProvider.UpdateIndicator
calls) or purely virtual/software-only (motor-01, relay-01 -- command-settable,
optimistically acknowledged here, no hardware confirmation path).

This module is the SOLE authority on `status` (NORMAL/WARNING/CRITICAL/OFFLINE)
-- the ESP8266 publishes raw value/unit only, so Unity's warning/critical
thresholds live in exactly one place outside the Unity project itself (here),
not duplicated into firmware where they could silently drift.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict, deque
import json
import math
import time
import uuid
from typing import Any, Literal

import structlog

try:
    # pyrefly: ignore [missing-import]
    import aiomqtt
except ImportError:  # pragma: no cover - see backend/requirements.txt
    aiomqtt = None  # type: ignore[assignment]

from backend.config import settings
from backend.websocket.digital_twin_manager import digital_twin_ws

logger = structlog.get_logger(__name__)

MQTT_TOPIC_FILTER = "digitaltwin/device/+/telemetry"
MQTT_COMMAND_TOPIC = "digitaltwin/device/{device_id}/command"

# How long to wait before retrying a connection after the broker was
# unreachable or the connection dropped — mirrors mqtt_ingest.py's posture.
_RECONNECT_DELAY_SECONDS = 5

Kind = Literal["numeric", "boolean", "derived", "virtual"]

DEVICE_CATALOG: dict[str, dict[str, Any]] = {
    "sensor-dht-01": dict(name="Temperature Sensor", deviceType="temperature", roomId="room-01", unit="°C", warning=28, critical=32, kind="numeric", inverse=False),
    "sensor-humidity-01": dict(name="Humidity Sensor", deviceType="humidity", roomId="room-01", unit="%", warning=65, critical=75, kind="numeric", inverse=False),
    "sensor-mq2-01": dict(name="MQ-2 Air Quality Sensor", deviceType="gas", roomId="room-01", unit="ADC", warning=400, critical=700, kind="numeric", inverse=False),
    "buzzer-01": dict(name="Alarm Buzzer", deviceType="buzzer", roomId="room-01", unit="state", warning=1, critical=1, kind="boolean", inverse=False),
    "status-led-01": dict(name="RGB Status LED", deviceType="status-led", roomId="room-01", unit="state", warning=1, critical=1, kind="derived", inverse=False),
    "sensor-ultrasonic-01": dict(name="HC-SR04 Distance Sensor", deviceType="distance", roomId="room-02", unit="cm", warning=120, critical=40, kind="numeric", inverse=True),
    "sensor-ir-01": dict(name="IR Presence Sensor", deviceType="ir", roomId="room-02", unit="state", warning=1, critical=1, kind="boolean", inverse=False),
    "servo-01": dict(name="Position Servo", deviceType="servo", roomId="room-02", unit="deg", warning=181, critical=181, kind="numeric", inverse=False),
    # Keep the legacy Unity device ID so existing WebGL builds continue to
    # receive updates; the physical channel is the Uno D10 Hall-effect module.
    "sensor-door-01": dict(name="Hall Effect Sensor", deviceType="hall-effect", roomId="room-02", unit="state", warning=1, critical=1, kind="boolean", inverse=False),
    "occupancy-indicator-01": dict(name="Occupancy Indicator", deviceType="occupancy", roomId="room-02", unit="state", warning=1, critical=1, kind="derived", inverse=False),
    "sensor-vibration-01": dict(name="Vibration / Tilt Sensor", deviceType="vibration", roomId="room-03", unit="deg", warning=4.5, critical=8, kind="numeric", inverse=False),
    "motor-01": dict(name="Drive Motor", deviceType="motor", roomId="room-03", unit="RPM", warning=1500, critical=1750, kind="virtual", inverse=False),
    "relay-01": dict(name="Control Relay", deviceType="relay", roomId="room-03", unit="state", warning=1, critical=1, kind="virtual", inverse=False),
    "equipment-state-01": dict(name="Equipment State", deviceType="equipment-state", roomId="room-03", unit="state", warning=1, critical=1, kind="derived", inverse=False),
    "failure-indicator-01": dict(name="Failure Indicator", deviceType="failure-indicator", roomId="room-03", unit="state", warning=1, critical=1, kind="derived", inverse=False),
}

ROOM_NAMES: dict[str, str] = {
    "room-01": "ROOM 1 — ENVIRONMENT MONITORING",
    "room-02": "ROOM 2 — SAFETY & OCCUPANCY",
    "room-03": "ROOM 3 — EQUIPMENT / MACHINE MONITORING",
}

# derived_id -> (source_id, normal_text, alert_text) -- ported verbatim from
# MockDataProvider.cs's three UpdateIndicator calls, plus occupancy-indicator-01
# added per the project owner's explicit choice to derive it from sensor-ir-01.
DERIVED_RULES: dict[str, tuple[str, str, str]] = {
    "status-led-01": ("sensor-mq2-01", "NORMAL", "ALERT"),
    "failure-indicator-01": ("sensor-vibration-01", "HEALTHY", "FAULT"),
    "equipment-state-01": ("motor-01", "STOPPED", "RUNNING"),
    "occupancy-indicator-01": ("sensor-ir-01", "VACANT", "OCCUPIED"),
}


def _now_ms() -> int:
    return int(time.time() * 1000)


def _initial_state(device_id: str) -> dict[str, Any]:
    meta = DEVICE_CATALOG[device_id]
    return {
        "deviceId": device_id, "deviceName": meta["name"], "deviceType": meta["deviceType"],
        "roomId": meta["roomId"], "value": 0, "displayValue": "", "unit": meta["unit"],
        "status": "OFFLINE", "timestamp": _now_ms(),
    }


_state: dict[str, dict[str, Any]] = {device_id: _initial_state(device_id) for device_id in DEVICE_CATALOG}
_lock = asyncio.Lock()

# Hardware commands are deliberately delivered over the same authenticated
# HTTP boundary as telemetry.  The Raspberry Pi polls this short in-memory
# queue and writes the returned wire command to the Uno USB serial port.  This
# keeps browser clients away from device credentials and works even when the
# station cannot accept inbound connections.
_hardware_commands: dict[str, deque[dict[str, Any]]] = defaultdict(deque)
_HARDWARE_GATEWAY_ID = "polar-twin-uno"
_HARDWARE_COMMANDS: dict[str, tuple[str, str]] = {
    "buzzer-01": ("BUZZER:OFF", "BUZZER:ON"),
}


def compute_numeric_status(value: float, warning: float, critical: float, inverse: bool) -> str:
    if inverse:
        if value <= critical:
            return "CRITICAL"
        if value <= warning:
            return "WARNING"
        return "NORMAL"
    if value >= critical:
        return "CRITICAL"
    if value >= warning:
        return "WARNING"
    return "NORMAL"


def _device_update_message(device: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "DEVICE_UPDATE",
        "deviceId": device["deviceId"],
        "roomId": device["roomId"],
        "data": {
            "value": device["value"], "displayValue": device["displayValue"],
            "unit": device["unit"], "status": device["status"],
        },
        "timestamp": device["timestamp"],
    }


async def _set_device(device_id: str, value: float, display_value: str = "", status: str | None = None) -> list[dict[str, Any]]:
    """Update one device's state (computing status if not given), re-run any
    derived rule whose source is this device, and return every device dict
    that changed (for the caller to broadcast)."""
    if device_id not in DEVICE_CATALOG:
        return []
    meta = DEVICE_CATALOG[device_id]
    if not display_value and device_id == "sensor-door-01":
        display_value = "MAGNET DETECTED" if value >= 0.5 else "FIELD CLEAR"
    elif not display_value and device_id == "servo-01":
        display_value = f"{int(value)}°"
    if status is None:
        if meta["kind"] == "numeric":
            status = compute_numeric_status(value, meta["warning"], meta["critical"], meta["inverse"])
        elif meta["kind"] == "boolean":
            status = "WARNING" if value else "NORMAL"
        else:
            status = "NORMAL"

    updated: dict[str, Any] = {
        "deviceId": device_id, "deviceName": meta["name"], "deviceType": meta["deviceType"],
        "roomId": meta["roomId"], "value": value, "displayValue": display_value,
        "unit": meta["unit"], "status": status, "timestamp": _now_ms(),
    }
    async with _lock:
        _state[device_id] = updated
    changed = [updated]

    for derived_id, (source_id, normal_text, alert_text) in DERIVED_RULES.items():
        if source_id != device_id:
            continue
        derived_meta = DEVICE_CATALOG[derived_id]
        derived_value = 0 if status == "NORMAL" else 1
        derived_updated = {
            "deviceId": derived_id, "deviceName": derived_meta["name"], "deviceType": derived_meta["deviceType"],
            "roomId": derived_meta["roomId"], "value": derived_value,
            "displayValue": alert_text if derived_value else normal_text,
            "unit": derived_meta["unit"], "status": status, "timestamp": _now_ms(),
        }
        async with _lock:
            _state[derived_id] = derived_updated
        changed.append(derived_updated)

    return changed


async def _handle_message(topic: str, raw_payload: bytes | bytearray | str) -> None:
    parts = topic.split("/")
    if len(parts) != 4 or parts[0] != "digitaltwin" or parts[1] != "device" or parts[3] != "telemetry":
        return
    device_id = parts[2]
    if device_id not in DEVICE_CATALOG:
        logger.warning("digitaltwin_bridge.unknown_device", device_id=device_id, topic=topic)
        return

    try:
        payload = json.loads(raw_payload)
    except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
        logger.warning("digitaltwin_bridge.malformed_payload", topic=topic)
        return
    if not isinstance(payload, dict) or "value" not in payload:
        logger.warning("digitaltwin_bridge.missing_value", topic=topic, payload=payload)
        return
    try:
        value = float(payload["value"])
    except (TypeError, ValueError):
        logger.warning("digitaltwin_bridge.bad_value", topic=topic, payload=payload)
        return

    changed = await _set_device(device_id, value)
    for device in changed:
        await digital_twin_ws.broadcast(_device_update_message(device))
    logger.info("digitaltwin_bridge.telemetry", device_id=device_id, value=value, changed=len(changed))


async def ingest_readings(readings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Apply a validated HTTP gateway batch and broadcast every resulting
    device change through the same WebSocket path used by MQTT telemetry."""
    changed_devices: list[dict[str, Any]] = []
    for reading in readings:
        changed = await _set_device(reading["deviceId"], float(reading["value"]))
        changed_devices.extend(changed)
        for device in changed:
            await digital_twin_ws.broadcast(_device_update_message(device))
    logger.info(
        "digitaltwin_bridge.http_telemetry",
        readings=len(readings),
        changed=len(changed_devices),
    )
    return changed_devices


_listener_task: asyncio.Task | None = None
_publisher_client: "aiomqtt.Client | None" = None


async def _subscribe_loop() -> None:
    """Runs for the lifetime of the app: connect, subscribe, consume — and on
    any disconnect/broker-unreachable error, log a warning and retry after a
    short delay rather than propagating (mirrors mqtt_ingest.py exactly)."""
    global _publisher_client
    if aiomqtt is None:
        logger.warning("digitaltwin_bridge.library_missing", detail="aiomqtt not installed — digital twin bridge disabled")
        return

    while True:
        try:
            async with aiomqtt.Client(settings.MQTT_BROKER_HOST, port=settings.MQTT_BROKER_PORT) as client:
                _publisher_client = client
                logger.info("digitaltwin_bridge.connected", host=settings.MQTT_BROKER_HOST, port=settings.MQTT_BROKER_PORT)
                await client.subscribe(MQTT_TOPIC_FILTER)
                async for message in client.messages:
                    try:
                        await _handle_message(str(message.topic), message.payload)
                    except Exception as e:
                        logger.error("digitaltwin_bridge.message_handler_error", topic=str(message.topic), error=str(e))
        except asyncio.CancelledError:
            _publisher_client = None
            raise
        except Exception as e:
            _publisher_client = None
            logger.warning(
                "digitaltwin_bridge.broker_unreachable",
                host=settings.MQTT_BROKER_HOST, port=settings.MQTT_BROKER_PORT,
                error=str(e), retry_in=_RECONNECT_DELAY_SECONDS,
            )
            await asyncio.sleep(_RECONNECT_DELAY_SECONDS)


async def start() -> None:
    """Start the background MQTT subscribe loop. Called from main.py's
    lifespan startup, gated by settings.MQTT_ENABLED. Non-fatal by
    construction, same posture as mqtt_ingest.start()."""
    global _listener_task
    _listener_task = asyncio.create_task(_subscribe_loop())
    logger.info("digitaltwin_bridge.listener_started")


async def stop() -> None:
    """Cancel the background MQTT subscribe loop. Called from main.py's
    lifespan shutdown."""
    global _listener_task
    if _listener_task is not None:
        _listener_task.cancel()
        try:
            await _listener_task
        except asyncio.CancelledError:
            pass
        _listener_task = None
        logger.info("digitaltwin_bridge.listener_stopped")


def list_devices() -> list[dict[str, Any]]:
    return list(_state.values())


def get_device(device_id: str) -> dict[str, Any] | None:
    return _state.get(device_id)


def list_rooms() -> list[dict[str, Any]]:
    return [{"roomId": room_id, "roomName": name} for room_id, name in ROOM_NAMES.items()]


def list_room_devices(room_id: str) -> list[dict[str, Any]]:
    return [device for device in _state.values() if device["roomId"] == room_id]


async def publish_command(device_id: str, command: str, value: Any) -> bool:
    """Publish an actuator command to the ESP8266 over MQTT, and for purely
    virtual devices (no hardware ack path) also optimistically update the
    in-memory store + broadcast immediately."""
    if device_id not in DEVICE_CATALOG:
        return False

    if device_id in _HARDWARE_COMMANDS and command == "SET_STATE":
        off_command, on_command = _HARDWARE_COMMANDS[device_id]
        enabled = bool(value)
        _hardware_commands[_HARDWARE_GATEWAY_ID].append({
            "commandId": uuid.uuid4().hex,
            "gatewayId": _HARDWARE_GATEWAY_ID,
            "deviceId": device_id,
            "wireCommand": on_command if enabled else off_command,
            "value": enabled,
            "queuedAt": _now_ms(),
        })
    elif device_id == "servo-01":
        if (
            command != "SET_ANGLE"
            or isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
            or int(value) != value
            or not 0 <= int(value) <= 180
        ):
            return False
        angle = int(value)
        _hardware_commands[_HARDWARE_GATEWAY_ID].append({
            "commandId": uuid.uuid4().hex,
            "gatewayId": _HARDWARE_GATEWAY_ID,
            "deviceId": device_id,
            "wireCommand": f"SERVO:{angle}",
            "value": angle,
            "queuedAt": _now_ms(),
        })

    if _publisher_client is not None:
        try:
            await _publisher_client.publish(
                MQTT_COMMAND_TOPIC.format(device_id=device_id),
                json.dumps({"deviceId": device_id, "command": command, "value": value}),
            )
        except Exception as e:
            logger.warning("digitaltwin_bridge.command_publish_failed", device_id=device_id, error=str(e))
    else:
        logger.warning("digitaltwin_bridge.command_no_broker_connection", device_id=device_id)

    if DEVICE_CATALOG[device_id]["kind"] == "virtual":
        is_on = bool(value)
        changed = await _set_device(
            device_id, 1.0 if is_on else 0.0,
            display_value="ON" if is_on else "OFF",
            status="WARNING" if is_on else "NORMAL",
        )
        for device in changed:
            await digital_twin_ws.broadcast(_device_update_message(device))

    return True


def take_hardware_command(gateway_id: str) -> dict[str, Any] | None:
    """Return the next serial command for a gateway using at-most-once delivery."""
    queue = _hardware_commands.get(gateway_id)
    if not queue:
        return None
    return queue.popleft()
