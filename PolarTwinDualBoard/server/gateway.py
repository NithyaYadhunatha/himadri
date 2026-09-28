"""Raspberry Pi serial-to-HIMADRI telemetry gateway.

Reads newline-delimited JSON from the PolarTwin Arduino Uno and forwards the
available physical sensor readings to the backend's digital-twin ingest API.
"""

from __future__ import annotations

import json
import math
import os
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import requests
import serial


ARDUINO_PORT = os.getenv("ARDUINO_PORT", "/dev/ttyACM0")
ARDUINO_BAUD = int(os.getenv("ARDUINO_BAUD", "115200"))
BACKEND_URL = os.getenv("BACKEND_URL", "https://himadri.aus1in.me")
BACKEND_DEVICE_KEY = os.getenv("BACKEND_DEVICE_KEY", "")
BACKEND_TIMEOUT = float(os.getenv("BACKEND_TIMEOUT", "5"))
MAX_SERIAL_BUFFER = 16_384


class SerialLineBuffer:
    """Keep timeout-split serial fragments until a complete newline arrives."""

    def __init__(self, max_bytes: int = MAX_SERIAL_BUFFER) -> None:
        self._buffer = bytearray()
        self._max_bytes = max_bytes
        self.dropped_frames = 0

    def feed(self, chunk: bytes) -> list[str]:
        self._buffer.extend(chunk)
        lines: list[str] = []
        while b"\n" in self._buffer:
            raw, _, remainder = self._buffer.partition(b"\n")
            self._buffer = bytearray(remainder)
            lines.append(raw.rstrip(b"\r").decode("utf-8", errors="ignore"))
        if len(self._buffer) > self._max_bytes:
            self._buffer.clear()
            self.dropped_frames += 1
        return lines


def backend_ingest_urls(base_url: str) -> list[str]:
    """Accept an origin, /api/v1 base, or a complete ingest URL."""
    parsed = urlsplit(base_url.rstrip("/"))
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("BACKEND_URL must be an http(s) URL")
    path = parsed.path.rstrip("/")
    if path.endswith(("/api/v1/telemetry/ingest", "/api/telemetry/ingest")):
        paths = [path]
    elif path.endswith("/api/v1"):
        paths = [f"{path}/telemetry/ingest", f"{path[:-3]}/telemetry/ingest"]
    else:
        paths = [f"{path}/api/v1/telemetry/ingest", f"{path}/api/telemetry/ingest"]
    return list(dict.fromkeys(urlunsplit((parsed.scheme, parsed.netloc, candidate, "", "")) for candidate in paths))


def _finite_number(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def _reading(device_id: str, value: Any, unit: str) -> dict[str, Any] | None:
    if not _finite_number(value):
        return None
    return {"deviceId": device_id, "value": value, "unit": unit}


def backend_payload(packet: dict[str, Any]) -> dict[str, Any]:
    """Validate an Uno packet and convert it to the backend batch contract."""
    if packet.get("device") != "polar-twin-uno":
        raise ValueError("unexpected device identity")

    acceleration = packet.get("acceleration")
    system = packet.get("system")
    if not isinstance(acceleration, dict) or not isinstance(system, dict):
        raise ValueError("missing acceleration or system object")

    candidates = (
        _reading("sensor-dht-01", packet.get("temperature_c"), "°C"),
        _reading("sensor-humidity-01", packet.get("humidity_pct"), "%"),
        _reading("sensor-mq2-01", packet.get("gas_raw"), "ADC"),
        _reading("buzzer-01", int(system["buzzer_on"]), "state")
        if isinstance(system.get("buzzer_on"), bool)
        else None,
        _reading("sensor-ultrasonic-01", packet.get("distance_cm"), "cm"),
        _reading("sensor-ir-01", int(packet["ir_detected"]), "state")
        if isinstance(packet.get("ir_detected"), bool)
        else None,
        _reading("sensor-door-01", int(packet["hall_detected"]), "state")
        if isinstance(packet.get("hall_detected"), bool)
        else None,
        _reading("sensor-vibration-01", acceleration.get("tilt_deg"), "deg"),
    )
    readings = [reading for reading in candidates if reading is not None]
    if not readings:
        raise ValueError("packet contains no available sensor readings")

    return {
        "gatewayId": packet["device"],
        # timestamp_ms is Arduino uptime, not wall-clock time. Timestamp the
        # batch on the Raspberry Pi so backend/Unity clients receive UTC time.
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "readings": readings,
    }


def main() -> None:
    ingest_urls = backend_ingest_urls(BACKEND_URL)
    headers = {"Content-Type": "application/json"}
    if BACKEND_DEVICE_KEY:
        headers["X-Device-Key"] = BACKEND_DEVICE_KEY

    session = requests.Session()
    with serial.Serial(ARDUINO_PORT, ARDUINO_BAUD, timeout=2) as arduino:
        print(f"PolarTwin Raspberry Pi Gateway started: {ARDUINO_PORT} @ {ARDUINO_BAUD}")
        print(f"Backend ingest: {ingest_urls[0]} (fallback: {ingest_urls[-1]})")
        serial_lines = SerialLineBuffer()
        invalid_packets = 0
        last_invalid_warning = 0.0
        failure_count = 0
        next_backend_attempt = 0.0
        while True:
            chunk = arduino.read(max(1, arduino.in_waiting))
            if not chunk:
                continue
            for raw_line in serial_lines.feed(chunk):
                line = raw_line.strip()
                if not line:
                    continue
                start, end = line.find("{"), line.rfind("}")
                try:
                    if start < 0 or end <= start:
                        raise ValueError("incomplete JSON frame")
                    packet = json.loads(line[start : end + 1])
                    payload = backend_payload(packet)
                except (json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
                    invalid_packets += 1
                    now = time.monotonic()
                    if now - last_invalid_warning >= 10:
                        print(f"Rejected Arduino packet: {error} ({invalid_packets} rejected total)")
                        last_invalid_warning = now
                    continue

                if time.monotonic() < next_backend_attempt:
                    continue
                try:
                    last_error: requests.RequestException | None = None
                    for index, ingest_url in enumerate(ingest_urls):
                        response = session.post(
                            ingest_url,
                            json=payload,
                            headers=headers,
                            timeout=BACKEND_TIMEOUT,
                        )
                        if response.status_code not in {404, 405}:
                            response.raise_for_status()
                            if index:
                                ingest_urls.insert(0, ingest_urls.pop(index))
                            break
                        last_error = requests.HTTPError(
                            f"{response.status_code} for {ingest_url}: {response.text[:200]}",
                            response=response,
                        )
                    else:
                        raise requests.RequestException(
                            f"telemetry ingest route is unavailable; redeploy the backend ({last_error})"
                        )
                    failure_count = 0
                    next_backend_attempt = 0.0
                    print(f"Backend: {response.status_code}; readings: {len(payload['readings'])}")
                except requests.RequestException as error:
                    failure_count += 1
                    retry_seconds = min(60, 2 ** min(failure_count, 6))
                    next_backend_attempt = time.monotonic() + retry_seconds
                    print(f"Backend error: {error}; retrying in {retry_seconds}s")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nGateway stopped")
