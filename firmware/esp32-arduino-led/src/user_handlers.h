// User extension hooks for device-specific logic
// Implement these in user_handlers.cpp to map actions and publish sensor state.

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

// Called once during setup() for user initialization (GPIO modes, ADC init, etc.)
void user_init();

// Called when an action arrives over MQTT.
// - action: action name (e.g., "power", "set_pwm")
// - args:   JSON object with parameters (may be empty)
// - resultData: filled by user with additional fields to include in result payload (optional)
// - ok/message: set to indicate success and human-readable message
void user_on_action(const String& action,
                    JsonVariantConst args,
                    JsonDocument& resultData,
                    bool& ok,
                    String& message);

// Called periodically from loop() to allow user to update device state.
// If hasUpdate is set true, the resulting stateOut JSON will be published to devices/{id}/state (retain).
void user_periodic_state(JsonDocument& stateOut, bool& hasUpdate);

