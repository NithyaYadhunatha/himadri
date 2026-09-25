#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <avr/pgmspace.h>
#include <ctype.h>
#include <string.h>
#include "../core/SensorData.h"

// Text-only SSD1306 driver. It streams 5x7 glyphs directly over Wire instead
// of allocating Adafruit_SSD1306's 1024-byte framebuffer (half an Uno's SRAM).
class OLEDDisplay {
 public:
  OLEDDisplay(int width, int height, uint8_t address, unsigned long pageIntervalMs)
      : width_(width), height_(height), address_(address),
        pageIntervalMs_(pageIntervalMs), lastPageMs_(0), page_(0),
        available_(false) {}

  bool begin() {
    Wire.begin();
    Wire.setWireTimeout(25000, true);
    Wire.beginTransmission(address_);
    available_ = Wire.endTransmission() == 0;
    if (!available_) return false;
    static const uint8_t initSequence[] PROGMEM = {
      0xAE, 0xD5, 0x80, 0xA8, 0x3F, 0xD3, 0x00, 0x40,
      0x8D, 0x14, 0x20, 0x02, 0xA1, 0xC8, 0xDA, 0x12,
      0x81, 0xCF, 0xD9, 0xF1, 0xDB, 0x40, 0xA4, 0xA6, 0xAF
    };
    sendCommands(initSequence, sizeof(initSequence));
    clear();
    return true;
  }

  void refresh(const SensorData &data, const AlertState &alerts, unsigned long nowMs) {
    if (!available_) return;
    if (nowMs - lastPageMs_ >= pageIntervalMs_) {
      lastPageMs_ = nowMs;
      page_ = (page_ + 1) % 3;
    }
    writeLine(0, "POLAR TWIN UNO");
    writeLine(1, "---------------------");
    char line[22];
    if (page_ == 0) {
      makeFloatLine(line, "TEMP ", data.temperatureC, data.dhtValid, 1, " C");
      writeLine(2, line);
      makeFloatLine(line, "HUM  ", data.humidityPct, data.dhtValid, 0, " %");
      writeLine(3, line);
      writeLine(4, alerts.any ? "STATUS WARNING" : "STATUS NORMAL");
      writeLine(5, "");
    } else if (page_ == 1) {
      makeIntLine(line, "GAS  ", data.gasRaw, "");
      writeLine(2, line);
      makeFloatLine(line, "DIST ", data.distanceCm, data.distanceValid, 0, " CM");
      writeLine(3, line);
      strcpy(line, "IR ");
      strcat(line, alerts.occupancy ? "YES" : "NO");
      strcat(line, "  HALL ");
      strcat(line, alerts.hallEvent ? "ON" : "OFF");
      writeLine(4, line);
      writeLine(5, "");
    } else {
      makeFloatLine(line, "AX ", data.accelerationX, data.accelerationValid, 1, "");
      writeLine(2, line);
      makeFloatLine(line, "AY ", data.accelerationY, data.accelerationValid, 1, "");
      writeLine(3, line);
      makeFloatLine(line, "AZ ", data.accelerationZ, data.accelerationValid, 1, "");
      writeLine(4, line);
      writeLine(5, alerts.structural ? "STRUCT ALERT" : "STRUCT OK");
    }
  }

 private:
  static const uint8_t digits_[10][5] PROGMEM;
  static const uint8_t letters_[26][5] PROGMEM;

  void sendCommands(const uint8_t *commands, uint8_t length) {
    uint8_t offset = 0;
    while (offset < length) {
      Wire.beginTransmission(address_);
      Wire.write(0x00);
      uint8_t count = 0;
      while (offset < length && count < 28) {
        Wire.write(pgm_read_byte(commands + offset++));
        ++count;
      }
      Wire.endTransmission();
    }
  }

  void setPage(uint8_t page) {
    const uint8_t commands[] = {
      static_cast<uint8_t>(0xB0 | page), 0x00, 0x10
    };
    Wire.beginTransmission(address_);
    Wire.write(0x00);
    Wire.write(commands, sizeof(commands));
    Wire.endTransmission();
  }

  void beginData() { Wire.beginTransmission(address_); Wire.write(0x40); }

