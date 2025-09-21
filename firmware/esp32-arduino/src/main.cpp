#include <Arduino.h>
#include <WiFi.h>
#include <NimBLEDevice.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "user_handlers.h"

// UUIDs must match frontend
static const char* SVC_UUID       = "c0de0001-0000-4af1-86a2-7b2e9e000001";
static const char* SSID_UUID      = "c0de1001-0000-4af1-86a2-7b2e9e000001";
static const char* PASS_UUID      = "c0de1002-0000-4af1-86a2-7b2e9e000001";
static const char* MQTT_URL_UUID  = "c0de1003-0000-4af1-86a2-7b2e9e000001";
static const char* DEVICE_ID_UUID = "c0de1004-0000-4af1-86a2-7b2e9e000001";
static const char* CONTROL_UUID   = "c0de1005-0000-4af1-86a2-7b2e9e000001";
static const char* STATUS_UUID    = "c0de1006-0000-4af1-86a2-7b2e9e000001";
static const char* MQTT_USER_UUID = "c0de1007-0000-4af1-86a2-7b2e9e000001"; // optional
static const char* MQTT_PASS_UUID = "c0de1008-0000-4af1-86a2-7b2e9e000001"; // optional

// Globals
static String g_ssid, g_pass, g_mqttUrl, g_deviceId, g_mqttUser, g_mqttPass;

// BLE
static NimBLEServer* g_server = nullptr;
static NimBLECharacteristic* g_statusCh = nullptr;
static volatile bool g_provisionRequested = false; // set in BLE callback, handled in loop()

// MQTT
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
static String g_mqttHost; static uint16_t g_mqttPort = 1883;
static unsigned long lastStateMs = 0;

static void notifyStatus(bool ok, const char* stage, const char* message) {
  if (!g_statusCh) return;
  StaticJsonDocument<256> doc;
  doc["ok"] = ok;
  if (stage) doc["stage"] = stage;
  if (message) doc["message"] = message;
  char buf[256]; size_t n = serializeJson(doc, buf, sizeof(buf));
  g_statusCh->setValue((uint8_t*)buf, n);
  g_statusCh->notify();
}

static bool parseMqttUrl(const String& url, String& hostOut, uint16_t& portOut) {
  // expected: tcp://host:port
  String s = url;
  s.trim();
  if (s.startsWith("tcp://")) s = s.substring(6);
  int colon = s.lastIndexOf(':');
  if (colon <= 0) return false;
  hostOut = s.substring(0, colon);
  portOut = (uint16_t)s.substring(colon + 1).toInt();
  return hostOut.length() > 0 && portOut > 0;
}

static void publishOnline(bool online) {
  if (g_deviceId.isEmpty()) return;
  String topic = "devices/" + g_deviceId + "/status";
  mqtt.publish(topic.c_str(), online ? "online" : "offline", false);
}

static void publishInitialState() {
  if (g_deviceId.isEmpty()) return;
  String topic = "devices/" + g_deviceId + "/state";
  StaticJsonDocument<256> doc;
  doc["fw"] = "0.1.0";
  doc["ts"] = (uint32_t) (millis());
  char buf[256]; size_t n = serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topic.c_str(), buf, true /*retain*/);
}

static String extractActionFromTopic(const char* topic) {
  // devices/{id}/actions/{action}/call
  String t(topic);
  int idxCall = t.lastIndexOf("/call");
  if (idxCall < 0) return String();
  String pre = t.substring(0, idxCall);
  int lastSlash = pre.lastIndexOf('/');
  if (lastSlash < 0) return String();
  return pre.substring(lastSlash + 1);
}

static void onMqttMessage(char* topic, uint8_t* payload, unsigned int length) {
  String action = extractActionFromTopic(topic);
  String corrId;
  StaticJsonDocument<384> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (!err) {
    if (doc["corr_id"].is<String>()) corrId = (const char*)doc["corr_id"];
  }
  // Delegate to user handler
  bool ok = false; String message;
  StaticJsonDocument<512> resultData;
  JsonVariantConst args = doc.containsKey("args") ? doc["args"].as<JsonVariantConst>() : JsonVariantConst();
  user_on_action(action, args, resultData, ok, message);

  // Build result payload
  String resTopic = String("devices/") + g_deviceId + "/actions/" + action + "/result";
  StaticJsonDocument<768> out;
  if (corrId.length()) out["corr_id"] = corrId;
  out["ok"] = ok;
  out["message"] = message.length() ? message.c_str() : (ok ? "done" : "error");
  if (!resultData.isNull()) {
    JsonObject data = out.createNestedObject("data");
    for (JsonPair kv : resultData.as<JsonObject>()) data[kv.key()] = kv.value();
  }
  char buf[768]; size_t n = serializeJson(out, buf, sizeof(buf));
  mqtt.publish(resTopic.c_str(), buf, false);
}

static bool ensureMqttConnected() {
  if (mqtt.connected()) return true;
  if (g_mqttHost.isEmpty() || g_deviceId.isEmpty()) return false;
  mqtt.setServer(g_mqttHost.c_str(), g_mqttPort);
  mqtt.setCallback(onMqttMessage);
  String clientId = String("esp32-") + String((uint32_t)ESP.getEfuseMac(), HEX);
  bool ok;
  if (g_mqttUser.length()) ok = mqtt.connect(clientId.c_str(), g_mqttUser.c_str(), g_mqttPass.c_str());
  else ok = mqtt.connect(clientId.c_str());
  if (!ok) return false;
  // subscribe to action calls
  String sub = String("devices/") + g_deviceId + "/actions/+/call";
  mqtt.subscribe(sub.c_str());
  publishOnline(true);
  publishInitialState();
  return true;
}

