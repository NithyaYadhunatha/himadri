// PolarTwinUno: one Arduino Uno telemetry node for all verified test modules.
// Output is JSON Lines at 115200 baud. No diagnostics are mixed into Serial.

#include "core/PinConfig.h"
#include "core/Scheduler.h"
#include "core/SensorData.h"
#include "sensors/DHTSensor.h"
#include "sensors/GasSensor.h"
#include "sensors/UltrasonicSensor.h"
#include "sensors/IRSensor.h"
#include "sensors/HallSensor.h"
#include "sensors/AccelerometerSensor.h"
#include "actuators/BuzzerController.h"
#include "actuators/RGBController.h"
#include "actuators/ServoController.h"
#include "actuators/StatusLED.h"
#include "display/OLEDDisplay.h"
#include <stdlib.h>
#include <string.h>

DHTSensor dhtSensor(PinConfig::DHT_DATA, SystemConfig::DHT_TYPE);
GasSensor gasSensor(PinConfig::MQ2_ANALOG);
UltrasonicSensor ultrasonicSensor(PinConfig::ULTRASONIC_TRIG,
                                  PinConfig::ULTRASONIC_ECHO,
                                  SystemConfig::ULTRASONIC_TIMEOUT_US);
IRSensor irSensor(PinConfig::IR_OUT, SystemConfig::IR_ACTIVE_LOW);
HallSensor hallSensor(PinConfig::HALL_DIGITAL, SystemConfig::HALL_ACTIVE_LOW);
AccelerometerSensor accelerometer(PinConfig::ACCEL_X, PinConfig::ACCEL_Y,
                                  PinConfig::ACCEL_Z,
                                  SystemConfig::ADC_REFERENCE_V,
                                  SystemConfig::ACCEL_ZERO_G_V,
                                  SystemConfig::ACCEL_SENSITIVITY_V_PER_G,
                                  SystemConfig::STANDARD_GRAVITY_MS2);

BuzzerController buzzer(PinConfig::BUZZER);
RGBController rgb(PinConfig::RGB_RED, PinConfig::RGB_GREEN,
                  PinConfig::RGB_BLUE, SystemConfig::RGB_COMMON_ANODE);
ServoController servo(PinConfig::SERVO_SIGNAL);
StatusLED statusLed(PinConfig::STATUS_LED);
OLEDDisplay oled(SystemConfig::OLED_WIDTH, SystemConfig::OLED_HEIGHT,
                 SystemConfig::OLED_ADDRESS,
                 SystemConfig::OLED_PAGE_INTERVAL_MS);

SensorData sensorData;
AlertState alerts;

PeriodicTask accelTask(SystemConfig::ACCEL_INTERVAL_MS);
PeriodicTask digitalTask(SystemConfig::DIGITAL_INTERVAL_MS);
PeriodicTask ultrasonicTask(SystemConfig::ULTRASONIC_INTERVAL_MS);
PeriodicTask gasTask(SystemConfig::MQ2_INTERVAL_MS);
PeriodicTask dhtTask(SystemConfig::DHT_INTERVAL_MS);
PeriodicTask oledTask(SystemConfig::OLED_INTERVAL_MS);
PeriodicTask telemetryTask(SystemConfig::TELEMETRY_INTERVAL_MS);

char commandBuffer[40];
uint8_t commandLength = 0;
bool discardCommand = false;
bool forceTelemetry = false;

