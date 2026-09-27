#pragma once

#include <Arduino.h>

class RGBController {
 public:
  RGBController(uint8_t redPin, uint8_t greenPin, uint8_t bluePin,
                bool commonAnode)
      : redPin_(redPin), greenPin_(greenPin), bluePin_(bluePin),
        commonAnode_(commonAnode), manual_(false), manualR_(0), manualG_(0),
        manualB_(0) {}
  void begin() {
    pinMode(redPin_, OUTPUT); pinMode(greenPin_, OUTPUT); pinMode(bluePin_, OUTPUT);
    write(0, 0, 0);
  }
  void setManual(uint8_t red, uint8_t green, uint8_t blue) {
    manual_ = true; manualR_ = red; manualG_ = green; manualB_ = blue;
  }
  void applyAutomatic(uint8_t red, uint8_t green, uint8_t blue,
                      bool alertHasPriority) {
    if (manual_ && !alertHasPriority) write(manualR_, manualG_, manualB_);
    else write(red, green, blue);
  }

 private:
  void write(uint8_t red, uint8_t green, uint8_t blue) {
    analogWrite(redPin_, commonAnode_ ? 255 - red : red);
    analogWrite(greenPin_, commonAnode_ ? 255 - green : green);
    analogWrite(bluePin_, commonAnode_ ? 255 - blue : blue);
  }
  uint8_t redPin_, greenPin_, bluePin_;
  bool commonAnode_, manual_;
  uint8_t manualR_, manualG_, manualB_;
};
