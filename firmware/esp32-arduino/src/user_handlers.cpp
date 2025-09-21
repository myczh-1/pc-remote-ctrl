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
  (void)args; (void)resultData;
  ok = false;
  message = String("unknown action: ") + action;
}

void user_periodic_state(JsonDocument& stateOut, bool& hasUpdate) {
  (void)stateOut;
  hasUpdate = false;
}

