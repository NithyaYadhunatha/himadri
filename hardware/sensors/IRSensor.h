#pragma once

#include <Arduino.h>

class IRSensor {
 public:
  IRSensor(uint8_t pin, bool activeLow) : pin_(pin), activeLow_(activeLow) {}
  void begin() { pinMode(pin_, INPUT); }
  bool detected() const {
    return digitalRead(pin_) == (activeLow_ ? LOW : HIGH);
  }

 private:
  uint8_t pin_;
  bool activeLow_;
};
