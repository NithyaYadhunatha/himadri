#pragma once

#include <Arduino.h>

class StatusLED {
 public:
  explicit StatusLED(uint8_t pin) : pin_(pin), on_(false) {}
  void begin() { pinMode(pin_, OUTPUT); set(false); }
  void set(bool on) { on_ = on; digitalWrite(pin_, on ? HIGH : LOW); }
  bool isOn() const { return on_; }

 private:
  uint8_t pin_;
  bool on_;
};
