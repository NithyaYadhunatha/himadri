"""
MQTT Ingest — the second, standard IoT telemetry path (topic contract:
himadri/{station_id}/{asset_id}/{series_name}), alongside the demo PySide6
agent's HTTP heartbeat (backend/routers/agents.py). Real sensor
gateways/hardware publish directly here over Mosquitto — no bespoke HTTP
client needed — matching this project's original architecture brief's MQTT
contract; this backend had deliberately deviated from that brief to a
simpler HTTP-only heartbeat path, and this module reverses that decision
specifically for MQTT (an explicit "remote management" request), without
touching or removing the HTTP heartbeat path.

Payload contract (JSON):
    {"ts": "<ISO8601>", "value": <number>, "unit": "<string>",
     "source": "sensor"|"manual"|"simulated", "quality": <int 0-100>,
     "device_id": "<string>"}
`unit` must equal the asset's manifest-declared unit for this series
(POST /devices/manifest, backend/schemas/schemas.py's DeviceManifest) or the
message is rejected, never coerced — but most assets in this schema don't
have a manifest yet (it's optional, FR-100), so an asset with no manifest,
or no declaration for this particular series, accepts the reading
unvalidated rather than losing MQTT ingest for every asset that hasn't been
onboarded with a manifest.

Library choice — aiomqtt (the actively maintained fork of the old
asyncio-mqtt), not paho-mqtt's own client API directly: this backend's
ingest pipeline (backend/services/ingest_engine.py) is async-SQLAlchemy end
to end (backend/database/postgres.py's get_session_factory()), and
paho-mqtt 2.x's CallbackAPIVersion.VERSION2 callbacks run on paho's own
internal network thread, not this process's asyncio event loop — using it
here would mean bridging every single message back onto the loop with
run_coroutine_threadsafe. aiomqtt wraps paho-mqtt internally but exposes a
plain `async with aiomqtt.Client(...) as client: async for message in
client.messages:` iterator that runs directly on the same event loop as
everything else in this backend, so each message handler can
`async with factory() as db:` exactly like backend/main.py's
_offline_detection_loop does, with no thread-safety bridging at all.

Never crashes the listener on a malformed topic/payload or a DB error —
logs a warning and drops the message, and never lets the broker being
unreachable take down the rest of the app (the HTTP heartbeat path never
depends on MQTT being up): see _subscribe_loop()'s retry-forever posture.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime

import structlog
from sqlalchemy import select

try:
    # pyrefly: ignore [missing-import]
    import aiomqtt
except ImportError:  # pragma: no cover - see backend/requirements.txt
    aiomqtt = None  # type: ignore[assignment]

from backend.config import settings
from backend.database.postgres import get_session_factory
from backend.models.tables import Asset
from backend.services import ingest_engine

logger = structlog.get_logger(__name__)

MQTT_TOPIC_FILTER = "himadri/+/+/+"
_VALID_SOURCES = ("sensor", "manual", "simulated")

# How long to wait before retrying a connection after the broker was
# unreachable or the connection dropped — this loop runs for the lifetime of
# the app and must never give up (mirrors main.py's _offline_detection_loop
# non-fatal posture, just applied to a persistent subscription instead of a
# periodic poll).
_RECONNECT_DELAY_SECONDS = 5

_listener_task: asyncio.Task | None = None


def _parse_topic(topic: str) -> tuple[str, str, str] | None:
    """himadri/{station_id}/{asset_id}/{series_name} -> (station_id,
    asset_id, series_name), or None if the topic doesn't match the
    contract."""
    parts = topic.split("/")
    if len(parts) != 4 or parts[0] != "himadri":
        return None
    _, station_id, asset_id, series_name = parts
    if not station_id or not asset_id or not series_name:
        return None
    return station_id, asset_id, series_name


def _parse_payload(raw: bytes | bytearray | str) -> dict | None:
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
        return None
    return data if isinstance(data, dict) else None


async def _handle_message(topic: str, raw_payload: bytes | bytearray | str) -> None:
    """Parse one MQTT message and, if it's valid and the asset exists and is
    approved, run it through the shared ingest pipeline. Any failure here is
    logged and dropped — never raised back into the subscribe loop."""
    parsed_topic = _parse_topic(topic)
    if parsed_topic is None:
        logger.warning("mqtt_ingest.malformed_topic", topic=topic)
        return
    station_id, asset_id, series_name = parsed_topic

    payload = _parse_payload(raw_payload)
    if payload is None:
        logger.warning("mqtt_ingest.malformed_payload", topic=topic)
        return

    try:
        ts = str(payload["ts"])
        datetime.fromisoformat(ts)
        value = float(payload["value"])
        unit = str(payload["unit"])
        source = str(payload["source"])
        quality = int(payload["quality"])
        device_id = str(payload["device_id"])
    except (KeyError, TypeError, ValueError):
        logger.warning("mqtt_ingest.malformed_payload_fields", topic=topic, payload=payload)
        return

    if source not in _VALID_SOURCES:
        logger.warning("mqtt_ingest.invalid_source", topic=topic, source=source)
        return
    if not (0 <= quality <= 100):
        logger.warning("mqtt_ingest.invalid_quality", topic=topic, quality=quality)
        return

    factory = get_session_factory()
    async with factory() as db:
        try:
            asset_result = await db.execute(select(Asset).where(Asset.id == asset_id))
            asset = asset_result.scalar_one_or_none()

            # Unknown asset_id: there's no per-message API key to gate this
            # like /agent/heartbeat's X-API-Key, and MQTT telemetry alone
            # (no identity/category/station beyond bare strings) isn't
            # enough to safely auto-create an Asset row — that's what the
            # manifest-registration + pending-approval flow
            # (backend/routers/devices.py, FR-99…101) is for. Log and drop.
            if asset is None:
                logger.warning(
                    "mqtt_ingest.unknown_asset", asset_id=asset_id, station_id=station_id, series=series_name
                )
                return

            # Exists but not yet approved (FR-101 pending-device queue) —
            # same intent as the pending queue: don't ingest until approved.
            if not asset.approved:
                logger.warning("mqtt_ingest.asset_not_approved", asset_id=asset_id)
                return

            if asset.station_id != station_id:
                logger.warning(
                    "mqtt_ingest.station_mismatch",
                    asset_id=asset_id, topic_station=station_id, asset_station=asset.station_id,
                )
                return

            # Unit validation against the asset's manifest (FR-100), if it
            # has declared this series — per the contract, a mismatch is
            # rejected, never coerced. No manifest yet, or no declaration
            # for this series, accepts the reading unvalidated (see module
            # docstring).
            manifest = asset.manifest or {}
            manifest_series = {s.get("name"): s for s in manifest.get("series", []) if isinstance(s, dict)}
            declared = manifest_series.get(series_name)
            if declared is not None and declared.get("unit") != unit:
                logger.warning(
                    "mqtt_ingest.unit_mismatch",
                    asset_id=asset_id, series=series_name,
                    expected_unit=declared.get("unit"), got_unit=unit,
                )
                return

            result = await ingest_engine.ingest_reading(
                db,
                asset,
                values={series_name: value},
                units={series_name: unit},
                source=source,
                status="ok",
            )
            await db.commit()
            logger.info(
                "mqtt_ingest.reading_ingested",
                asset_id=asset_id, series=series_name, value=value, unit=unit,
                device_id=device_id, quality=quality, ts=ts,
                new_alerts=len(result.new_alerts),
            )
        except Exception as e:
            await db.rollback()
            logger.error("mqtt_ingest.ingest_error", asset_id=asset_id, topic=topic, error=str(e))


async def _subscribe_loop() -> None:
    """Runs for the lifetime of the app: connect, subscribe, consume — and
    on any disconnect/broker-unreachable error, log a warning and retry
    after a short delay rather than propagating (so Mosquitto being down
    never takes the rest of the app, or the HTTP heartbeat path, with it)."""
    if aiomqtt is None:
        logger.warning(
            "mqtt_ingest.library_missing",
            detail="aiomqtt not installed (see backend/requirements.txt) — MQTT ingest disabled",
        )
        return

    while True:
        try:
            async with aiomqtt.Client(settings.MQTT_BROKER_HOST, port=settings.MQTT_BROKER_PORT) as client:
                logger.info("mqtt_ingest.connected", host=settings.MQTT_BROKER_HOST, port=settings.MQTT_BROKER_PORT)
                await client.subscribe(MQTT_TOPIC_FILTER)
                async for message in client.messages:
                    try:
                        await _handle_message(str(message.topic), message.payload)
                    except Exception as e:
                        logger.error("mqtt_ingest.message_handler_error", topic=str(message.topic), error=str(e))
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(
                "mqtt_ingest.broker_unreachable",
                host=settings.MQTT_BROKER_HOST, port=settings.MQTT_BROKER_PORT,
                error=str(e), retry_in=_RECONNECT_DELAY_SECONDS,
            )
            await asyncio.sleep(_RECONNECT_DELAY_SECONDS)


async def start() -> None:
    """Start the background MQTT subscribe loop. Called from main.py's
    lifespan startup, gated there by settings.MQTT_ENABLED. Non-fatal by
    construction — this only schedules the background task and returns
    immediately; a broker that's down or unreachable is handled entirely
    inside _subscribe_loop()'s own retry, never raised here, so it can never
    block or fail app startup."""
    global _listener_task
    _listener_task = asyncio.create_task(_subscribe_loop())
    logger.info("mqtt_ingest.listener_started")


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
        logger.info("mqtt_ingest.listener_stopped")
