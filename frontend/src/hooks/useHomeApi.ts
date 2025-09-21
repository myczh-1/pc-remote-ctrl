import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport'
import { HomeServiceClient } from '../proto/home/service.client'
import type { Device, ListDevicesResponse, InvokeActionResponse, DeviceEvent, UpsertDeviceResponse } from '../proto/home/service'
import { TelemetryEventKind } from '../proto/home/service'
import type { Struct } from '../proto/google/protobuf/struct'
import type { ServerStreamingCall } from '@protobuf-ts/runtime-rpc'

export interface HomeConfig {
  baseUrl: string
}

export function useHomeApi(config?: Partial<HomeConfig>) {
  const baseUrl = config?.baseUrl ?? ((import.meta as any).env?.VITE_HOME_GRPCWEB_URL as string ?? '/api')
  const transport = useMemo(() => new GrpcWebFetchTransport({ baseUrl }), [baseUrl])
  const clientRef = useRef(new HomeServiceClient(transport))

  useEffect(() => {
    clientRef.current = new HomeServiceClient(new GrpcWebFetchTransport({ baseUrl }))
  }, [baseUrl])

  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const [events, setEvents] = useState<DeviceEvent[]>([])
  const streamRef = useRef<ServerStreamingCall<any, DeviceEvent> | null>(null)

  function structToObject(st?: Struct): Record<string, any> {
    if (!st) return {}
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(st.fields ?? {})) {
      const kind: any = (v as any).kind
      switch (kind?.oneofKind) {
        case 'stringValue': out[k] = kind.stringValue; break
        case 'numberValue': out[k] = kind.numberValue; break
        case 'boolValue': out[k] = kind.boolValue; break
        case 'listValue': out[k] = (kind.listValue?.values ?? []).map((iv:any)=> (iv.kind?.stringValue ?? iv.kind?.numberValue ?? iv.kind?.boolValue ?? null)); break
        case 'structValue': out[k] = structToObject(kind.structValue as any); break
        default: out[k] = null
      }
    }
    return out
  }

  const listDevices = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await clientRef.current.listDevices({ ids: [], type: '', room: '', tags: [], includeState: true }).response
      setDevices((res as ListDevicesResponse).devices)
      return { ok: true, count: (res as ListDevicesResponse).devices.length, devices: (res as ListDevicesResponse).devices as Device[] }
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      setError(msg)
      setDevices([])
      return { ok: false, error: msg }
    } finally {
      setLoading(false)
    }
  }, [])

  const invokeAction = useCallback(async (deviceId: string, action: string, args?: Record<string, any>, timeoutMs?: number) => {
    try {
      const res = await clientRef.current.invokeAction({
        deviceId,
        action,
        args: { fields: Object.entries(args ?? {}).reduce<any>((acc, [k, v]) => { acc[k] = { kind: { oneofKind: 'stringValue', stringValue: String(v) } }; return acc }, {}) },
        timeoutMs: timeoutMs ?? 5000,
      }).response
      return { ok: (res as InvokeActionResponse).ok, response: res as InvokeActionResponse, message: (res as InvokeActionResponse).message }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  }, [])

  const startWatch = useCallback((ids?: string[]) => {
    stopWatch()
    try {
      const call = clientRef.current.watchDevices({ ids: ids ?? [] })
      streamRef.current = call
      call.responses.onMessage(ev => {
        setEvents(prev => [...prev.slice(-200), ev])
        // opportunistic UI update: reflect state/online to devices list
        const id = ev.deviceId
        switch (ev.kind) {
          case TelemetryEventKind.STATE: {
            const patch = structToObject(ev.payload)
            setDevices(prev => prev.map(d => d.id === id ? ({ ...d, state: ev.payload as any, lastSeen: Date.now() as any }) : d))
            break
          }
          case TelemetryEventKind.ONLINE: {
            const pay = structToObject(ev.payload)
            const online = Boolean(pay.online ?? pay.status ?? true)
            setDevices(prev => prev.map(d => d.id === id ? ({ ...d, online, lastSeen: Date.now() as any }) : d))
            break
          }
        }
      })
      call.responses.onError(err => {
        const msg = String((err as any)?.message ?? err)
        setError(msg)
      })
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  }, [])

  const upsertDevice = useCallback(async (device: Device) => {
    try {
      const res = await clientRef.current.upsertDevice({ device }).response
      return { ok: (res as UpsertDeviceResponse).ok, message: (res as UpsertDeviceResponse).message }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  }, [])

  const deleteDevice = useCallback(async (deviceId: string) => {
    try {
      const res = await clientRef.current.deleteDevice({ deviceId }).response
      return { ok: (res as any).ok, message: (res as any).message }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  }, [])

  const stopWatch = useCallback(() => {
    streamRef.current = null
  }, [])

  useEffect(() => () => stopWatch(), [stopWatch])

  return {
    baseUrl,
    devices,
    loading,
    error,
    listDevices,
    invokeAction,
    events,
    startWatch,
    stopWatch,
    upsertDevice,
    deleteDevice,
  }
}
