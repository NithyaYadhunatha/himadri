# Hybrid Arduino Uno and Raspberry Pi wiring

The Uno remains connected to the Raspberry Pi by USB. Move the HC-SR04, IR
sensor, servo, and SSD1306 OLED to the Pi. All grounds must be common.

## Raspberry Pi 3 (BCM numbering)

| Module | Module pin | Raspberry Pi | Physical pin | Notes |
|---|---|---:|---:|---|
| HC-SR04 | VCC | 5 V | 2 | Do not power it from a GPIO |
| HC-SR04 | TRIG | BCM23 | 16 | Pi 3.3 V output is accepted by TRIG |
| HC-SR04 | ECHO | BCM24 | 18 | **Never connect directly**; use divider below |
| HC-SR04 | GND | GND | 14 | Common ground |
| IR module | VCC | 3.3 V | 17 | Use 3.3 V so OUT cannot exceed Pi GPIO voltage |
| IR module | OUT | BCM17 | 11 | Active-low by default |
| IR module | GND | GND | 9 | Common ground |
| Servo | signal | BCM18 | 12 | 50 Hz PWM; default startup angle 90° |
| Servo | V+ | External 5 V | — | Do not power the servo from a Pi GPIO/3.3 V pin |
| Servo | GND | External supply GND | — | Join supply GND, Pi GND, and Uno GND |
| SSD1306 OLED | VCC | 3.3 V | 1 | Use 3.3 V I2C power/pull-ups |
| SSD1306 OLED | GND | GND | 6 | Common ground |
| SSD1306 OLED | SDA | BCM2/SDA1 | 3 | I2C-1 data |
| SSD1306 OLED | SCL | BCM3/SCL1 | 5 | I2C-1 clock |

HC-SR04 ECHO is approximately 5 V and can damage the Pi. Fit a divider:

```text
HC-SR04 ECHO ---- 1 kOhm ----+---- BCM24 (physical 18)
                              |
                            2 kOhm
                              |
                             GND
```

This reduces 5 V to about 3.3 V. Verify the divided signal with a meter before
connecting BCM24. A 3.3 V logic-level shifter is also suitable.

Enable I2C with `sudo raspi-config` (Interface Options -> I2C), then confirm the
OLED address with `i2cdetect -y 1`. It is normally `0x3c`; set
`PI_OLED_I2C_ADDRESS=0x3d` when needed. The independent
`server/polartwin_status.py` process owns this I2C device; the telemetry gateway
does not read from or render to the OLED.

## Arduino Uno (remaining hardware)

| Module | Module pin | Arduino Uno | Notes |
|---|---|---|---|
| DHT11 (3-pin) | DATA | D2 | VCC 5 V, GND common |
| Buzzer module | SIG | D3 | Use a driver for a high-current buzzer |
| RGB LED | R/G/B | D5/D6/D11 | One resistor per channel |
| Hall module | D0 | D10 | Active-low by default |
| Status LED | anode/signal | D12 | Add current-limiting resistor |
| MQ-2 | AO | A0 | Raw ADC 0-1023, not calibrated ppm |
| ADXL335 | X/Y/Z | A1/A2/A3 | Power at 3.3 V unless module says otherwise |

Uno D4, D7, D8, D9, A4, and A5 are now free. D0/D1 remain reserved for USB
serial. Firmware and gateway baud rate are 115200.
