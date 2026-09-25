# PolarTwinUno staged testing

Disconnect power before rewiring, keep all logic grounds common, and verify supply rails before attaching modules.

## 1. Individual modules

1. Upload each existing test sketch without changing its folder.
2. Verify DHT11 at its two-second interval; warm MQ-2 and record its clean-air raw range.
3. Confirm IR and Hall active-low behavior and adjust module trimmers if needed.
4. Confirm all ADXL335 axes change and record stationary offsets.
5. Check HC-SR04 at known distances from roughly 5–200 cm.
6. Test buzzer, status LED, all RGB channels, servo, and OLED independently. Ensure servo motion does not reset the Uno.

Old sketches use historical pins. Rewire to `PIN_MAPPING.md` before uploading PolarTwinUno.

## 2. I2C first

1. Wire OLED SDA/SCL to A4/A5 with the correct VCC and GND.
2. Upload PolarTwinUno with high-current loads disconnected.
3. Confirm the three OLED pages rotate.
4. For a future MPU6050, scan the bus with OLED and MPU6050 together. Check unique addresses and pull-up voltage. The current ADXL335 is not I2C.

## 3. Analog sensors

1. Power ADXL335 from 3.3 V; connect X/Y/Z to A1/A2/A3.
2. Connect MQ-2 AO to A0 and use adequate 5 V power.
3. Observe JSON at 115200 baud. `gas_raw` must vary; acceleration Z should approach ±9.8 m/s² when vertical after calibration.
4. Tune `GAS_ALERT_RAW`, `ACCEL_ZERO_G_V`, and `ACCEL_SENSITIVITY_V_PER_G` in `core/PinConfig.h`.

## 4. Ultrasonic and digital sensors

1. Connect HC-SR04 TRIG/ECHO to D7/D8. Confirm ~5 Hz updates and `null` when no echo returns.
2. Connect DHT DATA D2, IR OUT D4, and Hall D0 D10.
3. Confirm DHT changes no faster than two seconds and IR/Hall respond within about 100 ms.
4. Move a target inside the proximity threshold and verify the alert.

## 5. Actuators

1. Add status LED D12 through 220–330 ohms.
2. Add RGB D5/D6/D11, each through its own resistor. Test colors and `RGB:r,g,b`.
3. Add buzzer D3 through a driver if required. Test both buzzer commands.
4. Connect servo signal D9 and an adequate regulated 5 V servo supply with common ground. Test 0/90/180 degrees and watch for brownouts or mechanical binding.
5. During servo motion, verify all RGB channels still dim smoothly. This validates that RGB avoids Timer1 PWM D9/D10.

## 6. Complete system

1. Inspect wiring for accidental D0/D1, A4/A5, or power conflicts.
2. Monitor 5 V/3.3 V rails while servo moves and RGB shows white.
3. After MQ-2 stabilizes, capture five minutes of JSONL; every non-empty line must parse as one JSON object.
4. Send every supported command, then malformed and overlong inputs; telemetry must continue.
5. Exercise temperature, gas, proximity, tilt/motion, Hall, and IR states separately and in combination.
6. Confirm priority: gas/red, structural/magenta, temperature/orange, proximity/blue, normal/green.
7. Run long enough to check for resets, stalled telemetry, stuck sonar, or OLED corruption.

## Acceptance checklist

- Serial is 115200 and emits JSON only.
- Telemetry is ~2 Hz; `STATUS` adds an immediate object.
- Production code contains no `delay()` or `pulseIn()`.
- Missing OLED or ultrasonic echo does not halt telemetry.
- DHT11 is read no faster than every two seconds.
- Servo does not disturb RGB PWM.
- Thresholds are centralized in `core/PinConfig.h`.
