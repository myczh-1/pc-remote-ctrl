## ESP32 Firmware (Arduino/PlatformIO)

This firmware enables BLE provisioning and MQTT integration to complete the end-to-end flow:
- Web Bluetooth writes Wi‑Fi, MQTT, and Device ID via GATT
- ESP32 connects to Wi‑Fi and MQTT
- Publishes online status and initial state
- Subscribes to action calls and publishes action results

### UUIDs (must match frontend)
- Service: `c0de0001-0000-4af1-86a2-7b2e9e000001`
- Characteristics:
  - SSID (Write):        `c0de1001-0000-4af1-86a2-7b2e9e000001`
  - Password (Write):    `c0de1002-0000-4af1-86a2-7b2e9e000001`
  - MQTT URL (Write):    `c0de1003-0000-4af1-86a2-7b2e9e000001` (e.g. `tcp://192.168.1.10:1883`)
  - Device ID (Write):   `c0de1004-0000-4af1-86a2-7b2e9e000001`
  - Control (Write):     `c0de1005-0000-4af1-86a2-7b2e9e000001` (value: `PROVISION`)
  - Status (Notify):     `c0de1006-0000-4af1-86a2-7b2e9e000001` (JSON notifications)
  - MQTT User (Write):   `c0de1007-0000-4af1-86a2-7b2e9e000001` (optional)
  - MQTT Pass (Write):   `c0de1008-0000-4af1-86a2-7b2e9e000001` (optional)

### Build & Flash (PlatformIO)
- Prerequisites: VSCode + PlatformIO extension, or `pip install platformio`
- Build: `pio run`
- Upload: `pio run -t upload`
- Monitor: `pio run -t monitor`

### Topics
- Publish (retain recommended for state):
  - `devices/{device_id}/status` → `online` / `offline`
  - `devices/{device_id}/state`  → JSON (e.g., `{ "fw": "0.1.0" }`)
- Subscribe:
  - `devices/{device_id}/actions/+/call` (payload JSON: `{ "corr_id":"...", "args":{...} }`)
- Result publish:
  - `devices/{device_id}/actions/{action}/result` → `{ "corr_id":"...", "ok":true, "message":"done", "data":{...} }`

### Notes
- BLE advertises the Service UUID so frontend can filter by service in the future.
- MQTT URL supports `tcp://host:port`. WebSocket endpoints are not supported in this sketch.
- Keep device near your computer during provisioning. Ensure your broker is reachable by the ESP32.
