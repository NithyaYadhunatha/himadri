#pragma once

#include <Arduino.h>

// Unsigned subtraction keeps scheduling correct when millis() wraps.
class PeriodicTask {
 public:
  explicit PeriodicTask(unsigned long intervalMs)
      : intervalMs_(intervalMs), lastRunMs_(0), initialized_(false) {}

  bool due(unsigned long nowMs, bool runImmediately = true) {
    if (!initialized_) {
      initialized_ = true;
      lastRunMs_ = nowMs;
      return runImmediately;
    }
    if (nowMs - lastRunMs_ < intervalMs_) return false;
    lastRunMs_ = nowMs;
    return true;
  }

 private:
  unsigned long intervalMs_;
  unsigned long lastRunMs_;
  bool initialized_;
};
