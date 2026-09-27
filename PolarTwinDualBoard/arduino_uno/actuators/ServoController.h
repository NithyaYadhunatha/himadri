#pragma once

#include <Arduino.h>
#include <Servo.h>

class ServoController {
 public:
  explicit ServoController(uint8_t pin) : pin_(pin), angle_(90) {}
  void begin() { servo_.attach(pin_, 500, 2400); setAngle(angle_); }
  void setAngle(int angle) { angle_ = constrain(angle, 0, 180); servo_.write(angle_); }
  int angle() const { return angle_; }

 private:
  uint8_t pin_;
  int angle_;
  Servo servo_;
};
