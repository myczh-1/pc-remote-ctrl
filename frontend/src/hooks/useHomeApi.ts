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
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const watchActiveRef = useRef(false)

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

  function toValue(v: any): any {
    const kind: any = { oneofKind: undefined }
    if (v === null || v === undefined) {
      // protobuf-ts supports nullValue, but we can just use string 'null' for simplicity
      kind.oneofKind = 'stringValue'; kind.stringValue = 'null'
      return { kind }
    }
    const t = typeof v
    if (t === 'number' && Number.isFinite(v)) { kind.oneofKind = 'numberValue'; kind.numberValue = v; return { kind } }
    if (t === 'boolean') { kind.oneofKind = 'boolValue'; kind.boolValue = v; return { kind } }
    if (Array.isArray(v)) { kind.oneofKind = 'listValue'; kind.listValue = { values: v.map(toValue) }; return { kind } }
    if (t === 'object') {
      kind.oneofKind = 'structValue'
      const fields: any = {}
      for (const [kk, vv] of Object.entries(v)) fields[kk] = toValue(vv)
      kind.structValue = { fields }
      return { kind }
    }
    kind.oneofKind = 'stringValue'; kind.stringValue = String(v)
    return { kind }
  }

  const invokeAction = useCallback(async (deviceId: string, action: string, args?: Record<string, any>, timeoutMs?: number) => {
    try {
      const res = await clientRef.current.invokeAction({
        deviceId,
        action,
        args: { fields: Object.entries(args ?? {}).reduce<any>((acc, [k, v]) => { acc[k] = toValue(v); return acc }, {}) },
        timeoutMs: timeoutMs ?? 5000,
      }).response
      return { ok: (res as InvokeActionResponse).ok, response: res as InvokeActionResponse, message: (res as InvokeActionResponse).message }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  }, [])

  const startWatch = useCallback((ids?: string[]) => {
    stopWatch()
    watchActiveRef.current = true
    reconnectAttemptsRef.current = 0

    const connect = () => {
      if (!watchActiveRef.current) return
      try {
        const call = clientRef.current.watchDevices({ ids: ids ?? [] })
        streamRef.current = call
        call.responses.onMessage(ev => {
          setEvents(prev => [...prev.slice(-200), ev])
          const id = ev.deviceId
          switch (ev.kind) {
            case TelemetryEventKind.STATE: {
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
          if (!watchActiveRef.current) return
          const attempt = reconnectAttemptsRef.current++
          const delay = Math.min(30000, 1000 * Math.pow(2, attempt))
          if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = window.setTimeout(() => {
            connect()
          }, delay) as unknown as number
        })
      } catch (e: any) {
        const msg = String(e?.message ?? e)
        setError(msg)
        if (!watchActiveRef.current) return
        const attempt = reconnectAttemptsRef.current++
        const delay = Math.min(30000, 1000 * Math.pow(2, attempt))
        if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = window.setTimeout(() => connect(), delay) as unknown as number
      }
    }

    connect()
    return { ok: true }
  }, [stopWatch])

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
    watchActiveRef.current = false
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    try {
      streamRef.current?.cancel()
    } finally {
      streamRef.current = null
    }
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
