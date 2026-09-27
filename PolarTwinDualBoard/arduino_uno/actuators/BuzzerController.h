#pragma once

#include <Arduino.h>

class BuzzerController {
 public:
  explicit BuzzerController(uint8_t pin)
      : pin_(pin), automaticOn_(false), overrideEnabled_(false),
        overrideOn_(false), actualOn_(false) {}
  void begin() { pinMode(pin_, OUTPUT); digitalWrite(pin_, LOW); }
  void setAutomatic(bool on) { automaticOn_ = on; apply(); }
  void setOverride(bool on) { overrideEnabled_ = true; overrideOn_ = on; apply(); }
  bool isOn() const { return actualOn_; }

 private:
  void apply() {
    actualOn_ = overrideEnabled_ ? overrideOn_ : automaticOn_;
    digitalWrite(pin_, actualOn_ ? HIGH : LOW);
  }
  uint8_t pin_;
  bool automaticOn_, overrideEnabled_, overrideOn_, actualOn_;
};
