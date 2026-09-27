#pragma once

#include <Arduino.h>
#include <DHT.h>

class DHTSensor {
 public:
  DHTSensor(uint8_t pin, uint8_t type) : dht_(pin, type) {}
  void begin() { dht_.begin(); }
  bool read(float &temperatureC, float &humidityPct) {
    const float humidity = dht_.readHumidity();
    const float temperature = dht_.readTemperature();
    if (isnan(humidity) || isnan(temperature) || humidity < 0.0F ||
        humidity > 100.0F || temperature < -40.0F || temperature > 80.0F) {
      return false;
    }
    temperatureC = temperature;
    humidityPct = humidity;
    return true;
  }

 private:
  DHT dht_;
};
