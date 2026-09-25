// Standalone hardware diagnostic for the PolarTwin Uno wiring.
// Open Serial Monitor at 115200 baud. Prints one JSON object each second.
// Install "DHT sensor library" by Adafruit (and its Unified Sensor dependency).
#include <DHT.h>
#include <Servo.h>
#include <Wire.h>
#include <math.h>
#include <string.h>
#include <stdlib.h>

const byte DHT_PIN = 2, BUZZER_PIN = 3, IR_PIN = 4;
const byte RED_PIN = 5, GREEN_PIN = 6, TRIG_PIN = 7, ECHO_PIN = 8;
const byte SERVO_PIN = 9, HALL_PIN = 10, BLUE_PIN = 11, LED_PIN = 12;
const byte OLED_ADDRESS = 0x3C;

DHT dht(DHT_PIN, DHT11);
Servo doorServo;
float temperatureC = NAN, humidityPct = NAN;
bool dhtValid = false, buzzerOn = false, ledOn = false;
byte servoAngle = 90, red = 0, green = 0, blue = 0;
unsigned long lastDht = 0, lastReport = 0;
char command[40];
byte commandLength = 0;

void printBool(bool value) { Serial.print(value ? F("true") : F("false")); }
void printFloat(float value, byte places) {
  if (isnan(value) || isinf(value)) Serial.print(F("null"));
  else Serial.print(value, places);
}

bool oledResponds() {
  Wire.beginTransmission(OLED_ADDRESS);
  return Wire.endTransmission() == 0;
}

void setRgb(byte r, byte g, byte b) {
  red = r; green = g; blue = b;
  analogWrite(RED_PIN, red);
  analogWrite(GREEN_PIN, green);
  analogWrite(BLUE_PIN, blue);
}

void readDht() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  dhtValid = !isnan(h) && !isnan(t) && h >= 0 && h <= 100 && t >= -40 && t <= 80;
  if (dhtValid) { humidityPct = h; temperatureC = t; }
}

void handleCommand() {
  command[commandLength] = '\0';
  if (strcmp(command, "STATUS") == 0) {
    lastReport = 0;
  } else if (strcmp(command, "BUZZER:ON") == 0) {
    buzzerOn = true; digitalWrite(BUZZER_PIN, HIGH);
  } else if (strcmp(command, "BUZZER:OFF") == 0) {
    buzzerOn = false; digitalWrite(BUZZER_PIN, LOW);
  } else if (strcmp(command, "LED:ON") == 0) {
    ledOn = true; digitalWrite(LED_PIN, HIGH);
  } else if (strcmp(command, "LED:OFF") == 0) {
    ledOn = false; digitalWrite(LED_PIN, LOW);
  } else if (strncmp(command, "SERVO:", 6) == 0) {
    char *end;
    long angle = strtol(command + 6, &end, 10);
    if (end != command + 6 && *end == '\0' && angle >= 0 && angle <= 180) {
      servoAngle = angle; doorServo.write(servoAngle);
    }
  } else if (strncmp(command, "RGB:", 4) == 0) {
    int r, g, b; char extra;
    if (sscanf(command + 4, "%d,%d,%d%c", &r, &g, &b, &extra) == 3 &&
        r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
      setRgb(r, g, b);
    }
  }
}

void readCommands() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (commandLength) handleCommand();
      commandLength = 0;
    } else if (commandLength < sizeof(command) - 1) {
      command[commandLength++] = c;
    } else {
      commandLength = 0;
    }
  }
}

void report() {
  const int gas = analogRead(A0);
  const int rawX = analogRead(A1), rawY = analogRead(A2), rawZ = analogRead(A3);
  const float x = (rawX * 5.0F / 1023.0F - 1.65F) / 0.300F * 9.80665F;
  const float y = (rawY * 5.0F / 1023.0F - 1.65F) / 0.300F * 9.80665F;
  const float z = (rawZ * 5.0F / 1023.0F - 1.65F) / 0.300F * 9.80665F;
  const float magnitude = sqrt(x * x + y * y + z * z);
  const float tilt = magnitude > 0.01F ? acos(constrain(z / magnitude, -1.0F, 1.0F)) * 57.2957795F : NAN;
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  const unsigned long echoUs = pulseIn(ECHO_PIN, HIGH, 25000UL);
  const float distanceCm = echoUs ? echoUs * 0.0343F * 0.5F : NAN;
  const bool ir = digitalRead(IR_PIN) == LOW;
  const bool hall = digitalRead(HALL_PIN) == LOW;
  const bool oled = oledResponds();

  Serial.print(F("{\"device\":\"polar-twin-diagnostic\",\"timestamp_ms\":")); Serial.print(millis());
  Serial.print(F(",\"temperature_c\":")); printFloat(dhtValid ? temperatureC : NAN, 1);
  Serial.print(F(",\"humidity_pct\":")); printFloat(dhtValid ? humidityPct : NAN, 1);
  Serial.print(F(",\"dht_valid\":")); printBool(dhtValid);
  Serial.print(F(",\"gas_raw\":")); Serial.print(gas);
  Serial.print(F(",\"distance_cm\":")); printFloat(distanceCm, 1);
  Serial.print(F(",\"ir_detected\":")); printBool(ir);
  Serial.print(F(",\"hall_detected\":")); printBool(hall);
  Serial.print(F(",\"acceleration_raw\":{\"x\":")); Serial.print(rawX);
  Serial.print(F(",\"y\":")); Serial.print(rawY);
  Serial.print(F(",\"z\":")); Serial.print(rawZ);
  Serial.print(F("},\"acceleration_ms2\":{\"x\":")); printFloat(x, 2);
  Serial.print(F(",\"y\":")); printFloat(y, 2);
  Serial.print(F(",\"z\":")); printFloat(z, 2);
  Serial.print(F(",\"tilt_deg\":")); printFloat(tilt, 1);
  Serial.print(F("},\"oled_0x3c_detected\":")); printBool(oled);
  Serial.print(F(",\"outputs\":{\"servo_angle\":")); Serial.print(servoAngle);
  Serial.print(F(",\"buzzer_on\":")); printBool(buzzerOn);
  Serial.print(F(",\"status_led_on\":")); printBool(ledOn);
  Serial.print(F(",\"rgb\":[")); Serial.print(red); Serial.print(',');
  Serial.print(green); Serial.print(','); Serial.print(blue);
  Serial.println(F("]}}"));
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT); digitalWrite(BUZZER_PIN, LOW);
  pinMode(LED_PIN, OUTPUT); digitalWrite(LED_PIN, LOW);
  pinMode(IR_PIN, INPUT_PULLUP); pinMode(HALL_PIN, INPUT_PULLUP);
  pinMode(RED_PIN, OUTPUT); pinMode(GREEN_PIN, OUTPUT); pinMode(BLUE_PIN, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT); pinMode(ECHO_PIN, INPUT);
  setRgb(0, 0, 0);
  doorServo.attach(SERVO_PIN); doorServo.write(servoAngle);
  Wire.begin(); dht.begin();
  lastDht = millis();
}

void loop() {
  readCommands();
  unsigned long now = millis();
  if (now - lastDht >= 2000UL) { lastDht = now; readDht(); }
  if (now - lastReport >= 1000UL) { lastReport = now; report(); }
}
