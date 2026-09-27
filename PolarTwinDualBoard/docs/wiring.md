# Arduino Uno wiring

Disconnect the former Arduino-to-ESP8266 D0/D1 wires. D0/D1 must be used only
by the Uno USB serial interface so uploads, commands, and telemetry do not
electrically contend with a second board.

| Module | Module pin | Arduino Uno | Notes |
|---|---|---|---|
| DHT11 (3-pin) | DATA | D2 | Module VCC to 5 V, GND to GND |
| Buzzer module | SIG | D3 | Use a transistor driver if it is not a low-current module |
| IR module | OUT | D4 | Firmware treats the common active-low output as detected |
| RGB LED | R/G/B | D5/D6/D11 | Use one resistor per color channel |
| HC-SR04 | TRIG/ECHO | D7/D8 | VCC 5 V, GND common; Uno accepts 5 V ECHO |
| Servo | signal | D9 | Prefer a separate regulated 5 V supply, with common GND |
| Hall module | D0 | D10 | Firmware treats the common active-low output as detected |
| Status LED | anode/signal | D12 | Add a current-limiting resistor |
| MQ-2 | AO | A0 | Reported value is raw ADC 0-1023, not calibrated ppm |
| ADXL335 | X/Y/Z | A1/A2/A3 | Power from 3.3 V unless the exact module explicitly supports 5 V |
| SSD1306 OLED (optional) | SDA/SCL | A4/A5 | Reserved I2C pins; address normally 0x3C |

The USB serial device currently detected for this Uno on macOS is
`/dev/cu.usbserial-A5069RR4`; device names may change after reconnecting.
Firmware and gateway baud rate must both be 115200.
