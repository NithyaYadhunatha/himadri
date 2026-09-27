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
        standardGravity_(standardGravity), filteredX_(0.0F), filteredY_(0.0F),
        filteredZ_(0.0F), baselineX_(0.0F), baselineY_(0.0F),
        baselineZ_(0.0F), baselineMagnitude_(0.0F), calibrationSumX_(0.0F),
        calibrationSumY_(0.0F), calibrationSumZ_(0.0F), initialized_(false),
        calibrated_(false), sampleFault_(false), calibrationCount_(0) {}

  void begin() {
    pinMode(xPin_, INPUT);
    pinMode(yPin_, INPUT);
    pinMode(zPin_, INPUT);
  }

  bool zeroCurrent() {
    if (!initialized_) return false;
    baselineX_ = filteredX_;
    baselineY_ = filteredY_;
    baselineZ_ = filteredZ_;
    baselineMagnitude_ = sqrt(baselineX_ * baselineX_ +
                              baselineY_ * baselineY_ +
                              baselineZ_ * baselineZ_);
    calibrated_ = baselineMagnitude_ > 0.01F;
    calibrationSumX_ = calibrationSumY_ = calibrationSumZ_ = 0.0F;
    calibrationCount_ = 0;
    return calibrated_;
  }

  bool read(float &x, float &y, float &z, float &tiltDeg,
            float &accelerationDeviation) {
    sampleFault_ = false;
    const float sampleX = readAxisMs2(xPin_);
    const float sampleY = readAxisMs2(yPin_);
    const float sampleZ = readAxisMs2(zPin_);
    if (sampleFault_) {
      initialized_ = false;
      calibrated_ = false;
      calibrationSumX_ = calibrationSumY_ = calibrationSumZ_ = 0.0F;
      calibrationCount_ = 0;
      return false;
    }
    const float sampleMagnitude =
        sqrt(sampleX * sampleX + sampleY * sampleY + sampleZ * sampleZ);
    // A stationary ADXL335 should be close to 1g total. Reject disconnected,
    // floating, or railed analog inputs instead of turning them into alerts.
    if (!isfinite(sampleX) || !isfinite(sampleY) || !isfinite(sampleZ) ||
        sampleMagnitude < standardGravity_ * 0.20F ||
        sampleMagnitude > standardGravity_ * 3.0F) {
      initialized_ = false;
      return false;
    }

    if (!initialized_) {
      filteredX_ = sampleX;
      filteredY_ = sampleY;
      filteredZ_ = sampleZ;
      initialized_ = true;
    } else {
      // 1/8 EMA after 16 ADC samples per axis suppresses stationary jitter
      // while retaining sustained movement/tilt changes.
      filteredX_ += (sampleX - filteredX_) * 0.125F;
      filteredY_ += (sampleY - filteredY_) * 0.125F;
      filteredZ_ += (sampleZ - filteredZ_) * 0.125F;
    }
    const float absoluteX = filteredX_;
    const float absoluteY = filteredY_;
    const float absoluteZ = filteredZ_;
    const float magnitude = sqrt(absoluteX * absoluteX +
                                 absoluteY * absoluteY +
                                 absoluteZ * absoluteZ);

    // Treat the first 30 valid samples (about three seconds at 10 Hz) as the
    // installed zero reference. The module may have axis offset or may not be
    // mounted with a textbook 1g vector, so calibration intentionally accepts
    // any already-validated vector. Keep the sensor still while the Uno starts.
    if (!calibrated_) {
      calibrationSumX_ += absoluteX;
      calibrationSumY_ += absoluteY;
      calibrationSumZ_ += absoluteZ;
      ++calibrationCount_;
      if (calibrationCount_ < 30) return false;
      baselineX_ = calibrationSumX_ / calibrationCount_;
      baselineY_ = calibrationSumY_ / calibrationCount_;
      baselineZ_ = calibrationSumZ_ / calibrationCount_;
      baselineMagnitude_ = sqrt(baselineX_ * baselineX_ +
                                baselineY_ * baselineY_ +
                                baselineZ_ * baselineZ_);
      calibrated_ = baselineMagnitude_ > 0.01F;
      if (!calibrated_) return false;
    }

    // Angle between the current gravity vector and the saved straight vector.
    float cosine = (absoluteX * baselineX_ + absoluteY * baselineY_ +
                    absoluteZ * baselineZ_) /
                   (magnitude * baselineMagnitude_);
    if (cosine > 1.0F) cosine = 1.0F;
    if (cosine < -1.0F) cosine = -1.0F;
    tiltDeg = acos(cosine) * 57.2957795F;
    const float deltaX = absoluteX - baselineX_;
    const float deltaY = absoluteY - baselineY_;
    const float deltaZ = absoluteZ - baselineZ_;
    accelerationDeviation =
        sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
    // Publish relative acceleration. Match the stationary display deadband
    // to the firmware's 1.5 m/s^2 movement-alert threshold: normal ADC drift
    // displays exactly 0,0,0, while meaningful movement exposes every axis.
    constexpr float stationaryDeadbandMs2 = 1.5F;
    if (accelerationDeviation < stationaryDeadbandMs2) {
      x = y = z = 0.0F;
    } else {
      x = deltaX;
      y = deltaY;
      z = deltaZ;
    }
    return true;
  }

 private:
  float readAxisMs2(uint8_t pin) {
    analogRead(pin);
    long total = 0;
    for (uint8_t i = 0; i < 16; ++i) total += analogRead(pin);
    const int raw = static_cast<int>((total + 8L) / 16L);
    const float volts = raw * (adcReferenceV_ / 1023.0F);
    // The ADXL335 is a 3.3V device. A measured axis above this margin proves
    // that the analog input is floating/miswired or the module is mispowered.
    if (volts > 3.45F) sampleFault_ = true;
    return ((volts - zeroGV_) / sensitivityVPerG_) * standardGravity_;
  }

  uint8_t xPin_, yPin_, zPin_;
  float adcReferenceV_, zeroGV_, sensitivityVPerG_, standardGravity_;
  float filteredX_, filteredY_, filteredZ_;
  float baselineX_, baselineY_, baselineZ_, baselineMagnitude_;
  float calibrationSumX_, calibrationSumY_, calibrationSumZ_;
  bool initialized_, calibrated_;
  bool sampleFault_;
  uint8_t calibrationCount_;
};
