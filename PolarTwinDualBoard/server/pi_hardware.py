"""Raspberry Pi GPIO sensors and actuators for PolarTwin."""

from __future__ import annotations

import os
import statistics
import threading
import time
from collections import deque
from typing import Any


def _env_int(name: str, default: str, minimum: int, maximum: int) -> int:
    value = int(os.getenv(name, default), 0)
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


class PiHardware:
    """Sample Pi-owned sensors and control the servo in the background."""

    def __init__(self) -> None:
        self.trigger_pin = _env_int("PI_ULTRASONIC_TRIGGER_BCM", "23", 0, 27)
        self.echo_pin = _env_int("PI_ULTRASONIC_ECHO_BCM", "24", 0, 27)
        self.ir_pin = _env_int("PI_IR_BCM", "17", 0, 27)
        self.servo_pin = _env_int("PI_SERVO_BCM", "18", 0, 27)
        if len({self.trigger_pin, self.echo_pin, self.ir_pin, self.servo_pin}) != 4:
            raise ValueError("Pi sensor and servo GPIO numbers must be unique")
        self.ir_active_low = os.getenv("PI_IR_ACTIVE_LOW", "1") != "0"
        self.sample_seconds = max(0.1, float(os.getenv("PI_SAMPLE_SECONDS", "0.2")))
        self.stale_seconds = max(0.5, float(os.getenv("PI_SENSOR_STALE_SECONDS", "2")))
        self.echo_timeout = max(0.005, float(os.getenv("PI_ECHO_TIMEOUT_SECONDS", "0.03")))
        self.servo_min_pulse_us = _env_int("PI_SERVO_MIN_PULSE_US", "500", 300, 1500)
        self.servo_max_pulse_us = _env_int("PI_SERVO_MAX_PULSE_US", "2400", 1500, 2700)
        if self.servo_min_pulse_us >= self.servo_max_pulse_us:
            raise ValueError("PI_SERVO_MIN_PULSE_US must be below PI_SERVO_MAX_PULSE_US")
        self._servo_angle = _env_int("PI_SERVO_START_ANGLE", "90", 0, 180)

        self._gpio: Any = None
        self._servo_pwm: Any = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._distance_samples: deque[float] = deque(maxlen=3)
        self._distance_cm: float | None = None
        self._distance_at = 0.0
        self._ir_detected: bool | None = None
        self._ir_at = 0.0

    def start(self) -> None:
        try:
            import RPi.GPIO as GPIO
        except ImportError as error:
            raise RuntimeError(
                "RPi.GPIO is required when PI_HARDWARE_ENABLED=1; install server requirements on the Pi"
            ) from error

        self._gpio = GPIO
        GPIO.setwarnings(False)
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(self.trigger_pin, GPIO.OUT, initial=GPIO.LOW)
        GPIO.setup(self.echo_pin, GPIO.IN)
        GPIO.setup(self.ir_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        GPIO.setup(self.servo_pin, GPIO.OUT, initial=GPIO.LOW)
        self._servo_pwm = GPIO.PWM(self.servo_pin, 50)
        self._servo_pwm.start(self._servo_duty_cycle(self._servo_angle))
        time.sleep(0.05)
        self._thread = threading.Thread(target=self._sample_loop, name="pi-sensors", daemon=True)
        self._thread.start()

    def _wait_for_level(self, level: int, deadline: float) -> float | None:
        while time.perf_counter() < deadline:
            if self._gpio.input(self.echo_pin) == level:
                return time.perf_counter()
        return None

    def _measure_distance(self) -> float | None:
        GPIO = self._gpio
        GPIO.output(self.trigger_pin, GPIO.LOW)
        time.sleep(0.000002)
        GPIO.output(self.trigger_pin, GPIO.HIGH)
        time.sleep(0.00001)
        GPIO.output(self.trigger_pin, GPIO.LOW)

        rise = self._wait_for_level(GPIO.HIGH, time.perf_counter() + self.echo_timeout)
        if rise is None:
            return None
        fall = self._wait_for_level(GPIO.LOW, rise + self.echo_timeout)
        if fall is None:
            return None
        distance_cm = (fall - rise) * 17150.0
        return round(distance_cm, 1) if 2.0 <= distance_cm <= 400.0 else None

    def _sample_loop(self) -> None:
        while not self._stop.is_set():
            started = time.monotonic()
            distance = self._measure_distance()
            ir_level = self._gpio.input(self.ir_pin)
            ir_detected = ir_level == self._gpio.LOW if self.ir_active_low else ir_level == self._gpio.HIGH
            now = time.monotonic()
            with self._lock:
                if distance is not None:
                    self._distance_samples.append(distance)
                    self._distance_cm = round(statistics.median(self._distance_samples), 1)
                    self._distance_at = now
                self._ir_detected = ir_detected
                self._ir_at = now
            self._stop.wait(max(0.0, self.sample_seconds - (time.monotonic() - started)))

    def snapshot(self) -> dict[str, float | bool | None]:
        now = time.monotonic()
        with self._lock:
            return {
                "distance_cm": self._distance_cm
                if now - self._distance_at <= self.stale_seconds
                else None,
                "ir_detected": self._ir_detected
                if now - self._ir_at <= self.stale_seconds
                else None,
                "servo_angle": self._servo_angle,
            }

    def _servo_duty_cycle(self, angle: int) -> float:
        pulse_us = self.servo_min_pulse_us + (
            (self.servo_max_pulse_us - self.servo_min_pulse_us) * angle / 180.0
        )
        return pulse_us / 20_000.0 * 100.0

    def set_servo_angle(self, angle: int) -> None:
        if isinstance(angle, bool) or not isinstance(angle, int) or not 0 <= angle <= 180:
            raise ValueError("servo angle must be an integer from 0 to 180")
        if self._servo_pwm is None:
            raise RuntimeError("servo PWM is not initialized")
        with self._lock:
            self._servo_pwm.ChangeDutyCycle(self._servo_duty_cycle(angle))
            self._servo_angle = angle

    def close(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=1.0)
        if self._servo_pwm is not None:
            self._servo_pwm.stop()
        if self._gpio is not None:
            self._gpio.cleanup(
                (self.trigger_pin, self.echo_pin, self.ir_pin, self.servo_pin)
            )
