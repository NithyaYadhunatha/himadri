# PolarTwin Arduino Uno firmware

This firmware is the Uno half of the hybrid Uno/Raspberry Pi node. The Uno
reads DHT11, MQ-2, Hall, and ADXL335; drives the buzzer, RGB LED, and status
LED; and sends JSONL over USB at 115200 baud. HC-SR04, IR, servo, and OLED have
moved to Raspberry Pi GPIO/PWM/I2C.

| Uno port | Connection |
|---|---|
| D0/D1 | USB serial only |
| D2 | DHT11 DATA |
| D3 | Buzzer signal |
| D4 | Free (former IR) |
| D5/D6/D11 | RGB red/green/blue |
| D7/D8 | Free (former HC-SR04) |
| D9 | Free (former servo) |
| D10 | Hall sensor D0 |
| D12 | Status LED |
| A0 | MQ-2 AO |
| A1/A2/A3 | ADXL335 X/Y/Z |
| A4/A5 | Free (former OLED) |

Required Arduino libraries: DHT sensor library by Adafruit and Adafruit Unified
Sensor. Servo and U8g2/SSD1306 libraries are no longer required on the Uno.

The JSON schema is preserved, but `distance_cm`, `ir_detected`, and
`system.servo_angle` are emitted as `null`. The Raspberry Pi gateway fills them
from GPIO/PWM before submitting the packet to HIMADRI. Use `server/gateway.py`;
the older Node dashboard does not control Pi hardware.

Keep the ADXL335 still for the first three seconds after startup. Send
`ACCEL:ZERO` to capture a new stationary baseline. Use an external regulated
5 V supply for the MQ-2 heater if USB power is unstable, with grounds connected
together.

See `../docs/wiring.md` for the complete Pi and Uno wiring tables.
