# PolarTwin single-Arduino gateway

The Raspberry Pi gateway reads one Arduino Uno JSON stream, serves the local
dashboard, and sends validated physical readings to the deployed HIMADRI
backend over HTTP. The backend pushes those changes to Maitri over WebSocket.
It does not require MQTT or an ESP8266.

```bash
cd /Users/adityasingh/projects/SIH/PolarTwin/himadri/PolarTwinDualBoard/server
ARDUINO_PORT=/dev/cu.usbserial-A5069RR4 \
ARDUINO_BAUD=115200 \
BACKEND_URL=https://himadri.aus1in.me \
npm start
```

For a Raspberry Pi sending directly to the deployed backend, use its public
base URL (without `/api/telemetry/ingest`) and the device key configured on
the backend:

```bash
cd /home/pi/PolarTwin/himadri/PolarTwinDualBoard/server
ARDUINO_PORT=/dev/ttyACM0 \
ARDUINO_BAUD=115200 \
BACKEND_URL=https://himadri.aus1in.me \
BACKEND_DEVICE_KEY=replace-with-the-same-secret \
npm start
```

`BACKEND_URL` defaults to `https://himadri.aus1in.me`, so it may be omitted.
Set it explicitly to `http://localhost:8000` only when running a local backend.
Set `BACKEND_DEVICE_KEY` only when the deployed backend has
`DIGITAL_TWIN_INGEST_KEY` configured; the values must match.

`GET /api/iot/status` includes `backendRelay.enabled`, `connected`,
`lastSuccess`, and `lastError`, so deployment can be checked without exposing
the secret.

Dashboard: `http://localhost:3001/`

Status API: `http://localhost:3001/api/iot/status`

Require `arduinoConnected: true` and `telemetryStale: false`. `dhtConnected`
means a valid DHT reading arrived inside the Uno packet; it is no longer a
second serial-port connection.

## Python Raspberry Pi gateway

`gateway.py` is a lightweight alternative when only serial-to-backend relay is
needed (it does not serve the local dashboard). It translates the Uno packet
to the same `/api/telemetry/ingest` contract used by `server.js` and omits
readings for sensors that currently report `null`.

```bash
cd /home/pi/PolarTwin/himadri/PolarTwinDualBoard/server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
ARDUINO_PORT=/dev/ttyACM0 \
ARDUINO_BAUD=115200 \
BACKEND_URL=https://himadri.aus1in.me \
BACKEND_DEVICE_KEY=replace-with-the-same-secret \
python gateway.py
```

Do not run `gateway.py` and `server.js` against the same serial port at the
same time. Only one process can own the Arduino connection.
