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
  if (args.is<JsonObjectConst>() && resultData.as<JsonObject>().size() == 0) {
    JsonObject state = resultData["state"].to<JsonObject>();
    for (JsonPairConst kv : args.as<JsonObjectConst>()) {
      state[kv.key()] = kv.value();
    }
  }
  ok = true;
  message = String("applied");
}

void user_on_desired(JsonVariantConst desired,
                     JsonDocument& reportedOut,
                     bool& ok,
                     String& message) {
  if (desired.is<JsonObjectConst>()) {
    for (JsonPairConst kv : desired.as<JsonObjectConst>()) {
      reportedOut[kv.key()] = kv.value();
    }
  } else if (!desired.isNull()) {
    reportedOut["value"] = desired;
  }
  ok = true;
  message = String("applied");
}

void user_periodic_state(JsonDocument& stateOut, bool& hasUpdate) {
  hasUpdate = false;
  unsigned long now = millis();
  if (lastDhtReadMs && (now - lastDhtReadMs) < kDhtIntervalMs) return;
  lastDhtReadMs = now;

  float humidity = dht.readHumidity();
  float tempC = dht.readTemperature();
  if (isnan(humidity) || isnan(tempC)) return;

  JsonObject dhtObj = stateOut["dht11"].to<JsonObject>();
  dhtObj["temp_c"] = tempC;
  dhtObj["humidity"] = humidity;
  dhtObj["pin"] = kDhtPin;
  stateOut["ts"] = now;
  hasUpdate = true;
}
