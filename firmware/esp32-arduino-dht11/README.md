## ESP32 Firmware (DHT11 / Arduino + PlatformIO)

This variant clones the original BLE-provisioned MQTT firmware and adds a DHT11 temperature/humidity sensor readout. The baseline firmware remains in `firmware/esp32-arduino`.

### Wiring (ESP32-S3 + DHT11)
- VCC → 3.3V (use the board regulator; avoid 5V on GPIO)
- GND → GND
- DATA → GPIO42
- Pull-up: 4.7k–10k between DATA and 3.3V recommended

### Behavior
- Same BLE UUIDs as the base firmware:
  - Service: `c0de0001-0000-4af1-86a2-7b2e9e000001`
  - Characteristics: SSID `c0de1001-...`, Password `c0de1002-...`, MQTT URL `c0de1003-...`, Device ID `c0de1004-...`, Control `c0de1005-...` (value `PROVISION`), Status `c0de1006-...` (notify), MQTT User `c0de1007-...` (optional), MQTT Pass `c0de1008-...` (optional)
- After provisioning, publishes retained state to `devices/{device_id}/state` with firmware tag `0.1.0-dht11` and sensor data:
  ```json
  {
    "fw": "0.1.0-dht11",
    "ts": 123456,
    "dht11": { "temp_c": 24.5, "humidity": 48.0, "pin": 42 }
  }
  ```
- Online/offline heartbeat topic remains `devices/{device_id}/status`.
- `user_periodic_state` pushes fresh DHT11 readings roughly every 2s; failed reads are skipped.

### Build & Flash (PlatformIO)
- Prerequisites: VSCode + PlatformIO extension, or `pip install platformio`
- Build: `pio run`
- Upload: `pio run -t upload`
- Monitor: `pio run -t monitor`

### Notes
- MQTT URL format: `tcp://host:port` (WebSockets not supported).
- Keep the device close during BLE provisioning; ensure the broker is reachable from the ESP32 network.
