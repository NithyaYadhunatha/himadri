#pragma once

#include <Arduino.h>

class GasSensor {
 public:
  explicit GasSensor(uint8_t pin)
      : pin_(pin), filteredRaw_(0), initialized_(false) {}
  void begin() { pinMode(pin_, INPUT); }
  int readRaw() {
    analogRead(pin_);
    const int sample = analogRead(pin_);
    if (!initialized_) {
      filteredRaw_ = sample;
      initialized_ = true;
    } else {
      // 1/8 exponential smoothing at 2 Hz: responsive to sustained smoke,
      // stable against individual noisy ADC samples.
      filteredRaw_ = (filteredRaw_ * 7L + sample + 4L) / 8L;
    }
    return filteredRaw_;
  }

 private:
  uint8_t pin_;
  int filteredRaw_;
  bool initialized_;
};
