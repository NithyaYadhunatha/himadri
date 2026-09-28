#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <stdlib.h>

#include "../core/SensorData.h"

// Low-RAM 128x64 SSD1306 driver. U8g2's single-page buffer mode redraws the
// screen in 8-row strips instead of holding a full 1024-byte framebuffer, so
// it fits safely alongside this sketch's other sensor/actuator state on the
// Uno's 2KB SRAM. A full Adafruit_SSD1306 framebuffer left too little
// headroom here and made init unreliable even though the display answers
// correctly on the I2C bus (see PolarTwinDualBoard/docs/wiring.md).
class OLEDDisplay {
 public:
  explicit OLEDDisplay(uint8_t i2cAddress)
      : address_(i2cAddress), display_(U8G2_R0, U8X8_PIN_NONE), ready_(false) {}

  bool begin() {
    Wire.begin();
    Wire.setWireTimeout(25000, true);
    // U8g2 does not reliably report a missing display, so probe presence on
    // the bus ourselves first (the same technique an I2C scanner uses).
    Wire.beginTransmission(address_);
    ready_ = (Wire.endTransmission() == 0);
    if (ready_) {
      display_.setI2CAddress(address_ << 1);
      display_.begin();
      display_.setFont(u8g2_font_6x10_tf);
      display_.setFontPosTop();
    }
    return ready_;
  }

  bool isReady() const { return ready_; }

  void render(const SensorData &data, const AlertState &alerts) {
    if (!ready_) return;
    char line1[16];
    char line2[16];
    char line3[16];
    char line4[16];
    char line5[16];

    formatValue(line1, sizeof(line1), "T:", data.temperatureC, data.dhtValid, 1, "C");
    formatValue(line2, sizeof(line2), "H:", data.humidityPct, data.dhtValid, 0, "%");
    snprintf(line3, sizeof(line3), "Gas:%d", data.gasRaw);
    formatValue(line4, sizeof(line4), "Dist:", data.distanceCm, data.distanceValid, 1, "cm");
    snprintf(line5, sizeof(line5), "IR:%c Hall:%c", data.irDetected ? 'Y' : 'N',
             data.hallDetected ? 'Y' : 'N');
    const char *statusLine = alerts.any ? "*** WARNING ***" : "Status: NORMAL";

    display_.firstPage();
    do {
      display_.drawStr(0, 0, line1);
      display_.drawStr(64, 0, line2);
      display_.drawStr(0, 12, line3);
      display_.drawStr(0, 24, line4);
      display_.drawStr(0, 36, line5);
      display_.drawStr(0, 50, statusLine);
    } while (display_.nextPage());
  }

 private:
  void formatValue(char *buf, size_t len, const char *label, float value,
                    bool valid, uint8_t digits, const char *unit) {
    if (valid) {
      char numBuf[8];
      dtostrf(value, 0, digits, numBuf);
      snprintf(buf, len, "%s%s%s", label, numBuf, unit);
    } else {
      snprintf(buf, len, "%s--%s", label, unit);
    }
  }

  uint8_t address_;
  U8G2_SSD1306_128X64_NONAME_1_HW_I2C display_;
  bool ready_;
};
