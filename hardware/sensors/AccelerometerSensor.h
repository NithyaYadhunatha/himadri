#pragma once

#include <Arduino.h>
#include <math.h>

class AccelerometerSensor {
 public:
  AccelerometerSensor(uint8_t xPin, uint8_t yPin, uint8_t zPin,
                      float adcReferenceV, float zeroGV,
                      float sensitivityVPerG, float standardGravity)
      : xPin_(xPin), yPin_(yPin), zPin_(zPin),
        adcReferenceV_(adcReferenceV), zeroGV_(zeroGV),
        sensitivityVPerG_(sensitivityVPerG),
        standardGravity_(standardGravity) {}

  void begin() {
    pinMode(xPin_, INPUT);
    pinMode(yPin_, INPUT);
    pinMode(zPin_, INPUT);
  }

  bool read(float &x, float &y, float &z, float &tiltDeg,
            float &accelerationDeviation) {
    x = readAxisMs2(xPin_);
    y = readAxisMs2(yPin_);
    z = readAxisMs2(zPin_);
    const float magnitude = sqrt(x * x + y * y + z * z);
    if (!isfinite(x) || !isfinite(y) || !isfinite(z) || magnitude < 0.01F) {
      return false;
    }
    float cosine = z / magnitude;
    if (cosine > 1.0F) cosine = 1.0F;
    if (cosine < -1.0F) cosine = -1.0F;
    tiltDeg = acos(cosine) * 57.2957795F;
    accelerationDeviation = fabs(magnitude - standardGravity_);
    return true;
  }

 private:
  float readAxisMs2(uint8_t pin) {
    analogRead(pin);
    const int raw = analogRead(pin);
    const float volts = raw * (adcReferenceV_ / 1023.0F);
    return ((volts - zeroGV_) / sensitivityVPerG_) * standardGravity_;
  }

  uint8_t xPin_, yPin_, zPin_;
  float adcReferenceV_, zeroGV_, sensitivityVPerG_, standardGravity_;
};
