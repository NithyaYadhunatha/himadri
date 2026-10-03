"""Raspberry Pi serial-to-HIMADRI telemetry gateway.

Reads newline-delimited JSON from the PolarTwin Arduino Uno and forwards the
available physical sensor readings to the backend's digital-twin ingest API.
"""

from __future__ import annotations

import contextlib
import json
import math
import os
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote, urlsplit, urlunsplit

import requests
import serial


ARDUINO_PORT = os.getenv("ARDUINO_PORT", "/dev/ttyUSB0")
ARDUINO_BAUD = int(os.getenv("ARDUINO_BAUD", "115200"))
# Prefer the current deployed route. backend_ingest_urls() also tries the
# compatibility route when an older deployment or explicit URL is used.
BACKEND_URL = os.getenv(
    "BACKEND_URL", "https://himadri.aus1in.me/api/v1/telemetry/ingest"
)
BACKEND_DEVICE_KEY = os.getenv("BACKEND_DEVICE_KEY", "")
BACKEND_TIMEOUT = float(os.getenv("BACKEND_TIMEOUT", "5"))
MAX_SERIAL_BUFFER = 16_384
COMMAND_POLL_SECONDS = float(os.getenv("COMMAND_POLL_SECONDS", "1"))
HALL_EFFECT_DEVICE_ID = "sensor-door-01"  # Legacy Unity ID; physical Hall module on Uno D10.
PI_HARDWARE_ENABLED = os.getenv("PI_HARDWARE_ENABLED", "1") != "0"
PI_PROXIMITY_WARNING_CM = float(os.getenv("PI_PROXIMITY_WARNING_CM", "20"))


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
    if path.endswith("/api/v1/telemetry/ingest"):
        legacy = path.replace("/api/v1/telemetry/ingest", "/api/telemetry/ingest")
        paths = [path, legacy]
    elif path.endswith("/api/telemetry/ingest"):
        versioned = path.replace("/api/telemetry/ingest", "/api/v1/telemetry/ingest")
        paths = [versioned, path]
    elif path.endswith("/api/v1"):
        paths = [f"{path}/telemetry/ingest", f"{path[:-3]}/telemetry/ingest"]
    else:
        paths = [f"{path}/api/v1/telemetry/ingest", f"{path}/api/telemetry/ingest"]
    return list(dict.fromkeys(urlunsplit((parsed.scheme, parsed.netloc, candidate, "", "")) for candidate in paths))


def backend_command_url(ingest_url: str, gateway_id: str) -> str:
    parsed = urlsplit(ingest_url)
    prefix, separator, _ = parsed.path.rpartition("/telemetry/ingest")
    if not separator:
        raise ValueError("ingest URL does not end in /telemetry/ingest")
    path = f"{prefix}/telemetry/commands/{quote(gateway_id, safe='')}/next"
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def _wire_command(body: Any, gateway_id: str) -> str:
    if not isinstance(body, dict) or body.get("gatewayId") != gateway_id:
        raise ValueError("invalid hardware command envelope")
    command = body.get("wireCommand")
    if command in {"BUZZER:ON", "BUZZER:OFF"}:
        return command
    if isinstance(command, str):
        prefix, _, angle_text = command.partition(":")
        if prefix in {"SERVO", "WRIST"} and angle_text.isdigit() and 0 <= int(angle_text) <= 180:
            return command
    raise ValueError("unsupported hardware command")


