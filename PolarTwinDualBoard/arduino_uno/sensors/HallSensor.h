#pragma once

#include <Arduino.h>

class HallSensor {
 public:
  HallSensor(uint8_t pin, bool activeLow) : pin_(pin), activeLow_(activeLow) {}
  void begin() { pinMode(pin_, activeLow_ ? INPUT_PULLUP : INPUT); }
  bool detected() const {
    return digitalRead(pin_) == (activeLow_ ? LOW : HIGH);
  }

 private:
  uint8_t pin_;
  bool activeLow_;
};
