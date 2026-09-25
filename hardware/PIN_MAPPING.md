# PolarTwinUno pin mapping

## Final allocation

| Uno pin | Component pin | Mode | Supply | External parts / notes | Why this pin |
|---|---|---|---|---|---|
| D0/RX | USB serial RX | Reserved | 5 V logic | None | Required for commands at 115200 baud |
| D1/TX | USB serial TX | Reserved | 5 V logic | None | Required for JSONL telemetry |
| D2 | DHT11 DATA/OUT | Digital input | 5 V | Bare DHT11 needs 10 kOhm pull-up from DATA to VCC | DHT needs neither PWM nor external interrupt |
| D3 | Buzzer S/IN | Digital output | Normally 5 V | Use a transistor and flyback diode for inductive/high-current loads | Matches tested active buzzer; PWM is not used |
| D4 | IR sensor OUT | Digital input | 5 V | Tested module needs no extra part | Ordinary active-low digital input |
| D5 | RGB red | PWM output | 5 V circuit | 220–330 ohm series resistor | Timer0 PWM remains available with Servo |
| D6 | RGB green | PWM output | 5 V circuit | 220–330 ohm series resistor | Timer0 PWM remains available with Servo |
| D7 | HC-SR04 TRIG | Digital output | 5 V | None on Uno | No PWM needed |
| D8 | HC-SR04 ECHO | Digital input | 5 V | No divider on 5 V Uno | Non-blocking polling input |
| D9 | SG90 signal | Servo output | External regulated 5 V recommended | Common ground; local bulk capacitor may help | Servo library can drive an ordinary digital pin |
| D10 | Hall module D0 | Digital input/pull-up | 5 V | LM393 D0 is commonly open-collector | Models a state/event without spending an analog pin |
| D11 | RGB blue | PWM output | 5 V circuit | 220–330 ohm series resistor | Timer2 PWM is unaffected by Servo/Timer1 |
| D12 | Status LED anode | Digital output | 5 V circuit | 220–330 ohm series resistor; cathode to GND | Remaining ordinary digital output |
| D13 | Built-in/debug LED | Unused | On-board | No wiring | Only spare general-purpose digital pin |
| A0 | MQ-2 AO | Analog input | 5 V module | Heater draws substantial current; AO must stay within 0–5 V | Provides changing 0–1023 telemetry; D0 is unused |
| A1 | ADXL335 X | Analog input | 3.3 V sensor | No divider at 3.3 V | Three analog axes verified by reference sketch |
| A2 | ADXL335 Y | Analog input | 3.3 V sensor | No divider at 3.3 V | Dedicated acceleration axis |
| A3 | ADXL335 Z | Analog input | 3.3 V sensor | No divider at 3.3 V | Dedicated acceleration axis |
| A4/SDA | OLED SDA | I2C | As marked, 3.3 V or 5 V | Check module pull-up voltage | Hardware I2C bus, exclusively SDA |
| A5/SCL | OLED SCL | I2C | As marked, 3.3 V or 5 V | Check module pull-up voltage | Hardware I2C bus, exclusively SCL |

All grounds must be common. Never power the servo from an I/O pin. A separate regulated 5 V servo supply with adequate transient current is recommended; connect its ground to Uno ground. The MQ-2 heater is also a relatively high continuous load. Budget the supply for MQ-2, servo, OLED, and LEDs together, and do not join two independently powered 5 V rails unless the power system is designed for it.

## Test-project inventory