def _finite_number(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def _reading(device_id: str, value: Any, unit: str) -> dict[str, Any] | None:
    if not _finite_number(value):
        return None
    return {"deviceId": device_id, "value": value, "unit": unit}


def merge_pi_readings(
    packet: dict[str, Any], snapshot: dict[str, float | bool | None]
) -> dict[str, Any]:
    """Replace the Uno's null placeholders with current Pi GPIO readings."""
    merged = dict(packet)
    distance = snapshot.get("distance_cm")
    ir_detected = snapshot.get("ir_detected")
    merged["distance_cm"] = distance if _finite_number(distance) else None
    merged["ir_detected"] = ir_detected if isinstance(ir_detected, bool) else None

    alerts = dict(merged.get("alerts") or {})
    alerts["proximity"] = bool(
        _finite_number(merged["distance_cm"])
        and merged["distance_cm"] <= PI_PROXIMITY_WARNING_CM
    )
    merged["alerts"] = alerts
    state = dict(merged.get("state") or {})
    state["occupancy"] = merged["ir_detected"] is True
    merged["state"] = state
    system = dict(merged.get("system") or {})
    servo_angle = snapshot.get("servo_angle")
    system["servo_angle"] = (
        servo_angle
        if isinstance(servo_angle, int)
        and not isinstance(servo_angle, bool)
        and 0 <= servo_angle <= 180
        else None
    )
    wrist_angle = snapshot.get("wrist_angle")
    system["wrist_angle"] = (
        wrist_angle
        if isinstance(wrist_angle, int)
        and not isinstance(wrist_angle, bool)
        and 0 <= wrist_angle <= 180
        else None
    )
    merged["system"] = system
    return merged


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
        _reading("servo-01", system.get("servo_angle"), "deg"),
        _reading("servo-02", system.get("wrist_angle"), "deg"),
        _reading("sensor-ultrasonic-01", packet.get("distance_cm"), "cm"),
        _reading("sensor-ir-01", int(packet["ir_detected"]), "state")
        if isinstance(packet.get("ir_detected"), bool)
        else None,
        _reading(HALL_EFFECT_DEVICE_ID, int(packet["hall_detected"]), "state")
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


def open_arduino() -> serial.Serial | None:
    """Open the Uno port, or return None to run in Pi-only (robotic arm) mode."""
    if ARDUINO_PORT.strip().lower() in {"", "none"}:
        return None
    try:
        return serial.Serial(ARDUINO_PORT, ARDUINO_BAUD, timeout=0.25)
    except (serial.SerialException, OSError) as error:
        print(f"Arduino unavailable ({error}); running in Pi-only mode (servos, HC-SR04, IR)")
        return None


def main() -> None:
    ingest_urls = backend_ingest_urls(BACKEND_URL)
    gateway_id = "polar-twin-uno"
    command_urls = [backend_command_url(url, gateway_id) for url in ingest_urls]
    headers = {"Content-Type": "application/json"}
    if BACKEND_DEVICE_KEY:
        headers["X-Device-Key"] = BACKEND_DEVICE_KEY

    hardware = None
    if PI_HARDWARE_ENABLED:
        from pi_hardware import PiHardware

        hardware = PiHardware()
        hardware.start()
        print(
            f"Pi hardware: HC-SR04 BCM{hardware.trigger_pin}/{hardware.echo_pin}, "
            f"IR BCM{hardware.ir_pin}, "
            f"arm servo BCM{hardware.servo_pin}, wrist servo BCM{hardware.wrist_pin}"
        )

    session = requests.Session()
    try:
      with (open_arduino() or contextlib.nullcontext()) as arduino:
          print(f"PolarTwin Raspberry Pi Gateway started: {ARDUINO_PORT if arduino else 'Pi-only (no Uno)'} @ {ARDUINO_BAUD}")
          print(f"Backend ingest: {ingest_urls[0]} (fallback: {ingest_urls[-1]})")
          serial_lines = SerialLineBuffer()
          invalid_packets = 0
          last_invalid_warning = 0.0
          failure_count = 0
          next_backend_attempt = 0.0
          next_command_poll = 0.0
          last_command_warning = 0.0
          next_pi_report = 0.0
          while True:
            now = time.monotonic()
            if now >= next_command_poll:
                next_command_poll = now + max(0.25, COMMAND_POLL_SECONDS)
                try:
                    for index, command_url in enumerate(command_urls):
                        response = session.get(command_url, headers=headers, timeout=BACKEND_TIMEOUT)
                        if response.status_code in {404, 405}:
                            continue
                        if response.status_code == 204:
                            if index:
                                command_urls.insert(0, command_urls.pop(index))
                            break
                        response.raise_for_status()
                        command = _wire_command(response.json(), gateway_id)
                        if command.startswith(("SERVO:", "WRIST:")):
                            if hardware is None:
                                raise ValueError("Pi servo hardware is disabled")
                            target, _, angle_text = command.partition(":")
                            if target == "SERVO":
                                hardware.set_servo_angle(int(angle_text))
                            else:
                                hardware.set_wrist_angle(int(angle_text))
                        else:
                            if arduino is None:
                                raise ValueError("Arduino not connected; cannot send " + command)
                            arduino.write((command + "\n").encode("ascii"))
                            arduino.flush()
                        if index:
                            command_urls.insert(0, command_urls.pop(index))
                        print(f"Hardware command: {command}")
                        break
                except (requests.RequestException, ValueError, TypeError, json.JSONDecodeError) as error:
                    if now - last_command_warning >= 30:
                        print(f"Command polling unavailable: {error}")
                        last_command_warning = now

            if arduino is None:
                # No Uno: report Pi-owned readings (servo angles, HC-SR04, IR) at ~1 Hz.
                time.sleep(0.25)
                if now < next_pi_report or hardware is None:
                    continue
                next_pi_report = now + 1.0
                lines = [json.dumps({"device": "polar-twin-uno", "acceleration": {}, "system": {}})]
            else:
                chunk = arduino.read(max(1, arduino.in_waiting))
                if not chunk:
                    continue
                lines = serial_lines.feed(chunk)
            for raw_line in lines:
                line = raw_line.strip()
                if not line:
                    continue
                start, end = line.find("{"), line.rfind("}")
                try:
                    if start < 0 or end <= start:
                        raise ValueError("incomplete JSON frame")
                    packet = json.loads(line[start : end + 1])
                    if hardware is not None:
                        packet = merge_pi_readings(packet, hardware.snapshot())
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
    finally:
        if hardware is not None:
            hardware.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nGateway stopped")
