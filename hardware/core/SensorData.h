#pragma once

#include <Arduino.h>
#include <math.h>

struct SensorData {
  float temperatureC;
  float humidityPct;
  bool dhtValid;
  int gasRaw;
  float distanceCm;
  bool distanceValid;
  bool irDetected;
  bool hallDetected;
  float accelerationX;
  float accelerationY;
  float accelerationZ;
  float tiltDeg;
  float accelerationDeviation;
  bool accelerationValid;

  SensorData()
      : temperatureC(NAN), humidityPct(NAN), dhtValid(false), gasRaw(0),
        distanceCm(NAN), distanceValid(false), irDetected(false),
        hallDetected(false), accelerationX(NAN), accelerationY(NAN),
        accelerationZ(NAN), tiltDeg(NAN), accelerationDeviation(NAN),
        accelerationValid(false) {}
};

struct AlertState {
  bool highTemperature;
  bool gas;
  bool proximity;
  bool structural;
  bool occupancy;
  bool hallEvent;
  bool any;

  AlertState()
      : highTemperature(false), gas(false), proximity(false),
        structural(false), occupancy(false), hallEvent(false), any(false) {}
};