| Folder | Hardware | Test pins | Interrupts | Libraries | Voltage / electrical notes |
|---|---|---|---|---|---|
| `AccelerometerTest` | ADXL335-style three-axis analog accelerometer, not MPU6050 | A0/A1/A2 analog | None | Core, `math.h` | Use 3.3 V unless breakout explicitly accepts 5 V; assumes 1.65 V zero-g, 0.300 V/g |
| `BuzzerTest` | Active buzzer; optional passive piezo | D3 output | None | Core; optional `tone()` | Commonly 5 V; use transistor if current is too high |
| `DHT11Test` | DHT11 | D7 digital | None | Adafruit DHT; Adafruit Unified Sensor dependency | 5 V in test; bare sensor needs 10 kOhm DATA pull-up |
| `HallEffectTest` | AO/D0 Hall module with LM393 comparator | D4 digital D0 | None | Core | 5 V; D0 commonly active-low/open-collector; AO deliberately unused |
| `I2COLEDTest` | 128x64 SSD1306 OLED at 0x3C | A4 SDA, A5 SCL | None directly | `Wire`, Adafruit GFX, Adafruit SSD1306 | Use 5 V only if module supports it; otherwise 3.3 V |
| `IRTest` | Digital IR obstacle sensor | D2 digital | None | Core | 5 V, commonly active-low |
| `LEDTest` | External LED | D8 output | None | Core | 220–330 ohm series resistor |
| `MQ2Test` | MQ-2 with AO and D0 | A0 analog, D2 digital | None | Core | 5 V heater/module; raw ADC is not ppm |
| `RGBLEDTest` | Four-leg RGB LED | D9/D10/D11 PWM | None | Core | One 220–330 ohm resistor per color; assumes common cathode |
| `ServoTest` | SG90-class servo | D9 signal | Timer1 ISR internal to library | Servo | Regulated 5 V supply recommended; common ground |
| `UltrasonicTest` | HC-SR04 | D9 TRIG, D10 ECHO | None | Core | 5 V; test used blocking `pulseIn()` |

No reference sketch attaches an external interrupt. The final firmware also uses no user-level interrupt; the core, Servo, UART, and I2C code use their normal internal hardware support.

## Conflicts found and resolved

- D2 was shared by IR and MQ-2 D0. The final design uses IR on D4 and only MQ-2 AO on A0.
- D4 was Hall D0 and a touch input in the old combined sketch. No touch project is in scope; Hall moves to D10.
- D7 was DHT11 in its test but becomes ultrasonic TRIG; DHT11 moves to D2.
- D8 was the standalone LED and Hall in older mappings. It becomes ultrasonic ECHO; status LED moves to D12.
- D9/D10 were claimed by RGB, Servo, and ultrasonic tests. Ultrasonic moves to D7/D8, Servo uses D9, Hall uses D10, and RGB uses D5/D6/D11.
- A0–A2 were used by the accelerometer while A0 was also MQ-2. MQ-2 keeps A0; accelerometer moves as a group to A1–A3.

## Servo and timer decision

On the ATmega328P Uno, Servo uses 16-bit Timer1. Once a Servo is attached, normal `analogWrite()` PWM on Timer1 pins D9 and D10 is unavailable. The servo signal can be on almost any digital pin because the library generates its pulses through Timer1 interrupts; it does not require a PWM pin.

The servo signal is on D9, but production code never calls `analogWrite()` on D9 or D10. RGB uses D5/D6 (Timer0) and D11 (Timer2), so all channels keep hardware PWM. The active buzzer uses `digitalWrite()`, not `tone()`, because `tone()` uses Timer2 on Uno and could disturb D11 blue PWM.

## I2C sharing and capacity

The OLED is the only verified I2C device. The accelerometer is analog. If it is physically replaced by an MPU6050 later, the MPU6050 should share A4/A5 with OLED; do not allocate software SDA/SCL pins. Confirm unique addresses, pull-up voltage, and voltage compatibility first.

The design leaves D13 unused, has no spare general-purpose analog input, and reserves A4/A5 for shared I2C. All requested modules can operate together with adequate power. A conventional SSD1306 framebuffer consumes about 1 KiB of the Uno's 2 KiB SRAM, so the production display driver streams text without a framebuffer and JSON is streamed from flash-backed fragments instead of assembled in a large buffer.
