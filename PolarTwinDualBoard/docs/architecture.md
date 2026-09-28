# Single-Arduino architecture

```
DHT11 + MQ-2 + HC-SR04 + IR + Hall + ADXL335
                         |
                         v
                    Arduino Uno
                         |
               USB JSONL at 115200 baud
                         v
                  Node serial gateway
                         |
          HTTPS POST /api/v1/telemetry/ingest
                         v
             FastAPI digital-twin bridge
                         |
               WebSocket /ws/digital-twin
                         v
                    Maitri WebGL
```

The Uno is the sole hardware-value authority. On the Raspberry Pi, the Node
gateway validates each complete packet and posts only finite, currently
available readings to the deployed backend. The backend calculates status and
broadcasts updates to Maitri over WebSocket. This path does not require MQTT
or an ESP8266.

No simulated value is substituted when a sensor returns invalid data; that
device simply receives no new backend sample.
