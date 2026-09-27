# PolarTwin single-Arduino gateway

The Raspberry Pi gateway reads one Arduino Uno JSON stream, serves the local
dashboard, and sends validated physical readings to the deployed HIMADRI
backend over HTTP. The backend pushes those changes to Maitri over WebSocket.
It does not require MQTT or an ESP8266.

```bash
cd /Users/adityasingh/projects/SIH/PolarTwin/himadri/PolarTwinDualBoard/server
ARDUINO_PORT=/dev/cu.usbserial-A5069RR4 \
ARDUINO_BAUD=115200 \
BACKEND_URL=http://localhost:8000 \
npm start
```

For a Raspberry Pi sending directly to the deployed backend, use its public
base URL (without `/api/telemetry/ingest`) and the device key configured on
the backend:

```bash
cd /home/pi/PolarTwin/himadri/PolarTwinDualBoard/server
ARDUINO_PORT=/dev/ttyACM0 \
ARDUINO_BAUD=115200 \
BACKEND_URL=https://your-backend.example.com \
BACKEND_DEVICE_KEY=replace-with-the-same-secret \
npm start
```

`GET /api/iot/status` includes `backendRelay.enabled`, `connected`,
`lastSuccess`, and `lastError`, so deployment can be checked without exposing
the secret.

Dashboard: `http://localhost:3001/`

Status API: `http://localhost:3001/api/iot/status`

Require `arduinoConnected: true` and `telemetryStale: false`. `dhtConnected`
means a valid DHT reading arrived inside the Uno packet; it is no longer a
second serial-port connection.