static void doProvision() {
  notifyStatus(false, "wifi", "connecting");
  WiFi.mode(WIFI_STA);
  WiFi.begin(g_ssid.c_str(), g_pass.c_str());
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(300);
  }
  if (WiFi.status() != WL_CONNECTED) {
    notifyStatus(false, "wifi", "failed");
    return;
  }
  notifyStatus(true, "wifi", "ok");

  // MQTT
  if (!parseMqttUrl(g_mqttUrl, g_mqttHost, g_mqttPort)) {
    notifyStatus(false, "mqtt", "invalid url");
    return;
  }
  notifyStatus(false, "mqtt", "connecting");
  unsigned long mstart = millis();
  while (!ensureMqttConnected() && millis() - mstart < 15000) {
    delay(300);
  }
  if (!mqtt.connected()) {
    notifyStatus(false, "mqtt", "failed");
    return;
  }
  notifyStatus(true, "mqtt", "ok");
}

class WriteCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c) override {
    std::string v = c->getValue();
    if (c->getUUID().equals(NimBLEUUID(SSID_UUID)))        { g_ssid     = String(v.c_str()); }
    else if (c->getUUID().equals(NimBLEUUID(PASS_UUID)))   { g_pass     = String(v.c_str()); }
    else if (c->getUUID().equals(NimBLEUUID(MQTT_URL_UUID))){ g_mqttUrl  = String(v.c_str()); }
    else if (c->getUUID().equals(NimBLEUUID(DEVICE_ID_UUID))){ g_deviceId= String(v.c_str()); }
    else if (c->getUUID().equals(NimBLEUUID(MQTT_USER_UUID))){ g_mqttUser= String(v.c_str()); }
    else if (c->getUUID().equals(NimBLEUUID(MQTT_PASS_UUID))){ g_mqttPass= String(v.c_str()); }
    else if (c->getUUID().equals(NimBLEUUID(CONTROL_UUID))) {
      if (v == "PROVISION") { g_provisionRequested = true; }
    }
  }
};

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("ESP32 BLE Provisioning + MQTT");
  // Increase MQTT packet buffer for JSON payloads
  mqtt.setBufferSize(1024);
  // User initialization (GPIO/ADC/etc.)
  user_init();

  NimBLEDevice::init("PC-Dev");
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);
  g_server = NimBLEDevice::createServer();
  NimBLEService* svc = g_server->createService(SVC_UUID);
  auto writeProps = (NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  auto notifyProps = (NIMBLE_PROPERTY::NOTIFY | NIMBLE_PROPERTY::READ);

  NimBLECharacteristic* ssidCh  = svc->createCharacteristic(SSID_UUID, writeProps);
  NimBLECharacteristic* passCh  = svc->createCharacteristic(PASS_UUID, writeProps);
  NimBLECharacteristic* urlCh   = svc->createCharacteristic(MQTT_URL_UUID, writeProps);
  NimBLECharacteristic* idCh    = svc->createCharacteristic(DEVICE_ID_UUID, writeProps);
  NimBLECharacteristic* ctlCh   = svc->createCharacteristic(CONTROL_UUID, writeProps);
  NimBLECharacteristic* userCh  = svc->createCharacteristic(MQTT_USER_UUID, writeProps);
  NimBLECharacteristic* mpwCh   = svc->createCharacteristic(MQTT_PASS_UUID, writeProps);
  g_statusCh                   = svc->createCharacteristic(STATUS_UUID, notifyProps);

  static WriteCB wcb; // static lifetime
  ssidCh->setCallbacks(&wcb); passCh->setCallbacks(&wcb); urlCh->setCallbacks(&wcb);
  idCh->setCallbacks(&wcb);   ctlCh->setCallbacks(&wcb); userCh->setCallbacks(&wcb); mpwCh->setCallbacks(&wcb);

  svc->start();
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(svc->getUUID());
  adv->setScanResponse(true);
  adv->setName("PC-Dev");
  NimBLEDevice::startAdvertising();
  Serial.println("BLE advertising started");
}

void loop() {
  // Handle provisioning request outside BLE callback
  if (g_provisionRequested) { g_provisionRequested = false; doProvision(); }
  // Maintain MQTT connection if provisioned
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqtt.connected()) {
      ensureMqttConnected();
    } else {
      mqtt.loop();
      // heartbeat state publish every 30s
      if (millis() - lastStateMs > 30000) {
        publishInitialState();
        lastStateMs = millis();
      }
      // user periodic state
      StaticJsonDocument<512> st;
      bool has = false;
      user_periodic_state(st, has);
      if (has && !g_deviceId.isEmpty()) {
        String topic = "devices/" + g_deviceId + "/state";
        char sbuf[512]; size_t sn = serializeJson(st, sbuf, sizeof(sbuf));
        mqtt.publish(topic.c_str(), sbuf, true);
      }
    }
  }
  delay(10);
}
