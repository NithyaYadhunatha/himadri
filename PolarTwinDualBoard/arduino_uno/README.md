# PolarTwinDualBoard - single Arduino Uno

This is now the production firmware. The Uno reads every physical sensor,
drives every actuator, and sends one validated JSON line over USB at 115200
baud. The ESP8266 firmware remains in the repository only as a legacy
reference and is not part of the runtime data path.

## Uno ports

| Uno port | Connection |
|---|---|
| D0/D1 | USB serial only; do not connect the ESP8266 |
| D2 | DHT11 DATA |
| D3 | Buzzer signal |
| D4 | IR sensor OUT |
| D5 | RGB red |
| D6 | RGB green |
| D7 | HC-SR04 TRIG |
| D8 | HC-SR04 ECHO |
| D9 | Servo signal |
| D10 | Hall sensor D0 |
| D11 | RGB blue |
| D12 | Status LED |
| A0 | MQ-2 AO |
| A1/A2/A3 | ADXL335 X/Y/Z |
| A4/A5 | Optional OLED SDA/SCL |

## Required libraries

- DHT sensor library by Adafruit
- Adafruit Unified Sensor
- Servo by Arduino

Upload `arduino_uno.ino` as an Arduino Uno sketch. Keep all grounds common.
Use an external regulated 5 V supply for the servo and MQ-2 heater if USB
power is unstable, and connect that supply ground to Uno GND.

Keep the ADXL335 completely still for the first three seconds after startup.
The firmware averages that installed position and reports it as X=0, Y=0,
Z=0; subsequent readings are acceleration relative to that startup baseline.
Send `ACCEL:ZERO`, or use the dashboard's **Zero ADXL335** button, to make
the sensor's current stationary pose the new zero reference at any time. A
1.5 m/s² vector deadband suppresses normal stationary ADC drift.

Start the gateway with the command in `../server/README.md`.
