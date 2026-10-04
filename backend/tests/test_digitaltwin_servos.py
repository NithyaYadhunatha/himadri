"""Servo command rules for the Unity robotic arm (no broker or database required).

Run from the ``backend`` directory:  python -m unittest tests.test_digitaltwin_servos
"""

import asyncio
import unittest
from unittest import mock

from backend.services import digitaltwin_bridge as bridge


def run(coro):
    return asyncio.run(coro)


class ServoCommandTests(unittest.TestCase):
    def setUp(self):
        self.broadcast = mock.patch.object(bridge.digital_twin_ws, "broadcast", new=mock.AsyncMock()).start()
        mock.patch.object(bridge, "_publisher_client", None).start()
        bridge._hardware_commands.clear()
        self.addCleanup(mock.patch.stopall)

    def test_both_arm_servos_are_catalogued(self):
        self.assertIn("servo-01", bridge.DEVICE_CATALOG)
        self.assertIn("servo-02", bridge.DEVICE_CATALOG)

    def test_servo_02_angle_becomes_state_and_is_broadcast(self):
        self.assertTrue(run(bridge.publish_command("servo-02", "SET_ANGLE", 120)))
        state = bridge.get_device("servo-02")
        self.assertEqual(state["value"], 120.0)
        self.assertEqual(state["displayValue"], "120°")
        self.assertEqual(state["status"], "NORMAL")
        sent = self.broadcast.await_args.args[0]
        self.assertEqual((sent["type"], sent["deviceId"], sent["data"]["value"]), ("DEVICE_UPDATE", "servo-02", 120.0))
        self.assertIsNone(bridge.take_hardware_command("polar-twin-uno"))

    def test_servo_01_is_queued_for_the_pi_not_set_optimistically(self):
        before = dict(bridge.get_device("servo-01"))
        self.assertTrue(run(bridge.publish_command("servo-01", "SET_ANGLE", 30)))
        self.assertEqual(bridge.take_hardware_command("polar-twin-uno")["wireCommand"], "SERVO:30")
        self.assertEqual(bridge.get_device("servo-01")["value"], before["value"])

    def test_invalid_angles_are_rejected(self):
        for device_id in ("servo-01", "servo-02"):
            for bad in (-1, 181, 12.5, True, "90", None, float("nan")):
                self.assertFalse(run(bridge.publish_command(device_id, "SET_ANGLE", bad)), (device_id, bad))
            self.assertFalse(run(bridge.publish_command(device_id, "SET_STATE", 90)))

    def test_ingested_servo_reading_is_normal(self):
        changed = run(bridge.ingest_readings([{"deviceId": "servo-02", "value": 180.0}]))
        self.assertEqual(changed[0]["status"], "NORMAL")
        self.assertEqual(changed[0]["displayValue"], "180°")


if __name__ == "__main__":
    unittest.main()