void evaluateDigitalTwin() {
  alerts.highTemperature = sensorData.dhtValid &&
      sensorData.temperatureC >= SystemConfig::HIGH_TEMPERATURE_C;
  alerts.gas = sensorData.gasRaw >= SystemConfig::GAS_ALERT_RAW;
  alerts.proximity = sensorData.distanceValid &&
      sensorData.distanceCm <= SystemConfig::PROXIMITY_WARNING_CM;
  alerts.structural = sensorData.accelerationValid &&
      (sensorData.tiltDeg >= SystemConfig::TILT_WARNING_DEG ||
       sensorData.accelerationDeviation >=
           SystemConfig::ACCEL_DEVIATION_WARNING_MS2);
  alerts.occupancy = sensorData.irDetected;
  alerts.hallEvent = sensorData.hallDetected;
  alerts.any = alerts.highTemperature || alerts.gas || alerts.proximity ||
               alerts.structural;

  // Automatic audible alarm is intentionally limited to gas. BUZZER commands
  // create an explicit manual override (including a manual silence).
  buzzer.setAutomatic(alerts.gas);
  statusLed.set(alerts.any);
  if (alerts.gas) rgb.applyAutomatic(255, 0, 0, true);
  else if (alerts.structural) rgb.applyAutomatic(255, 0, 255, true);
  else if (alerts.highTemperature) rgb.applyAutomatic(255, 120, 0, true);
  else if (alerts.proximity) rgb.applyAutomatic(0, 0, 255, true);
  else rgb.applyAutomatic(0, 255, 0, false);
}

bool parseInteger(const char *text, long minimum, long maximum, long &value) {
  if (*text == '\0') return false;
  char *end = NULL;
  const long parsed = strtol(text, &end, 10);
  if (*end != '\0' || parsed < minimum || parsed > maximum) return false;
  value = parsed;
  return true;
}

bool parseRGB(const char *text, uint8_t &red, uint8_t &green, uint8_t &blue) {
  char *end = NULL;
  long values[3];
  for (uint8_t i = 0; i < 3; ++i) {
    if (*text == '\0') return false;
    values[i] = strtol(text, &end, 10);
    if (end == text || values[i] < 0 || values[i] > 255) return false;
    if (i < 2) {
      if (*end != ',') return false;
      text = end + 1;
    } else if (*end != '\0') {
      return false;
    }
  }
  red = values[0];
  green = values[1];
  blue = values[2];
  return true;
}

void handleCommand(char *command) {
  if (strncmp(command, "SERVO:", 6) == 0) {
    long angle;
    if (parseInteger(command + 6, 0, 180, angle)) servo.setAngle(angle);
  } else if (strcmp(command, "BUZZER:ON") == 0) {
    buzzer.setOverride(true);
  } else if (strcmp(command, "BUZZER:OFF") == 0) {
    buzzer.setOverride(false);
  } else if (strncmp(command, "RGB:", 4) == 0) {
    uint8_t red, green, blue;
    if (parseRGB(command + 4, red, green, blue)) {
      rgb.setManual(red, green, blue);
      evaluateDigitalTwin();
    }
  } else if (strcmp(command, "STATUS") == 0) {
    forceTelemetry = true;
  }
}

void readSerialCommands() {
  while (Serial.available() > 0) {
    const char c = static_cast<char>(Serial.read());
    if (c == '\r') continue;
    if (c == '\n') {
      if (!discardCommand && commandLength > 0) {
        commandBuffer[commandLength] = '\0';
        handleCommand(commandBuffer);
      }
      commandLength = 0;
      discardCommand = false;
    } else if (!discardCommand) {
      if (commandLength < sizeof(commandBuffer) - 1) {
        commandBuffer[commandLength++] = c;
      } else {
        commandLength = 0;
        discardCommand = true;
      }
    }
  }
}

void printNullable(float value, bool valid, uint8_t digits) {
  if (valid) Serial.print(value, digits);
  else Serial.print(F("null"));
}

