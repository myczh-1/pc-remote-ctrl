#include "user_handlers.h"
#include <Adafruit_NeoPixel.h>

static const uint8_t kPixelPin = 48; // WS2812B data in
static const uint16_t kPixelCount = 1;
static Adafruit_NeoPixel pixels(kPixelCount, kPixelPin, NEO_GRB + NEO_KHZ800);

enum LedState { LED_OFF, LED_RED, LED_GREEN };
static LedState g_state = LED_OFF;
static unsigned long lastStatePublishMs = 0;

static void applyState(LedState s) {
  g_state = s;
  uint32_t color = 0;
  switch (s) {
    case LED_RED:   color = pixels.Color(255, 0, 0); break;
    case LED_GREEN: color = pixels.Color(0, 255, 0); break;
    case LED_OFF:   color = pixels.Color(0, 0, 0); break;
  }
  pixels.setPixelColor(0, color);
  pixels.show();
}

static LedState parseState(const String& v) {
  String s = v;
  s.toLowerCase();
  if (s == "red") return LED_RED;
  if (s == "green") return LED_GREEN;
  return LED_OFF;
}

static void fillState(JsonDocument& doc) {
  JsonObject led = doc.createNestedObject("led");
  const char* stateStr = (g_state == LED_RED) ? "red" : (g_state == LED_GREEN) ? "green" : "off";
  led["state"] = stateStr;
  led["pin"] = kPixelPin;
  switch (g_state) {
    case LED_RED:   led["r"] = 255; led["g"] = 0;   led["b"] = 0; break;
    case LED_GREEN: led["r"] = 0;   led["g"] = 255; led["b"] = 0; break;
    case LED_OFF:   led["r"] = 0;   led["g"] = 0;   led["b"] = 0; break;
  }
}

void user_init() {
  pixels.begin();
  pixels.setBrightness(50);
  applyState(LED_OFF);
}

void user_on_action(const String& action,
                    JsonVariantConst args,
                    JsonDocument& resultData,
                    bool& ok,
                    String& message) {
  if (action == "led") {
    if (!args.is<JsonObject>()) {
      ok = false; message = "args must be object with color";
      return;
    }
    String colorArg;
    auto obj = args.as<JsonObjectConst>();
if (!obj.isNull()) {
  if (obj["color"].is<const char*>()) {
    colorArg = obj["color"].as<const char*>();
  }
}

    LedState target = parseState(colorArg);
    applyState(target);
    fillState(resultData);
    ok = true; message = "ok";
    return;
  }
  ok = false;
  message = String("unknown action: ") + action;
}

void user_periodic_state(JsonDocument& stateOut, bool& hasUpdate) {
  unsigned long now = millis();
  if (now - lastStatePublishMs < 5000) {
    hasUpdate = false;
    return;
  }
  lastStatePublishMs = now;
  fillState(stateOut);
  stateOut["ts"] = now;
  hasUpdate = true;
}
