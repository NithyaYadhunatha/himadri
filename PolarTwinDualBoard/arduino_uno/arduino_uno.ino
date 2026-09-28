// PolarTwin Arduino node. The Uno owns the analogue/environment sensors and
// actuators. HC-SR04, IR and servo are owned by the Raspberry Pi gateway. The
// independent Pi status process owns the OLED.

#include "core/PinConfig.h"
#include "core/Scheduler.h"
#include "core/SensorData.h"
#include "sensors/DHTSensor.h"
#include "sensors/GasSensor.h"
#include "sensors/HallSensor.h"
#include "sensors/AccelerometerSensor.h"
#include "actuators/BuzzerController.h"
#include "actuators/RGBController.h"
#include "actuators/StatusLED.h"
#include <stdlib.h>
#include <string.h>

DHTSensor dhtSensor(PinConfig::DHT_DATA, SystemConfig::DHT_TYPE);
GasSensor gasSensor(PinConfig::MQ2_ANALOG);
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
StatusLED statusLed(PinConfig::STATUS_LED);

SensorData sensorData;
AlertState alerts;

PeriodicTask accelTask(SystemConfig::ACCEL_INTERVAL_MS);
PeriodicTask digitalTask(SystemConfig::DIGITAL_INTERVAL_MS);
PeriodicTask gasTask(SystemConfig::MQ2_INTERVAL_MS);
PeriodicTask dhtTask(SystemConfig::DHT_INTERVAL_MS);
PeriodicTask telemetryTask(SystemConfig::TELEMETRY_INTERVAL_MS);

char commandBuffer[40];
uint8_t commandLength = 0;
bool discardCommand = false;
bool forceTelemetry = false;

void evaluateDigitalTwin() {
  alerts.highTemperature = sensorData.dhtValid &&
      sensorData.temperatureC >= SystemConfig::HIGH_TEMPERATURE_C;
  if (alerts.gas) {
    if (sensorData.gasRaw <= SystemConfig::GAS_ALERT_OFF_RAW) alerts.gas = false;
  } else if (sensorData.gasRaw >= SystemConfig::GAS_ALERT_ON_RAW) {
    alerts.gas = true;
  }
  // Proximity and occupancy are evaluated by the Pi from its local sensors.
  alerts.proximity = false;
  if (!sensorData.accelerationValid) {
    alerts.structural = false;
  } else if (alerts.structural) {
    if (sensorData.tiltDeg <= SystemConfig::TILT_ALERT_OFF_DEG &&
        sensorData.accelerationDeviation <=
            SystemConfig::ACCEL_DEVIATION_ALERT_OFF_MS2) {
      alerts.structural = false;
    }
  } else if (sensorData.tiltDeg >= SystemConfig::TILT_ALERT_ON_DEG ||
             sensorData.accelerationDeviation >=
                 SystemConfig::ACCEL_DEVIATION_ALERT_ON_MS2) {
    alerts.structural = true;
  }
  alerts.occupancy = false;
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
  if (strcmp(command, "BUZZER:ON") == 0) {
    buzzer.setOverride(true);
  } else if (strcmp(command, "BUZZER:OFF") == 0) {
    buzzer.setOverride(false);
  } else if (strncmp(command, "RGB:", 4) == 0) {
    uint8_t red, green, blue;
    if (parseRGB(command + 4, red, green, blue)) {
      rgb.setManual(red, green, blue);
      evaluateDigitalTwin();
    }
  } else if (strcmp(command, "ACCEL:ZERO") == 0) {
    if (accelerometer.zeroCurrent()) forceTelemetry = true;
  } else if (strcmp(command, "STATUS") == 0) {
    forceTelemetry = true;
  }
}

// Drain commands sent by the local Node gateway over USB Serial.
void drainCommands(Stream &in) {
  while (in.available() > 0) {
    const char c = static_cast<char>(in.read());
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

void printNullable(Print &out, float value, bool valid, uint8_t digits) {
  if (valid) out.print(value, digits);
  else out.print(F("null"));
}

void emitTelemetry(Print &out) {
  out.print(F("{\"device\":\"polar-twin-uno\",\"timestamp_ms\":"));
  out.print(millis());
  out.print(F(",\"temperature_c\":"));
  printNullable(out, sensorData.temperatureC, sensorData.dhtValid, 1);
  out.print(F(",\"humidity_pct\":"));
  printNullable(out, sensorData.humidityPct, sensorData.dhtValid, 1);
  out.print(F(",\"gas_raw\":"));
  out.print(sensorData.gasRaw);
  // These null placeholders make the ownership boundary explicit. The Pi
  // gateway replaces them with its GPIO readings before HTTP ingestion.
  out.print(F(",\"distance_cm\":null,\"ir_detected\":null"));
  out.print(F(",\"hall_detected\":"));
  out.print(sensorData.hallDetected ? F("true") : F("false"));
  out.print(F(",\"acceleration\":{\"x\":"));
  printNullable(out, sensorData.accelerationX, sensorData.accelerationValid, 2);
  out.print(F(",\"y\":"));
  printNullable(out, sensorData.accelerationY, sensorData.accelerationValid, 2);
  out.print(F(",\"z\":"));
  printNullable(out, sensorData.accelerationZ, sensorData.accelerationValid, 2);
  out.print(F(",\"tilt_deg\":"));
  printNullable(out, sensorData.tiltDeg, sensorData.accelerationValid, 1);
  out.print(F("},\"alerts\":{\"high_temperature\":"));
  out.print(alerts.highTemperature ? F("true") : F("false"));
  out.print(F(",\"gas\":"));
  out.print(alerts.gas ? F("true") : F("false"));
  out.print(F(",\"proximity\":"));
  out.print(alerts.proximity ? F("true") : F("false"));
  out.print(F(",\"structural\":"));
  out.print(alerts.structural ? F("true") : F("false"));
  out.print(F("},\"state\":{\"occupancy\":"));
  out.print(alerts.occupancy ? F("true") : F("false"));
  out.print(F(",\"hall_event\":"));
  out.print(alerts.hallEvent ? F("true") : F("false"));
  out.print(F("},\"system\":{\"alarm\":"));
  out.print(alerts.any ? F("true") : F("false"));
  out.print(F(",\"status\":\""));
  out.print(alerts.any ? F("WARNING") : F("NORMAL"));
  out.print(F("\",\"servo_angle\":null"));
  out.print(F(",\"buzzer_on\":"));
  out.print(buzzer.isOn() ? F("true") : F("false"));
  out.println(F("}}"));
}

void setup() {
  Serial.begin(SystemConfig::SERIAL_BAUD);
  dhtSensor.begin();
  gasSensor.begin();
  hallSensor.begin();
  accelerometer.begin();
  buzzer.begin();
  rgb.begin();
  statusLed.begin();
}

void loop() {
  drainCommands(Serial);
  const unsigned long nowMs = millis();
  if (digitalTask.due(nowMs)) {
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
  if (forceTelemetry || telemetryTask.due(nowMs)) {
    forceTelemetry = false;
    emitTelemetry(Serial);  // -> USB -> Raspberry Pi gateway -> HTTP backend
  }
}