void emitTelemetry() {
  Serial.print(F("{\"device\":\"polar-twin-uno\",\"timestamp_ms\":"));
  Serial.print(millis());
  Serial.print(F(",\"temperature_c\":"));
  printNullable(sensorData.temperatureC, sensorData.dhtValid, 1);
  Serial.print(F(",\"humidity_pct\":"));
  printNullable(sensorData.humidityPct, sensorData.dhtValid, 1);
  Serial.print(F(",\"gas_raw\":"));
  Serial.print(sensorData.gasRaw);
  Serial.print(F(",\"distance_cm\":"));
  printNullable(sensorData.distanceCm, sensorData.distanceValid, 1);
  Serial.print(F(",\"ir_detected\":"));
  Serial.print(sensorData.irDetected ? F("true") : F("false"));
  Serial.print(F(",\"hall_detected\":"));
  Serial.print(sensorData.hallDetected ? F("true") : F("false"));
  Serial.print(F(",\"acceleration\":{\"x\":"));
  printNullable(sensorData.accelerationX, sensorData.accelerationValid, 2);
  Serial.print(F(",\"y\":"));
  printNullable(sensorData.accelerationY, sensorData.accelerationValid, 2);
  Serial.print(F(",\"z\":"));
  printNullable(sensorData.accelerationZ, sensorData.accelerationValid, 2);
  Serial.print(F(",\"tilt_deg\":"));
  printNullable(sensorData.tiltDeg, sensorData.accelerationValid, 1);
  Serial.print(F("},\"alerts\":{\"high_temperature\":"));
  Serial.print(alerts.highTemperature ? F("true") : F("false"));
  Serial.print(F(",\"gas\":"));
  Serial.print(alerts.gas ? F("true") : F("false"));
  Serial.print(F(",\"proximity\":"));
  Serial.print(alerts.proximity ? F("true") : F("false"));
  Serial.print(F(",\"structural\":"));
  Serial.print(alerts.structural ? F("true") : F("false"));
  Serial.print(F("},\"state\":{\"occupancy\":"));
  Serial.print(alerts.occupancy ? F("true") : F("false"));
  Serial.print(F(",\"hall_event\":"));
  Serial.print(alerts.hallEvent ? F("true") : F("false"));
  Serial.print(F("},\"system\":{\"alarm\":"));
  Serial.print(alerts.any ? F("true") : F("false"));
  Serial.print(F(",\"status\":\""));
  Serial.print(alerts.any ? F("WARNING") : F("NORMAL"));
  Serial.print(F("\",\"servo_angle\":"));
  Serial.print(servo.angle());
  Serial.print(F(",\"buzzer_on\":"));
  Serial.print(buzzer.isOn() ? F("true") : F("false"));
  Serial.println(F("}}"));
}

void setup() {
  Serial.begin(SystemConfig::SERIAL_BAUD);
  dhtSensor.begin();
  gasSensor.begin();
  ultrasonicSensor.begin();
  irSensor.begin();
  hallSensor.begin();
  accelerometer.begin();
  buzzer.begin();
  rgb.begin();
  servo.begin();
  statusLed.begin();
  oled.begin();  // Missing OLED is non-fatal; telemetry continues.
}

void loop() {
  // Sonar timing receives exclusive short loop iterations while an echo is in
  // flight. This preserves microsecond edge capture without pulseIn()/delay().
  ultrasonicSensor.update(micros());
  float measuredDistance;
  bool distanceValid;
  if (ultrasonicSensor.takeReading(measuredDistance, distanceValid)) {
    sensorData.distanceCm = measuredDistance;
    sensorData.distanceValid = distanceValid;
  }
  if (ultrasonicSensor.isBusy()) return;

  readSerialCommands();
  const unsigned long nowMs = millis();
  if (ultrasonicTask.due(nowMs)) {
    ultrasonicSensor.start(micros());
    return;
  }
  if (digitalTask.due(nowMs)) {
    sensorData.irDetected = irSensor.detected();
    sensorData.hallDetected = hallSensor.detected();
  }
  if (accelTask.due(nowMs)) {
    sensorData.accelerationValid = accelerometer.read(
        sensorData.accelerationX, sensorData.accelerationY,
        sensorData.accelerationZ, sensorData.tiltDeg,
        sensorData.accelerationDeviation);
  }
  if (gasTask.due(nowMs)) sensorData.gasRaw = gasSensor.readRaw();
  if (dhtTask.due(nowMs)) {
    sensorData.dhtValid = dhtSensor.read(sensorData.temperatureC,
                                         sensorData.humidityPct);
  }
  evaluateDigitalTwin();
  if (oledTask.due(nowMs)) oled.refresh(sensorData, alerts, nowMs);
  if (forceTelemetry || telemetryTask.due(nowMs)) {
    forceTelemetry = false;
    emitTelemetry();
  }
}
