#pragma once

#include <Arduino.h>

// Single-board Arduino Uno pin map. Every sensor is connected to this Uno;
// D0/D1 are reserved for the USB serial link to the Node gateway.
namespace PinConfig {
constexpr uint8_t DHT_DATA = 2;
constexpr uint8_t BUZZER = 3;
constexpr uint8_t IR_OUT = 4;
constexpr uint8_t RGB_RED = 5;
constexpr uint8_t RGB_GREEN = 6;
constexpr uint8_t ULTRASONIC_TRIG = 7;
constexpr uint8_t ULTRASONIC_ECHO = 8;
constexpr uint8_t SERVO_SIGNAL = 9;
constexpr uint8_t HALL_DIGITAL = 10;
constexpr uint8_t RGB_BLUE = 11;
constexpr uint8_t STATUS_LED = 12;
// D13 is still spare (unused), same as the original project.

constexpr uint8_t MQ2_ANALOG = A0;
constexpr uint8_t ACCEL_X = A1;
constexpr uint8_t ACCEL_Y = A2;
constexpr uint8_t ACCEL_Z = A3;

// A4/SDA and A5/SCL are reserved for an optional I2C OLED.
}

namespace SystemConfig {
constexpr unsigned long SERIAL_BAUD = 115200UL;

constexpr unsigned long ACCEL_INTERVAL_MS = 100UL;       // 10 Hz
constexpr unsigned long DIGITAL_INTERVAL_MS = 100UL;     // IR/Hall, 10 Hz
constexpr unsigned long ULTRASONIC_INTERVAL_MS = 200UL;  // 5 Hz
constexpr unsigned long MQ2_INTERVAL_MS = 500UL;         // 2 Hz
constexpr unsigned long DHT_INTERVAL_MS = 2000UL;        // 0.5 Hz
constexpr unsigned long TELEMETRY_INTERVAL_MS = 500UL;   // 2 Hz

// Live clean-air calibration on this sensor (2026-09-27): 300 samples were
// 405-746 raw, with p95=714. Trigger above that observed ceiling and require
// a lower value to clear so ADC noise cannot chatter the alarm.
constexpr int GAS_ALERT_ON_RAW = 800;
constexpr int GAS_ALERT_OFF_RAW = 750;
constexpr float HIGH_TEMPERATURE_C = 30.0F;
constexpr float PROXIMITY_WARNING_CM = 20.0F;
// Relative to the straight orientation captured during the first 3 seconds
// after reset. Separate ON/OFF values prevent stationary-noise chatter.
constexpr float TILT_ALERT_ON_DEG = 10.0F;
constexpr float TILT_ALERT_OFF_DEG = 5.0F;
constexpr float ACCEL_DEVIATION_ALERT_ON_MS2 = 1.5F;
constexpr float ACCEL_DEVIATION_ALERT_OFF_MS2 = 0.75F;

constexpr bool IR_ACTIVE_LOW = true;
constexpr bool HALL_ACTIVE_LOW = true;
constexpr bool RGB_COMMON_ANODE = false;
constexpr uint8_t DHT_TYPE = 11;  // DHT11

constexpr float ADC_REFERENCE_V = 5.0F;
constexpr float ACCEL_ZERO_G_V = 1.65F;
constexpr float ACCEL_SENSITIVITY_V_PER_G = 0.300F;
constexpr float STANDARD_GRAVITY_MS2 = 9.80665F;
constexpr unsigned long ULTRASONIC_TIMEOUT_US = 25000UL;

}
