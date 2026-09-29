#!/usr/bin/env python3
"""Standalone HC-SR04 diagnostic for Raspberry Pi GPIO.

The HC-SR04 ECHO output is approximately 5 V. Raspberry Pi GPIO inputs are
3.3 V-only, so this program requires an explicit confirmation that ECHO is
connected through a divider or a suitable 3.3 V level shifter.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import Any


SPEED_OF_SOUND_CM_PER_US = 0.0343


def distance_cm_from_pulse_us(pulse_us: float) -> float:
    """Convert an ultrasonic round-trip pulse duration to one-way distance."""
    if pulse_us <= 0:
        raise ValueError("pulse duration must be positive")
    return pulse_us * SPEED_OF_SOUND_CM_PER_US / 2.0


def wait_for_level(
    gpio: Any, pin: int, level: int, timeout_seconds: float
) -> tuple[float | None, int]:
    """Return the edge time and number of GPIO reads, or None on timeout."""
    deadline = time.perf_counter() + timeout_seconds
    reads = 0
    while time.perf_counter() < deadline:
        reads += 1
        if gpio.input(pin) == level:
            return time.perf_counter(), reads
    return None, reads


def measure_once(
    gpio: Any, trigger_pin: int, echo_pin: int, timeout_seconds: float
) -> tuple[str, float | None, float | None]:
    """Trigger one measurement and return status, distance, and pulse width."""
    if gpio.input(echo_pin) == gpio.HIGH:
        return "ECHO_STUCK_HIGH", None, None

    gpio.output(trigger_pin, gpio.LOW)
    time.sleep(0.000002)
    gpio.output(trigger_pin, gpio.HIGH)
    time.sleep(0.000010)
    gpio.output(trigger_pin, gpio.LOW)

    rise, _ = wait_for_level(gpio, echo_pin, gpio.HIGH, timeout_seconds)
    if rise is None:
        return "NO_ECHO_RISE", None, None

    fall, _ = wait_for_level(gpio, echo_pin, gpio.LOW, timeout_seconds)
    if fall is None:
        return "ECHO_STUCK_HIGH_AFTER_RISE", None, None

    pulse_us = (fall - rise) * 1_000_000.0
    distance_cm = distance_cm_from_pulse_us(pulse_us)
    if not 2.0 <= distance_cm <= 400.0:
        return "OUT_OF_RANGE", distance_cm, pulse_us
    return "OK", distance_cm, pulse_us


def raspberry_pi_model() -> str:
    model_path = Path("/proc/device-tree/model")
    try:
        return model_path.read_text(encoding="utf-8").rstrip("\x00\n")
    except OSError:
        return "unknown (model file unavailable)"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Test one HC-SR04 connected to Raspberry Pi GPIO."
    )
    parser.add_argument("--trigger", type=int, default=23, help="TRIG BCM pin (default: 23)")
    parser.add_argument("--echo", type=int, default=24, help="ECHO BCM pin (default: 24)")
    parser.add_argument("--samples", type=int, default=20, help="number of readings (default: 20)")
    parser.add_argument("--interval", type=float, default=0.25, help="seconds between readings")
    parser.add_argument("--timeout", type=float, default=0.03, help="edge timeout in seconds")
    parser.add_argument(
        "--echo-protected",
        action="store_true",
        help="confirm ECHO is reduced to 3.3 V with a divider/level shifter",
    )
    return parser


def validate_args(args: argparse.Namespace) -> None:
    for name in ("trigger", "echo"):
        pin = getattr(args, name)
        if not 0 <= pin <= 27:
            raise ValueError(f"--{name} must be a BCM pin from 0 to 27")
    if args.trigger == args.echo:
        raise ValueError("TRIG and ECHO must use different GPIO pins")
    if args.samples < 1:
        raise ValueError("--samples must be at least 1")
    if args.interval < 0.06:
        raise ValueError("--interval must be at least 0.06 seconds")
    if not 0.001 <= args.timeout <= 0.1:
        raise ValueError("--timeout must be between 0.001 and 0.1 seconds")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        validate_args(args)
    except ValueError as error:
        parser.error(str(error))

    print("HC-SR04 Raspberry Pi standalone check")
    print(f"Pi model: {raspberry_pi_model()}")
    print(
        f"BCM mapping: TRIG=GPIO{args.trigger}, ECHO=GPIO{args.echo} "
        "(BCM numbers, not physical pin numbers)"
    )
    if not args.echo_protected:
        print(
            "\nSTOP: HC-SR04 ECHO is about 5 V, but Raspberry Pi GPIO accepts "
            "only 3.3 V.\nDisconnect ECHO and add a 1 kOhm/2 kOhm divider or "
            "a 3.3 V level shifter.\nThen rerun with --echo-protected.",
            file=sys.stderr,
        )
        return 2

    try:
        import RPi.GPIO as GPIO
    except (ImportError, RuntimeError) as error:
        print(f"GPIO library unavailable: {error}", file=sys.stderr)
        print("Install it with: sudo apt install python3-rpi.gpio", file=sys.stderr)
        return 3

    ok_count = 0
    failures: dict[str, int] = {}
    try:
        GPIO.setwarnings(False)
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(args.trigger, GPIO.OUT, initial=GPIO.LOW)
        GPIO.setup(args.echo, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)
        time.sleep(0.05)

        for sample in range(1, args.samples + 1):
            status, distance_cm, pulse_us = measure_once(
                GPIO, args.trigger, args.echo, args.timeout
            )
            if status == "OK":
                ok_count += 1
                print(
                    f"[{sample:02d}/{args.samples:02d}] OK  "
                    f"distance={distance_cm:7.1f} cm  pulse={pulse_us:8.1f} us"
                )
            else:
                failures[status] = failures.get(status, 0) + 1
                detail = ""
                if distance_cm is not None and pulse_us is not None:
                    detail = f" distance={distance_cm:.1f} cm pulse={pulse_us:.1f} us"
                print(f"[{sample:02d}/{args.samples:02d}] {status}{detail}")
            if sample != args.samples:
                time.sleep(args.interval)
    except PermissionError as error:
        print(f"GPIO permission error: {error}", file=sys.stderr)
        return 4
    except KeyboardInterrupt:
        print("\nTest stopped by user")
        return 130
    finally:
        try:
            GPIO.cleanup((args.trigger, args.echo))
        except Exception:
            pass

    print(f"\nSummary: {ok_count}/{args.samples} valid readings")
    for status, count in sorted(failures.items()):
        print(f"  {status}: {count}")
    if ok_count:
        print("PASS: the Pi received valid ultrasonic echo pulses.")
        return 0

    print("FAIL: no valid echo pulse was received.", file=sys.stderr)
    print(
        "Check 5 V power, common GND, BCM/physical pin numbering, TRIG/ECHO "
        "direction, and the ECHO divider wiring.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
