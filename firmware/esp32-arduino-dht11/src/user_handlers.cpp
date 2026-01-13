#include "user_handlers.h"
#include <DHT.h>

static const uint8_t kDhtPin = 42;
static const uint32_t kDhtIntervalMs = 2000; // DHT11 needs at least ~1s between reads
static DHT dht(kDhtPin, DHT11);
static unsigned long lastDhtReadMs = 0;

void user_init() {
  dht.begin();
}

void user_on_action(const String& action,
                    JsonVariantConst args,
                    JsonDocument& resultData,
                    bool& ok,
                    String& message) {
  (void)args; (void)resultData;
  ok = false;
  message = String("unknown action: ") + action;
}

void user_periodic_state(JsonDocument& stateOut, bool& hasUpdate) {
  hasUpdate = false;
  unsigned long now = millis();
  if (lastDhtReadMs && (now - lastDhtReadMs) < kDhtIntervalMs) return;
  lastDhtReadMs = now;

  float humidity = dht.readHumidity();
  float tempC = dht.readTemperature();
  if (isnan(humidity) || isnan(tempC)) return;

  JsonObject dhtObj = stateOut.createNestedObject("dht11");
  dhtObj["temp_c"] = tempC;
  dhtObj["humidity"] = humidity;
  dhtObj["pin"] = kDhtPin;
  stateOut["ts"] = now;
  hasUpdate = true;
}
