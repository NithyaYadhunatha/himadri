#pragma once

#include <Arduino.h>

// PolarTwinUno hardware and tuning configuration. Keep installation-specific
// thresholds here so they can be calibrated without hunting through the code.
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

constexpr uint8_t MQ2_ANALOG = A0;
constexpr uint8_t ACCEL_X = A1;
constexpr uint8_t ACCEL_Y = A2;
constexpr uint8_t ACCEL_Z = A3;
// A4/SDA and A5/SCL are reserved exclusively for the I2C bus.
}

namespace SystemConfig {
constexpr unsigned long SERIAL_BAUD = 115200UL;

constexpr unsigned long ACCEL_INTERVAL_MS = 100UL;       // 10 Hz
constexpr unsigned long DIGITAL_INTERVAL_MS = 100UL;     // IR/Hall, 10 Hz
constexpr unsigned long ULTRASONIC_INTERVAL_MS = 200UL;  // 5 Hz
constexpr unsigned long MQ2_INTERVAL_MS = 500UL;         // 2 Hz
constexpr unsigned long DHT_INTERVAL_MS = 2000UL;        // 0.5 Hz
constexpr unsigned long OLED_INTERVAL_MS = 250UL;        // 4 Hz
constexpr unsigned long OLED_PAGE_INTERVAL_MS = 2000UL;
constexpr unsigned long TELEMETRY_INTERVAL_MS = 500UL;   // 2 Hz

constexpr int GAS_ALERT_RAW = 450;
constexpr float HIGH_TEMPERATURE_C = 30.0F;
constexpr float PROXIMITY_WARNING_CM = 20.0F;
constexpr float TILT_WARNING_DEG = 30.0F;
constexpr float ACCEL_DEVIATION_WARNING_MS2 = 2.5F;

constexpr bool IR_ACTIVE_LOW = true;
constexpr bool HALL_ACTIVE_LOW = true;
constexpr bool RGB_COMMON_ANODE = false;
constexpr uint8_t DHT_TYPE = 11;  // DHT11

constexpr float ADC_REFERENCE_V = 5.0F;
constexpr float ACCEL_ZERO_G_V = 1.65F;
constexpr float ACCEL_SENSITIVITY_V_PER_G = 0.300F;
constexpr float STANDARD_GRAVITY_MS2 = 9.80665F;

constexpr uint8_t OLED_ADDRESS = 0x3C;
constexpr int OLED_WIDTH = 128;
constexpr int OLED_HEIGHT = 64;
constexpr unsigned long ULTRASONIC_TIMEOUT_US = 25000UL;
}