  void writeLine(uint8_t page, const char *text) {
    setPage(page);
    uint8_t bytesInPacket = 0;
    bool padding = false;
    beginData();
    for (uint8_t position = 0; position < 21; ++position) {
      char c = ' ';
      if (!padding) {
        if (*text == '\0') padding = true;
        else c = *text++;
      }
      for (uint8_t column = 0; column < 5; ++column) {
        Wire.write(glyphColumn(c, column));
        if (++bytesInPacket == 30) {
          Wire.endTransmission(); beginData(); bytesInPacket = 0;
        }
      }
      Wire.write(0x00);
      if (++bytesInPacket == 30) {
        Wire.endTransmission(); beginData(); bytesInPacket = 0;
      }
    }
    Wire.write(0x00); Wire.write(0x00);
    Wire.endTransmission();
  }

  void clear() {
    for (uint8_t page = 0; page < height_ / 8; ++page) writeLine(page, "");
  }

  uint8_t glyphColumn(char character, uint8_t column) const {
    const char c = toupper(static_cast<unsigned char>(character));
    if (c >= '0' && c <= '9') return pgm_read_byte(&digits_[c - '0'][column]);
    if (c >= 'A' && c <= 'Z') return pgm_read_byte(&letters_[c - 'A'][column]);
    if (c == '-') return 0x08;
    if (c == '.') return column == 1 || column == 2 ? 0x60 : 0x00;
    if (c == '%') {
      static const uint8_t percent[5] PROGMEM = {0x62, 0x64, 0x08, 0x13, 0x23};
      return pgm_read_byte(&percent[column]);
    }
    return 0x00;
  }

  void makeFloatLine(char *line, const char *prefix, float value, bool valid,
                     uint8_t decimals, const char *suffix) {
    strcpy(line, prefix);
    if (valid) {
      char number[12];
      dtostrf(value, 0, decimals, number);
      strcat(line, number);
    } else {
      strcat(line, "---");
    }
    strcat(line, suffix);
  }

  void makeIntLine(char *line, const char *prefix, int value, const char *suffix) {
    strcpy(line, prefix);
    char number[8];
    itoa(value, number, 10);
    strcat(line, number);
    strcat(line, suffix);
  }

  int width_, height_;
  uint8_t address_;
  unsigned long pageIntervalMs_, lastPageMs_;
  uint8_t page_;
  bool available_;
};

const uint8_t OLEDDisplay::digits_[10][5] PROGMEM = {
  {0x3E,0x51,0x49,0x45,0x3E}, {0x00,0x42,0x7F,0x40,0x00},
  {0x42,0x61,0x51,0x49,0x46}, {0x21,0x41,0x45,0x4B,0x31},
  {0x18,0x14,0x12,0x7F,0x10}, {0x27,0x45,0x45,0x45,0x39},
  {0x3C,0x4A,0x49,0x49,0x30}, {0x01,0x71,0x09,0x05,0x03},
  {0x36,0x49,0x49,0x49,0x36}, {0x06,0x49,0x49,0x29,0x1E}
};

const uint8_t OLEDDisplay::letters_[26][5] PROGMEM = {
  {0x7E,0x11,0x11,0x11,0x7E}, {0x7F,0x49,0x49,0x49,0x36},
  {0x3E,0x41,0x41,0x41,0x22}, {0x7F,0x41,0x41,0x22,0x1C},
  {0x7F,0x49,0x49,0x49,0x41}, {0x7F,0x09,0x09,0x09,0x01},
  {0x3E,0x41,0x49,0x49,0x7A}, {0x7F,0x08,0x08,0x08,0x7F},
  {0x00,0x41,0x7F,0x41,0x00}, {0x20,0x40,0x41,0x3F,0x01},
  {0x7F,0x08,0x14,0x22,0x41}, {0x7F,0x40,0x40,0x40,0x40},
  {0x7F,0x02,0x0C,0x02,0x7F}, {0x7F,0x04,0x08,0x10,0x7F},
  {0x3E,0x41,0x41,0x41,0x3E}, {0x7F,0x09,0x09,0x09,0x06},
  {0x3E,0x41,0x51,0x21,0x5E}, {0x7F,0x09,0x19,0x29,0x46},
  {0x46,0x49,0x49,0x49,0x31}, {0x01,0x01,0x7F,0x01,0x01},
  {0x3F,0x40,0x40,0x40,0x3F}, {0x1F,0x20,0x40,0x20,0x1F},
  {0x3F,0x40,0x38,0x40,0x3F}, {0x63,0x14,0x08,0x14,0x63},
  {0x07,0x08,0x70,0x08,0x07}, {0x61,0x51,0x49,0x45,0x43}
};
