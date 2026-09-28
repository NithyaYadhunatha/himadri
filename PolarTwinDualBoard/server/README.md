# PolarTwin hybrid Uno/Raspberry Pi gateway

The production Python gateway combines the Uno USB stream with HC-SR04, IR, and
servo state owned by Pi GPIO/PWM, renders the combined state on the Pi-connected
SSD1306 OLED, and sends it to HIMADRI over HTTP. The backend pushes changes to
Maitri over WebSocket. It does not require MQTT or an ESP8266.

The OLED shows the live Uno temperature, humidity, Hall/magnetic detection,
buzzer ON/OFF state, and smoke/gas-alert ON/OFF state. Missing sensor values are
shown as `--` rather than being fabricated.

The legacy Node gateway below can still inspect an old Uno-only firmware packet
and serve its local dashboard, but it does not access Raspberry Pi GPIO. Use
`gateway.py` for the hybrid wiring.

## Raspberry Pi production setup

Wire the Pi exactly as described in `../docs/wiring.md`. In particular, place a
1 kOhm/2 kOhm divider between HC-SR04 ECHO and BCM24; direct 5 V ECHO can damage
the Pi. Then enable I2C and install the runtime:

```bash
cd /home/pi/PolarTwin/himadri/PolarTwinDualBoard/server
sudo raspi-config
sudo apt update
sudo apt install -y python3-venv python3-rpi.gpio i2c-tools
python3 -m venv --system-site-packages venv
source venv/bin/activate
pip install -r requirements.txt
```

Confirm that the OLED appears at `0x3c` (or `0x3d`) with `i2cdetect -y 1`, and
locate the stable Uno USB name with `ls -l /dev/serial/by-id/`. Start one gateway:

```bash
cd /home/pi/PolarTwin/himadri/PolarTwinDualBoard/server
ARDUINO_PORT=/dev/ttyACM0 \
ARDUINO_BAUD=115200 \
BACKEND_URL=https://himadri.aus1in.me/api/telemetry/ingest \
BACKEND_DEVICE_KEY=replace-with-the-same-secret \
python gateway.py
```

`BACKEND_URL` defaults to
`https://himadri.aus1in.me/api/telemetry/ingest`, so it may be omitted.
An origin such as `https://himadri.aus1in.me` is also accepted; the gateway
will try `/api/v1/telemetry/ingest` and fall back to `/api/telemetry/ingest`.
Set it explicitly to `http://localhost:8000` only when running a local backend.
Set `BACKEND_DEVICE_KEY` only when the deployed backend has
`DIGITAL_TWIN_INGEST_KEY` configured; the values must match.

`GET /api/iot/status` includes `backendRelay.enabled`, `connected`,
`lastSuccess`, and `lastError`, so deployment can be checked without exposing
the secret.

Default Pi ownership is BCM23 TRIG, BCM24 divided ECHO, BCM17 IR, BCM18 servo,
and I2C address `0x3c`. Override it with `PI_ULTRASONIC_TRIGGER_BCM`,
`PI_ULTRASONIC_ECHO_BCM`, `PI_IR_BCM`, `PI_IR_ACTIVE_LOW=0`, or
`PI_OLED_I2C_ADDRESS=0x3d`. Servo settings are `PI_SERVO_BCM`,
`PI_SERVO_START_ANGLE`, `PI_SERVO_MIN_PULSE_US`, and `PI_SERVO_MAX_PULSE_US`.
Set `PI_HARDWARE_ENABLED=0` only for development on a non-Pi machine.

## Legacy local Node dashboard

Dashboard: `http://localhost:3001/`

Status API: `http://localhost:3001/api/iot/status`

Require `arduinoConnected: true` and `telemetryStale: false`. `dhtConnected`
means a valid DHT reading arrived inside the Uno packet; it is no longer a
second serial-port connection.

## Python gateway behavior

`gateway.py` is a lightweight alternative when only serial-to-backend relay is
needed (it does not serve the local dashboard). It translates the Uno packet
to the same telemetry-ingest contract used by `server.js` and omits
readings for sensors that currently report `null`.

Do not run `gateway.py` and `server.js` against the same serial port at the
same time. Only one process can own the Arduino connection.

Both gateways preserve partial serial reads until a newline arrives, discard
corrupt packets without flooding the terminal, and retry backend failures with
exponential backoff. They prefer the versioned ingest route and automatically
fall back to the legacy alias. If both return 404, the deployed backend image
is stale and must be rebuilt/redeployed; changing the Raspberry Pi URL will not
create a missing server route.

The Python gateway polls the authenticated hardware-command endpoint once per
second. Buzzer ON/OFF commands are written to the Uno over USB; `SERVO:0..180`
commands are applied directly to BCM18. The backend must be redeployed before
the new `servo-01` command and telemetry contract is available publicly.
