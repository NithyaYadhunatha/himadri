"""Unit tests for the independent Raspberry Pi OLED status screen."""

from __future__ import annotations

import unittest

from polartwin_status import SystemStats, display_lines, format_uptime


class PolarTwinStatusTest(unittest.TestCase):
    def test_formats_short_and_multi_day_uptime(self) -> None:
        self.assertEqual(format_uptime(3 * 3600 + 42 * 60), "03:42")
        self.assertEqual(format_uptime(2 * 86400 + 4 * 3600), "2d 04h")
        self.assertEqual(format_uptime(None), "N/A")

    def test_status_screen_contains_only_pi_system_stats(self) -> None:
        lines = display_lines(
            SystemStats(
                ip_address="192.168.1.20",
                cpu_percent=24.2,
                cpu_temperature_c=52.34,
                ram_percent=41.0,
                disk_percent=32.0,
                uptime_seconds=3 * 3600 + 42 * 60,
            )
        )

        self.assertEqual(
            lines,
            (
                "POLARTWIN PI",
                "IP: 192.168.1.20",
                "CPU: 24%  52.3C",
                "RAM: 41%",
                "DISK: 32%",
                "UP: 03:42",
            ),
        )
        self.assertNotIn("temperature_c", " ".join(lines))
        self.assertNotIn("hall", " ".join(lines).lower())

    def test_unavailable_values_are_explicit(self) -> None:
        lines = display_lines(
            SystemStats("Offline", None, None, None, None, None)
        )

        self.assertEqual(lines[1], "IP: Offline")
        self.assertEqual(lines[2], "CPU: N/A  TEMP:N/A")
        self.assertEqual(lines[3:], ("RAM: N/A", "DISK: N/A", "UP: N/A"))


if __name__ == "__main__":
    unittest.main()
