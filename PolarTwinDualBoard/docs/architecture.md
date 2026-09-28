# Hybrid Uno and Raspberry Pi architecture

```text
DHT11 + MQ-2 + Hall + ADXL335       HC-SR04 + IR + Servo
               |                         |
               v                         v
          Arduino Uno              Raspberry Pi GPIO
               |                         |
               +---- USB JSONL ----------+
                                         |
                              Python gateway merge
                                   |           |
                              SSD1306 OLED     | HTTPS POST
                                               v
                                  /api/telemetry/ingest
                                               |
                                  FastAPI -> WebSocket
                                               |
                                         Maitri WebGL
```

The Uno emits `null` for `distance_cm`, `ir_detected`, and `servo_angle`.
`gateway.py` replaces those placeholders with fresh Pi GPIO/PWM state, displays
the combined packet on the OLED, and forwards `sensor-ultrasonic-01`,
`sensor-ir-01`, and `servo-01` to the backend.

The Hall-effect module remains on Uno D10 and appears as **Hall Effect Sensor**.
Its backend/Unity identifier stays `sensor-door-01` for compatibility.

Maitri Buzzer ON/OFF commands still travel from FastAPI through the Pi gateway
to the Uno. Servo SET_ANGLE commands are applied directly to Pi BCM18. MQTT and
ESP8266 are not in the runtime path. Missing or stale sensor values are omitted
from ingestion rather than fabricated.
