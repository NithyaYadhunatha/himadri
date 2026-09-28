"""Independent Raspberry Pi system-status display for a 128x64 SSD1306 OLED."""

from __future__ import annotations

import argparse
import logging
import os
import socket
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable


OLED_WIDTH = 128
OLED_HEIGHT = 64
OLED_ADDRESS = 0x3C
REFRESH_INTERVAL = 2.0
CPU_TEMPERATURE_PATH = Path("/sys/class/thermal/thermal_zone0/temp")

LOGGER = logging.getLogger("polartwin-oled")


@dataclass(frozen=True)
class SystemStats:
    ip_address: str
    cpu_percent: float | None
    cpu_temperature_c: float | None
    ram_percent: float | None
    disk_percent: float | None
    uptime_seconds: float | None


def active_ip_address() -> str:
    """Return the address of the preferred outbound interface without sending data."""
    for target in (("1.1.1.1", 80), ("8.8.8.8", 80)):
        connection = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            connection.settimeout(0.25)
            connection.connect(target)
            address = connection.getsockname()[0]
            if address and not address.startswith("127."):
                return address
        except OSError:
            pass
        finally:
            connection.close()
    return "Offline"


def cpu_temperature(path: Path = CPU_TEMPERATURE_PATH) -> float | None:
    """Read a Linux thermal-zone value expressed in millidegrees Celsius."""
    try:
        raw_value = path.read_text(encoding="ascii").strip()
        return float(raw_value) / 1000.0
    except (FileNotFoundError, OSError, UnicodeError, ValueError):
        return None


class SystemStatsCollector:
    """Collect each status independently so one failed metric cannot stop updates."""

    def __init__(
        self,
        temperature_path: Path = CPU_TEMPERATURE_PATH,
        psutil_module: Any = None,
    ) -> None:
        if psutil_module is None:
            try:
                import psutil as psutil_module
            except ImportError as error:
                raise RuntimeError(
                    "psutil is missing; install server/requirements.txt"
                ) from error
        self._psutil = psutil_module
        self.temperature_path = temperature_path
        self._reported_errors: set[str] = set()

    def _metric(self, name: str, reader: Callable[[], float]) -> float | None:
        try:
            return float(reader())
        except Exception as error:
            if name not in self._reported_errors:
                LOGGER.warning("Unable to read %s: %s", name, error)
                self._reported_errors.add(name)
            return None

    def collect(self) -> SystemStats:
        temperature = cpu_temperature(self.temperature_path)
        if temperature is None and "CPU temperature" not in self._reported_errors:
            LOGGER.warning("CPU temperature unavailable at %s", self.temperature_path)
            self._reported_errors.add("CPU temperature")

        return SystemStats(
            ip_address=active_ip_address(),
            cpu_percent=self._metric("CPU usage", self._psutil.cpu_percent),
            cpu_temperature_c=temperature,
            ram_percent=self._metric(
                "RAM usage", lambda: self._psutil.virtual_memory().percent
            ),
            disk_percent=self._metric(
                "root disk usage", lambda: self._psutil.disk_usage("/").percent
            ),
            uptime_seconds=self._metric(
                "system uptime",
                lambda: max(0.0, time.time() - self._psutil.boot_time()),
            ),
        )


def _percentage(value: float | None) -> str:
    return "N/A" if value is None else f"{value:.0f}%"


def format_uptime(seconds: float | None) -> str:
    if seconds is None:
        return "N/A"
    total_minutes = max(0, int(seconds)) // 60
    days, remaining_minutes = divmod(total_minutes, 24 * 60)
    hours, minutes = divmod(remaining_minutes, 60)
    if days:
        return f"{days}d {hours:02d}h"
    return f"{hours:02d}:{minutes:02d}"


def display_lines(stats: SystemStats) -> tuple[str, ...]:
    temperature = (
        f"{stats.cpu_temperature_c:.1f}C"
        if stats.cpu_temperature_c is not None
        else "TEMP:N/A"
    )
    return (
        "POLARTWIN PI",
        f"IP: {stats.ip_address}",
        f"CPU: {_percentage(stats.cpu_percent)}  {temperature}",
        f"RAM: {_percentage(stats.ram_percent)}",
        f"DISK: {_percentage(stats.disk_percent)}",
        f"UP: {format_uptime(stats.uptime_seconds)}",
    )


