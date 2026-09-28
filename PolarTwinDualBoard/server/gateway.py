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

import requests
import serial


ARDUINO_PORT = os.getenv("ARDUINO_PORT", "/dev/ttyACM0")
ARDUINO_BAUD = int(os.getenv("ARDUINO_BAUD", "115200"))
BACKEND_URL = os.getenv("BACKEND_URL", "https://himadri.aus1in.me")
BACKEND_DEVICE_KEY = os.getenv("BACKEND_DEVICE_KEY", "")
BACKEND_TIMEOUT = float(os.getenv("BACKEND_TIMEOUT", "5"))


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
    ingest_url = f"{BACKEND_URL.rstrip('/')}/api/telemetry/ingest"
    headers = {"Content-Type": "application/json"}
    if BACKEND_DEVICE_KEY:
        headers["X-Device-Key"] = BACKEND_DEVICE_KEY

    session = requests.Session()
    with serial.Serial(ARDUINO_PORT, ARDUINO_BAUD, timeout=2) as arduino:
        print(f"PolarTwin Raspberry Pi Gateway started: {ARDUINO_PORT} @ {ARDUINO_BAUD}")
        print(f"Backend ingest: {ingest_url}")
        while True:
            line = arduino.readline().decode("utf-8", errors="ignore").strip()
            if not line:
                continue

            try:
                packet = json.loads(line)
                payload = backend_payload(packet)
            except json.JSONDecodeError:
                print("Invalid JSON:", line)
                continue
            except (KeyError, TypeError, ValueError) as error:
                print("Rejected Arduino packet:", error)
                continue

            try:
                response = session.post(
                    ingest_url,
                    json=payload,
                    headers=headers,
                    timeout=BACKEND_TIMEOUT,
                )
                response.raise_for_status()
                print(f"Backend: {response.status_code}; readings: {len(payload['readings'])}")
            except requests.RequestException as error:
                print("Backend error:", error)
                time.sleep(2)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nGateway stopped")
