## ESP32 Firmware (LED / Arduino + PlatformIO)

LED 版本在 BLE+MQTT 基础上增加对板载 WS2812B (NeoPixel) 的控制与状态上报，保留原始固件于 `firmware/esp32-arduino`。

### 硬件/接线
- 板载 WS2812B（RGB 灯），数据脚 → GPIO48，供电 5V（板子已接好），需用 NeoPixel 库驱动。

### BLE UUID（与基线一致）
- Service: `c0de0001-0000-4af1-86a2-7b2e9e000001`
- Characteristics:
  - SSID: `c0de1001-0000-4af1-86a2-7b2e9e000001` (Write)
  - Password: `c0de1002-0000-4af1-86a2-7b2e9e000001` (Write)
  - MQTT URL: `c0de1003-0000-4af1-86a2-7b2e9e000001` (Write)
  - Device ID: `c0de1004-0000-4af1-86a2-7b2e9e000001` (Write)
  - Control: `c0de1005-0000-4af1-86a2-7b2e9e000001` (Write, value `PROVISION`)
  - Status: `c0de1006-0000-4af1-86a2-7b2e9e000001` (Notify)
  - MQTT User/Pass: `c0de1007/1008-...` (Write, 可选)

### 动作与状态
- Action: `led`，参数 `{ "color": "red" | "green" | "off" }`
  - 设置后立即回复 result，并更新 LED。
- State（每约 5s 发布一次 retain）：`devices/{device_id}/state`
  ```json
  {
    "fw": "0.1.0-led",
    "ts": 123456,
    "led": { "state": "red", "r": 255, "g": 0, "b": 0, "pin": 48 }
  }
  ```
- Online/offline: `devices/{device_id}/status` → `online` / `offline`

### 构建与烧录
- 依赖：PlatformIO，库已在 `platformio.ini` 声明（NimBLE、PubSubClient、ArduinoJson、Adafruit NeoPixel）。
- Build: `pio run`
- Upload: `pio run -t upload`
- Monitor: `pio run -t monitor`

### 注意
- MQTT 仅支持 `tcp://host:port`，需填写 Device ID，SSID/MQTT URL/Device ID 会自动 `trim` 去尾空格。
- 若 MQTT 连接失败，可看串口日志（已加入 WiFi/MQTT 调试输出）检查 URL/账号/网络可达性。