class OledDisplay:
    """Own the SSD1306 and a persistent Pillow framebuffer."""

    def __init__(self, address: int, width: int, height: int) -> None:
        try:
            import adafruit_ssd1306
            import board
            import busio
            from PIL import Image, ImageDraw, ImageFont
        except ImportError as error:
            raise RuntimeError(
                "OLED dependencies are missing; install server/requirements.txt"
            ) from error

        self._i2c: Any = None
        self._display: Any = None
        try:
            self._i2c = busio.I2C(board.SCL, board.SDA)
            self._display = adafruit_ssd1306.SSD1306_I2C(
                width, height, self._i2c, addr=address
            )
            self._image = Image.new("1", (width, height))
            self._draw = ImageDraw.Draw(self._image)
            try:
                self._font = ImageFont.load_default()
            except Exception as error:
                LOGGER.warning("Default Pillow font unavailable: %s", error)
                self._font = None
            self._display.fill(0)
            self._display.show()
        except Exception:
            self.close()
            raise

    def render(self, lines: tuple[str, ...]) -> None:
        self._draw.rectangle((0, 0, OLED_WIDTH, OLED_HEIGHT), outline=0, fill=0)
        for row, line in enumerate(lines):
            self._draw.text((0, row * 11), line, font=self._font, fill=255)
        self._display.image(self._image)
        self._display.show()

    def close(self) -> None:
        if self._display is not None:
            try:
                self._display.fill(0)
                self._display.show()
            except Exception as error:
                LOGGER.warning("Unable to clear OLED during shutdown: %s", error)
            self._display = None
        if self._i2c is not None:
            try:
                self._i2c.deinit()
            except Exception:
                pass
            self._i2c = None


def run_monitor(
    display: OledDisplay,
    collector: SystemStatsCollector,
    refresh_interval: float,
    once: bool = False,
) -> None:
    last_display_error = float("-inf")
    while True:
        started = time.monotonic()
        try:
            display.render(display_lines(collector.collect()))
        except Exception as error:
            if started - last_display_error >= 30:
                LOGGER.exception("OLED update failed: %s", error)
                last_display_error = started
        if once:
            time.sleep(refresh_interval)
            return
        time.sleep(max(0.0, refresh_interval - (time.monotonic() - started)))


def _address(value: str) -> int:
    address = int(value, 0)
    if not 0x03 <= address <= 0x77:
        raise argparse.ArgumentTypeError("OLED address must be from 0x03 to 0x77")
    return address


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--address",
        type=_address,
        default=os.getenv("PI_OLED_I2C_ADDRESS", hex(OLED_ADDRESS)),
        help="SSD1306 I2C address (default: 0x3c or PI_OLED_I2C_ADDRESS)",
    )
    parser.add_argument(
        "--refresh",
        type=float,
        default=os.getenv("PI_OLED_REFRESH_SECONDS", str(REFRESH_INTERVAL)),
        help="refresh interval in seconds (default: 2)",
    )
    parser.add_argument("--once", action="store_true", help="render one frame and exit")
    args = parser.parse_args(argv)
    if args.refresh < 0.5:
        parser.error("--refresh must be at least 0.5 seconds")

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    try:
        collector = SystemStatsCollector()
        display = OledDisplay(args.address, OLED_WIDTH, OLED_HEIGHT)
    except Exception as error:
        LOGGER.error("OLED monitor initialization failed: %s", error)
        return 1

    LOGGER.info(
        "PolarTwin OLED started at I2C 0x%02x; refresh %.1fs",
        args.address,
        args.refresh,
    )
    try:
        run_monitor(display, collector, args.refresh, args.once)
    except KeyboardInterrupt:
        LOGGER.info("OLED monitor stopped")
    finally:
        display.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
