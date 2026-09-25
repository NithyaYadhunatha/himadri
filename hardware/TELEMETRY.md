# PolarTwinUno telemetry and commands

## Transport

- USB serial: **115200 baud, 8-N-1**
- Format: JSON Lines, exactly one complete JSON object per line
- Normal telemetry rate: **2 Hz**
- `STATUS` requests one additional immediate telemetry object
- Failed sensor values are JSON `null`; diagnostic text is never mixed into Serial

```json
{"device":"polar-twin-uno","timestamp_ms":12530,"temperature_c":24.5,"humidity_pct":42.0,"gas_raw":315,"distance_cm":74.2,"ir_detected":false,"hall_detected":false,"acceleration":{"x":0.01,"y":-0.04,"z":9.78,"tilt_deg":0.3},"alerts":{"high_temperature":false,"gas":false,"proximity":false,"structural":false},"state":{"occupancy":false,"hall_event":false},"system":{"alarm":false,"status":"NORMAL","servo_angle":90,"buzzer_on":false}}
```

## Schema

| Field | Type / unit | Expected range | Source rate | Digital-twin meaning |
|---|---|---|---|---|
| `device` | string | `polar-twin-uno` | Every packet | Stable node identity |
| `timestamp_ms` | unsigned ms | 0–4,294,967,295 then wraps | Every packet | Uno uptime, not wall time |
| `temperature_c` | number/null, °C | DHT11 practical 0–50 | ~0.5 Hz | Environment temperature |
| `humidity_pct` | number/null, %RH | 0–100 | ~0.5 Hz | Relative humidity |
| `gas_raw` | integer ADC counts | 0–1023 | 2 Hz | Relative MQ-2 response, not ppm |
| `distance_cm` | number/null, cm | Nominally 2–400 | 5 Hz | Nearest reflecting target |
| `ir_detected` | boolean | true/false | 10 Hz | Interpreted IR presence state |
| `hall_detected` | boolean | true/false | 10 Hz | Hall comparator event/state |
| `acceleration.x/y/z` | number/null, m/s² | Installation-dependent | 10 Hz | Estimated ADXL335 acceleration |
| `acceleration.tilt_deg` | number/null, degrees | 0–180 | 10 Hz | Vector angle away from +Z |
| `alerts.high_temperature` | boolean | thresholded | Continuous evaluation | Temperature warning |
| `alerts.gas` | boolean | thresholded | Continuous evaluation | Gas/smoke warning |
| `alerts.proximity` | boolean | thresholded | Continuous evaluation | Too-close object warning |
| `alerts.structural` | boolean | thresholded | Continuous evaluation | Excess tilt or acceleration deviation |
| `state.occupancy` | boolean | true/false | Continuous evaluation | Presence derived from IR |
| `state.hall_event` | boolean | true/false | Continuous evaluation | Door/motor/magnetic state |
| `system.alarm` | boolean | true/false | Every packet | Any of the four warnings is active |
| `system.status` | string | `NORMAL`/`WARNING` | Every packet | Aggregate state |
| `system.servo_angle` | integer degrees | 0–180 | On command | Last commanded position |
| `system.buzzer_on` | boolean | true/false | Every packet | Actual buzzer output state |

`hall_raw` is intentionally absent. The Hall module has AO and D0, but all three accelerometer axes plus MQ-2 use A0–A3, and A4/A5 are I2C-only. Hall D0 directly represents the requested event/state without wasting an analog input.

Thresholds and calibration constants are centralized in `core/PinConfig.h`. MQ-2 counts depend on warm-up and environment. ADXL335 values depend on ADC reference, offset, sensitivity, orientation, and breakout wiring; calibrate before treating them as precise measurements.

## Actuator policy

- Gas: red RGB, status LED, buzzer.
- Structural: magenta RGB and status LED.
- High temperature: orange RGB and status LED.
- Proximity: blue RGB and status LED.
- Normal: green RGB, status LED off.
- Alarm colors override a manual RGB request.
- `BUZZER:ON/OFF` is a persistent manual override. `OFF` can silence automatic gas sound, while visual and JSON warnings remain.

## Commands

Send one uppercase ASCII line terminated by newline (`\r\n` is also accepted):

```text
SERVO:0
SERVO:90
SERVO:180
BUZZER:ON
BUZZER:OFF
RGB:255,0,0
RGB:0,255,0
STATUS
```

Out-of-range, malformed, unknown, and overlong commands are ignored. Parsing uses a fixed 40-byte buffer and never waits for input.
