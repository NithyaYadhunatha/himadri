# PolarTwin hybrid Uno/Raspberry Pi gateway

The production Python gateway combines the Uno USB stream with HC-SR04, IR, and
servo state owned by Pi GPIO/PWM and sends it to HIMADRI over HTTP. The backend
pushes changes to Maitri over WebSocket. It does not require MQTT or an ESP8266.

`polartwin_status.py` is a separate local process for the Pi-connected SSD1306.
It displays only Raspberry Pi IP address, CPU usage and temperature, RAM, root
disk usage, and uptime. It does not read Arduino packets or send system stats to
the backend, so an OLED fault cannot stop telemetry.

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

Locate the stable Uno USB name with `ls -l /dev/serial/by-id/`. Start one gateway:

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

Default Pi ownership is BCM23 TRIG, BCM24 divided ECHO, BCM17 IR, and BCM18
servo. Override it with `PI_ULTRASONIC_TRIGGER_BCM`,
`PI_ULTRASONIC_ECHO_BCM`, `PI_IR_BCM`, `PI_IR_ACTIVE_LOW=0`, or
`PI_SERVO_BCM`. Servo settings are `PI_SERVO_START_ANGLE`,
`PI_SERVO_MIN_PULSE_US`, and `PI_SERVO_MAX_PULSE_US`. Set
`PI_HARDWARE_ENABLED=0` only for development on a non-Pi machine.

## Raspberry Pi OLED system status

The SSD1306 status monitor is intentionally independent from `gateway.py`.
Stopping or restarting it does not open the Arduino serial port and does not
alter sensor collection, payloads, backend requests, or hardware commands.

### 1. Enable I2C

```bash
sudo raspi-config
```

Choose **Interface Options -> I2C -> Enable**, then reboot if requested.

### 2. Verify the OLED

```bash
sudo i2cdetect -y 1
```

The common address is `3c`. If the table shows `3d`, set
`PI_OLED_I2C_ADDRESS=0x3d` when running manually and update the same environment
line in the generated systemd service.

### 3. Install dependencies

From `PolarTwinDualBoard/server`:

```bash
sudo apt update
sudo apt install -y python3-venv python3-rpi.gpio i2c-tools
python3 -m venv --system-site-packages venv
venv/bin/python -m pip install -r requirements.txt
```

The requirements use Blinka, Adafruit CircuitPython SSD1306, Pillow, and psutil.

### 4. Test only the OLED

```bash
cd PolarTwinDualBoard/server
venv/bin/python polartwin_status.py
```

Press Ctrl+C to clear the screen, release I2C, and stop. Optional overrides are
`PI_OLED_I2C_ADDRESS=0x3d` and `PI_OLED_REFRESH_SECONDS=2`. For a single-frame
hardware check, add `--once`.

### 5. Enable systemd auto-start

The installer renders `systemd/polartwin-oled.service.in` with the current
absolute project path, the project virtual environment, and the normal user
that invoked `sudo`; no username is hardcoded.

```bash
sudo ./systemd/install_oled_service.sh
sudo systemctl daemon-reload
sudo systemctl enable polartwin-oled
sudo systemctl start polartwin-oled
sudo systemctl status polartwin-oled
```

Follow logs with:

```bash
journalctl -u polartwin-oled -f
```

### Troubleshooting

- **No `3c`/`3d` in `i2cdetect`:** enable I2C, confirm SDA is physical pin 3,
  SCL is pin 5, power is 3.3 V, ground is common, and reboot the Pi.
- **Permission denied for `/dev/i2c-1`:** run
  `sudo usermod -aG i2c "$USER"`, then log out and back in before reinstalling
  or restarting the service.
- **Wrong address:** run `sudo i2cdetect -y 1`, then configure the detected
  address with `PI_OLED_I2C_ADDRESS`.
- **Missing Python module:** activate/use `server/venv` and rerun
  `venv/bin/python -m pip install -r requirements.txt`.
- **Blank or corrupted screen with a detected device:** confirm the module is
  an SSD1306 128x64. An SH1106 display needs a different driver.
- **Service failure:** inspect `sudo systemctl status polartwin-oled` and
  `journalctl -u polartwin-oled -f`. OLED initialization errors do not affect
  the independent gateway process.

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
