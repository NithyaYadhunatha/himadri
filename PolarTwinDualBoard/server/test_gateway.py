"""Contract tests for the Raspberry Pi serial-to-backend gateway."""

from __future__ import annotations

import unittest
import sys
from pathlib import Path
from types import ModuleType

# These unit tests exercise pure conversion/URL logic and must never open a
# physical serial port.  Allow them to run on development machines where the
# Raspberry Pi's pyserial dependency has not been installed yet.
if "serial" not in sys.modules:
    serial_stub = ModuleType("serial")
    serial_stub.Serial = object  # type: ignore[attr-defined]
    sys.modules["serial"] = serial_stub
if "requests" not in sys.modules:
    requests_stub = ModuleType("requests")
    requests_stub.Session = object  # type: ignore[attr-defined]
    requests_stub.RequestException = Exception  # type: ignore[attr-defined]
    requests_stub.HTTPError = Exception  # type: ignore[attr-defined]
    sys.modules["requests"] = requests_stub

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gateway


class GatewayContractTest(unittest.TestCase):
    def test_deployed_ingest_url_is_used_exactly(self) -> None:
        self.assertEqual(
            gateway.backend_ingest_urls(
                "https://himadri.aus1in.me/api/telemetry/ingest"
            ),
            ["https://himadri.aus1in.me/api/telemetry/ingest"],
        )

    def test_origin_supports_versioned_then_legacy_routes(self) -> None:
        self.assertEqual(
            gateway.backend_ingest_urls("https://himadri.aus1in.me"),
            [
                "https://himadri.aus1in.me/api/v1/telemetry/ingest",
                "https://himadri.aus1in.me/api/telemetry/ingest",
            ],
        )

    def test_command_poll_url_tracks_ingest_route(self) -> None:
        self.assertEqual(
            gateway.backend_command_url(
                "https://himadri.aus1in.me/api/telemetry/ingest",
                "polar-twin-uno",
            ),
            "https://himadri.aus1in.me/api/telemetry/commands/polar-twin-uno/next",
        )

    def test_only_supported_buzzer_wire_commands_are_accepted(self) -> None:
        envelope = {
            "gatewayId": "polar-twin-uno",
            "wireCommand": "BUZZER:ON",
        }
        self.assertEqual(
            gateway._wire_command(envelope, "polar-twin-uno"),
            "BUZZER:ON",
        )
        with self.assertRaises(ValueError):
            gateway._wire_command(
                {"gatewayId": "polar-twin-uno", "wireCommand": "SERVO:180"},
                "polar-twin-uno",
            )

    def test_hardware_packet_matches_backend_batch_contract(self) -> None:
        packet = {
            "device": "polar-twin-uno",
            "timestamp_ms": 12345,
            "temperature_c": 21.5,
            "humidity_pct": 48.0,
            "gas_raw": 173,
            "distance_cm": 84.2,
            "ir_detected": True,
            "hall_detected": False,
            "acceleration": {"x": 0.1, "y": 0.2, "z": 9.7, "tilt_deg": 2.4},
            "system": {"buzzer_on": False},
        }

        payload = gateway.backend_payload(packet)

        self.assertEqual(payload["gatewayId"], "polar-twin-uno")
        self.assertTrue(payload["timestamp"].endswith("Z"))
        self.assertEqual(len(payload["readings"]), 8)
        self.assertEqual(
            {reading["deviceId"] for reading in payload["readings"]},
            {
                "sensor-dht-01",
                "sensor-humidity-01",
                "sensor-mq2-01",
                "buzzer-01",
                "sensor-ultrasonic-01",
                "sensor-ir-01",
                "sensor-door-01",
                "sensor-vibration-01",
            },
        )

    def test_unavailable_sensor_values_are_not_fabricated(self) -> None:
        packet = {
            "device": "polar-twin-uno",
            "temperature_c": None,
            "humidity_pct": None,
            "gas_raw": 173,
            "distance_cm": None,
            "ir_detected": False,
            "hall_detected": False,
            "acceleration": {"x": None, "y": None, "z": None, "tilt_deg": None},
            "system": {"buzzer_on": False},
        }

        readings = gateway.backend_payload(packet)["readings"]

        self.assertEqual(
            {reading["deviceId"] for reading in readings},
            {"sensor-mq2-01", "buzzer-01", "sensor-ir-01", "sensor-door-01"},
        )


if __name__ == "__main__":
    unittest.main()
