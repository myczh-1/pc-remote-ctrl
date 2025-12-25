// Simple Web Bluetooth provisioning hook for Wi‑Fi + MQTT
// Notes:
// - Requires secure context (https or localhost)
// - UUIDs must match MCU firmware

export type ProvisionParams = {
  ssid: string
  password: string
  mqttUrl: string
  deviceId: string
  mqttUser?: string
  mqttPass?: string
}

export type ProvisionStage =
  | 'idle'
  | 'request_device'
  | 'gatt_connect'
  | 'write_params'
  | 'await_status'
  | 'done'

export type ProvisionEvent = {
  stage: ProvisionStage
  ok?: boolean
  message?: string
}

// Default UUIDs (example). Adjust in MCU firmware accordingly.
export const SERVICE_UUID = 'c0de0001-0000-4af1-86a2-7b2e9e000001'
export const SSID_CHAR = 'c0de1001-0000-4af1-86a2-7b2e9e000001'
export const PASS_CHAR = 'c0de1002-0000-4af1-86a2-7b2e9e000001'
export const MQTT_URL_CHAR = 'c0de1003-0000-4af1-86a2-7b2e9e000001'
export const DEVICE_ID_CHAR = 'c0de1004-0000-4af1-86a2-7b2e9e000001'
export const CONTROL_CHAR = 'c0de1005-0000-4af1-86a2-7b2e9e000001'
export const STATUS_CHAR = 'c0de1006-0000-4af1-86a2-7b2e9e000001'

const te = new TextEncoder()
const td = new TextDecoder()

export function useBleProvisioning() {
  // Casts to avoid TS DOM lib dependency; runtime objects provided by browser
  let device: any = null
  let server: any = null
  let service: any = null
  let statusChar: any = null

  async function getService() {
    if (!device) throw new Error('No device')
    server = device.gatt?.connected ? device.gatt! : await device.gatt!.connect()
    service = await server.getPrimaryService(SERVICE_UUID as any)
  }

  async function requestDevice(): Promise<void> {
    // Relax filtering to accept all devices; confirm service after connect.
    // This helps when firmware doesn't advertise the 128-bit service UUID.
    // @ts-expect-error navigator.bluetooth may be unavailable in some env
    const dev: any = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID as any],
    })
    device = dev
  }

  async function writeChar(uuid: any, value: string) {
    if (!service) throw new Error('No GATT service')
    const ch: any = await service.getCharacteristic(uuid as any)
    await ch.writeValue(te.encode(value))
  }

  function parseStatus(ev: Event): ProvisionEvent | null {
    const target = ev.target as any
    const dv = (target?.value as DataView) || new DataView(new ArrayBuffer(0))
    const s = td.decode(dv)
    try {
      const obj = JSON.parse(s)
      return { stage: 'await_status', ok: !!obj.ok, message: String(obj.message ?? obj.stage ?? '') }
    } catch {
      return { stage: 'await_status', ok: undefined, message: s }
    }
  }

  async function provision(params: ProvisionParams, onEvent?: (e: ProvisionEvent) => void): Promise<ProvisionEvent> {
    if (!(navigator as any).bluetooth) {
      throw new Error('当前浏览器不支持 Web Bluetooth')
    }
    onEvent?.({ stage: 'request_device' })
    await requestDevice()
    onEvent?.({ stage: 'gatt_connect' })
    await getService()
    onEvent?.({ stage: 'write_params', message: 'writing ssid' })
    await writeChar(SSID_CHAR as any, params.ssid)
    onEvent?.({ stage: 'write_params', message: 'writing password' })
    await writeChar(PASS_CHAR as any, params.password)
    onEvent?.({ stage: 'write_params', message: 'writing mqtt url' })
    await writeChar(MQTT_URL_CHAR as any, params.mqttUrl)
    onEvent?.({ stage: 'write_params', message: 'writing device id' })
    await writeChar(DEVICE_ID_CHAR as any, params.deviceId)
    // Optional user/pass UUIDs: derive by convention if firmware supports
    try {
      if (params.mqttUser) { await writeChar((''+MQTT_URL_CHAR).replace('1003','1007') as any, params.mqttUser) }
      if (params.mqttPass) { await writeChar((''+MQTT_URL_CHAR).replace('1003','1008') as any, params.mqttPass) }
    } catch {}

    // subscribe status
    statusChar = await service!.getCharacteristic(STATUS_CHAR as any)
    await statusChar.startNotifications()
    const result = await new Promise<ProvisionEvent>((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { statusChar?.stopNotifications() } catch {}
        resolve({ stage: 'await_status', ok: false, message: 'provision timeout' })
      }, 30000)
      const handler = (ev: Event) => {
        const evt = parseStatus(ev)
        if (!evt) return
        onEvent?.(evt)
        if (evt.ok === true) {
          clearTimeout(timeout)
          statusChar?.removeEventListener('characteristicvaluechanged', handler as any)
          try { statusChar?.stopNotifications() } catch {}
          resolve({ stage: 'done', ok: true, message: 'ok' })
        }
      }
      statusChar!.addEventListener('characteristicvaluechanged', handler as any)
      service!.getCharacteristic(CONTROL_CHAR as any)
        .then((ch: any) => ch.writeValue(te.encode('PROVISION')))
        .catch(reject)
    })
    return result
  }

  async function disconnect() {
    try { await statusChar?.stopNotifications() } catch {}
    try { server?.disconnect?.() } catch {}
    if (device && device.gatt?.connected) {
      try { device.gatt.disconnect() } catch {}
    }
    device = null
    server = null
    service = null
    statusChar = null
  }

  return { provision, disconnect }
}
