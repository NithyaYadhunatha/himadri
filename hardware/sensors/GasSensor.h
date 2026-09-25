#pragma once

#include <Arduino.h>

class GasSensor {
 public:
  explicit GasSensor(uint8_t pin) : pin_(pin) {}
  void begin() { pinMode(pin_, INPUT); }
  int readRaw() {
    analogRead(pin_);
    return analogRead(pin_);
  }

 private:
  uint8_t pin_;
};
