#pragma once

#include <Arduino.h>

// Polling state machine: unlike pulseIn(), update() never waits for an echo.
class UltrasonicSensor {
 public:
  UltrasonicSensor(uint8_t triggerPin, uint8_t echoPin, unsigned long timeoutUs)
      : triggerPin_(triggerPin), echoPin_(echoPin), timeoutUs_(timeoutUs),
        state_(IDLE), stateStartedUs_(0), measurementStartedUs_(0),
        echoStartedUs_(0), readingReady_(false), readingValid_(false),
        distanceCm_(NAN) {}

  void begin() {
    pinMode(triggerPin_, OUTPUT);
    pinMode(echoPin_, INPUT);
    digitalWrite(triggerPin_, LOW);
  }
  bool start(unsigned long nowUs) {
    if (state_ != IDLE) return false;
    readingReady_ = false;
    digitalWrite(triggerPin_, LOW);
    stateStartedUs_ = nowUs;
    measurementStartedUs_ = nowUs;
    state_ = TRIGGER_LOW;
    return true;
  }
  void update(unsigned long nowUs) {
    switch (state_) {
      case IDLE: return;
      case TRIGGER_LOW:
        if (nowUs - stateStartedUs_ >= 2UL) {
          digitalWrite(triggerPin_, HIGH);
          stateStartedUs_ = nowUs;
          state_ = TRIGGER_HIGH;
        }
        break;
      case TRIGGER_HIGH:
        if (nowUs - stateStartedUs_ >= 10UL) {
          digitalWrite(triggerPin_, LOW);
          state_ = WAIT_ECHO_HIGH;
        }
        break;
      case WAIT_ECHO_HIGH:
        if (digitalRead(echoPin_) == HIGH) {
          echoStartedUs_ = nowUs;
          state_ = WAIT_ECHO_LOW;
        } else if (nowUs - measurementStartedUs_ >= timeoutUs_) {
          finish(false, 0UL);
        }
        break;
      case WAIT_ECHO_LOW:
        if (digitalRead(echoPin_) == LOW) {
          finish(true, nowUs - echoStartedUs_);
        } else if (nowUs - measurementStartedUs_ >= timeoutUs_) {
          finish(false, 0UL);
        }
        break;
    }
  }
  bool isBusy() const { return state_ != IDLE; }
  bool takeReading(float &distanceCm, bool &valid) {
    if (!readingReady_) return false;
    readingReady_ = false;
    distanceCm = distanceCm_;
    valid = readingValid_;
    return true;
  }

 private:
  enum State { IDLE, TRIGGER_LOW, TRIGGER_HIGH, WAIT_ECHO_HIGH, WAIT_ECHO_LOW };
  void finish(bool valid, unsigned long durationUs) {
    readingValid_ = valid;
    distanceCm_ = valid ? durationUs * 0.0343F * 0.5F : NAN;
    readingReady_ = true;
    state_ = IDLE;
  }
  uint8_t triggerPin_, echoPin_;
  unsigned long timeoutUs_;
  State state_;
  unsigned long stateStartedUs_, measurementStartedUs_, echoStartedUs_;
  bool readingReady_, readingValid_;
  float distanceCm_;
};
