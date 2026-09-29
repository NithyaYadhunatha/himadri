#!/usr/bin/env python3
"""Standalone Raspberry Pi servo movement check for PolarTwin."""

from __future__ import annotations

import argparse
import sys
import time
from collections.abc import Callable, Sequence
from typing import Any

from pi_hardware import servo_duty_cycle


DEFAULT_ANGLES = (30, 90, 150, 90)
DEFAULT_PIN = 18
DEFAULT_HOLD_SECONDS = 1.0
DEFAULT_MIN_PULSE_US = 500
DEFAULT_MAX_PULSE_US = 2400


def run_servo_check(
    gpio: Any,
    pin: int,
    angles: Sequence[int],
    hold_seconds: float,
    min_pulse_us: int,
    max_pulse_us: int,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    """Drive the requested test angles and always release the GPIO safely."""
    if not angles:
        raise ValueError("at least one test angle is required")
    if hold_seconds <= 0:
        raise ValueError("hold time must be greater than zero")

    duties = [
        servo_duty_cycle(angle, min_pulse_us, max_pulse_us) for angle in angles
    ]
    pwm = None
    gpio.setwarnings(False)
    gpio.setmode(gpio.BCM)
    gpio.setup(pin, gpio.OUT, initial=gpio.LOW)
    try:
        pwm = gpio.PWM(pin, 50)
        pwm.start(0)
        for angle, duty in zip(angles, duties):
            print(f"Moving servo to {angle} degrees (duty {duty:.2f}%)", flush=True)
            pwm.ChangeDutyCycle(duty)
            sleep(hold_seconds)
        pwm.ChangeDutyCycle(0)
    finally:
        if pwm is not None:
            pwm.stop()
        gpio.output(pin, gpio.LOW)
        gpio.cleanup(pin)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Move the Raspberry Pi servo through a safe test sequence."
    )
    parser.add_argument("--pin", type=int, default=DEFAULT_PIN, help="BCM GPIO pin")
    parser.add_argument(
        "--angles",
        type=int,
        nargs="+",
        default=list(DEFAULT_ANGLES),
        help="angles from 0 to 180 (default: 30 90 150 90)",
    )
    parser.add_argument(
        "--hold", type=float, default=DEFAULT_HOLD_SECONDS, help="seconds per angle"
    )
    parser.add_argument("--min-pulse-us", type=int, default=DEFAULT_MIN_PULSE_US)
    parser.add_argument("--max-pulse-us", type=int, default=DEFAULT_MAX_PULSE_US)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not 0 <= args.pin <= 27:
        print("Servo BCM pin must be between 0 and 27", file=sys.stderr)
        return 2
    try:
        import RPi.GPIO as GPIO
    except ImportError:
        print(
            "RPi.GPIO is unavailable. Run this check on the Raspberry Pi using "
            "the project virtual environment.",
            file=sys.stderr,
        )
        return 1

    try:
        run_servo_check(
            GPIO,
            args.pin,
            args.angles,
            args.hold,
            args.min_pulse_us,
            args.max_pulse_us,
        )
    except KeyboardInterrupt:
        print("\nServo check stopped; GPIO cleaned up.")
        return 130
    except (RuntimeError, ValueError) as error:
        print(f"Servo check failed: {error}", file=sys.stderr)
        return 1

    print("PWM sequence completed. Confirm that the servo physically moved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
