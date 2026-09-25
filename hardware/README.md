# PolarTwinUno

PolarTwinUno combines the verified Arduino Uno test modules into one JSONL telemetry node. Production code is under this folder; the original test folders remain unchanged as hardware references.

The connected accelerometer is the three-axis analog ADXL335-style board from `AccelerometerTest`, not an MPU6050. It uses A1–A3. The SSD1306 OLED is the only current I2C device on A4/A5. MQ-2 uses AO on A0, and the Hall module uses D0 on D10 so no analog input is wasted.

## Required Arduino libraries

- DHT sensor library by Adafruit (plus Adafruit Unified Sensor)
- Servo library by Arduino (install it from Library Manager if your IDE/core does not already provide it)
- Wire (bundled with the Arduino core)

The production OLED wrapper is a small text-only SSD1306 driver built on Wire. It intentionally avoids the 1,024-byte framebuffer used by Adafruit SSD1306, which would leave unsafe stack headroom on an Uno. The original OLED test still uses Adafruit GFX and Adafruit SSD1306.

Open `PolarTwinUno/PolarTwinUno.ino` in Arduino IDE, select **Arduino Uno**, install the DHT library, compile, and upload. Serial is **115200 baud**. Scheduling uses `millis()` and the HC-SR04 uses a polling state machine; production code has no `delay()` or `pulseIn()`.

References:

- `PIN_MAPPING.md` — wiring, voltage, conflicts, timers, and source-project inventory
- `TELEMETRY.md` — JSON schema, units, rates, alerts, and commands
- `TESTING.md` — staged bring-up and acceptance testing

The `server` gateway validates this schema, exposes latest/history/status REST endpoints and Socket.IO updates, and translates API commands into the firmware's newline protocol. Run it with `npm install` followed by `npm start`; set `ARDUINO_PORT` if automatic USB-port detection does not find the Uno. The terminal prints the live HTML dashboard URL. It starts at port 3001 and tries subsequent ports if that port is already occupied.
