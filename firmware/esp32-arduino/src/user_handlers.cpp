#include "user_handlers.h"

// Default implementations: do nothing.

void user_init() {
  // Example: pinMode(3, OUTPUT);
}

void user_on_action(const String& action,
                    JsonVariantConst args,
                    JsonDocument& resultData,
                    bool& ok,
                    String& message) {
  if (args.is<JsonObject>() && resultData.as<JsonObject>().size() == 0) {
    JsonObject state = resultData.createNestedObject("state");
    for (JsonPair kv : args.as<JsonObject>()) {
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
  if (desired.is<JsonObject>()) {
    for (JsonPair kv : desired.as<JsonObject>()) {
      reportedOut[kv.key()] = kv.value();
    }
  } else if (!desired.isNull()) {
    reportedOut["value"] = desired;
  }
  ok = true;
  message = String("applied");
}

void user_periodic_state(JsonDocument& stateOut, bool& hasUpdate) {
  (void)stateOut;
  hasUpdate = false;
}
