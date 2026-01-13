import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport'
import { HomeServiceClient, AutomationServiceClient, AuditServiceClient } from '../proto/home/service.client'
import type { Device, ListDevicesResponse, InvokeActionResponse, DeviceEvent, UpsertDeviceResponse, Automation, ListAutomationsResponse, LogEntry, ListLogsResponse } from '../proto/home/service'
import { TelemetryEventKind } from '../proto/home/service'
import type { Struct } from '../proto/google/protobuf/struct'
import type { ServerStreamingCall } from '@protobuf-ts/runtime-rpc'

export interface HomeConfig {
  baseUrl: string
  onEvent?: (ev: DeviceEvent, data?: Record<string, any>) => void
}

export interface DeviceListParams {
  ids?: string[]
  type?: string
  room?: string
  tags?: string[]
  includeState?: boolean
}

export function useHomeApi(config?: Partial<HomeConfig>) {
  const baseUrl = config?.baseUrl ?? ((import.meta as any).env?.VITE_HOME_GRPCWEB_URL as string ?? '/api')
  const transport = useMemo(() => new GrpcWebFetchTransport({ baseUrl }), [baseUrl])
  const clientRef = useRef(new HomeServiceClient(transport))
  const autoClientRef = useRef(new AutomationServiceClient(transport))
  const auditClientRef = useRef(new AuditServiceClient(transport))
  const onEventRef = useRef<HomeConfig['onEvent']>(config?.onEvent)

  useEffect(() => {
    clientRef.current = new HomeServiceClient(new GrpcWebFetchTransport({ baseUrl }))
    autoClientRef.current = new AutomationServiceClient(new GrpcWebFetchTransport({ baseUrl }))
    auditClientRef.current = new AuditServiceClient(new GrpcWebFetchTransport({ baseUrl }))
  }, [baseUrl])
  useEffect(() => { onEventRef.current = config?.onEvent }, [config?.onEvent])

  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const [events, setEvents] = useState<DeviceEvent[]>([])
  const streamRef = useRef<ServerStreamingCall<any, DeviceEvent> | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const watchActiveRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

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

  const listParamsRef = useRef<Required<DeviceListParams>>({ ids: [], type: '', room: '', tags: [], includeState: true })

  const listDevices = useCallback(async (opts?: DeviceListParams) => {
    const current = listParamsRef.current
    const next: Required<DeviceListParams> = {
      ids: opts?.ids ? [...opts.ids] : current.ids,
      type: opts?.type ?? current.type,
      room: opts?.room ?? current.room,
      tags: opts?.tags ? [...opts.tags] : current.tags,
      includeState: opts?.includeState ?? current.includeState,
    }
    if (opts) {
      listParamsRef.current = { ...next, ids: [...next.ids], tags: [...next.tags] }
    }

    setLoading(true)
    setError('')
    try {
      const res = await clientRef.current.listDevices({
        ids: next.ids,
        type: next.type,
        room: next.room,
        tags: next.tags,
        includeState: next.includeState,
      }).response
      const devs = ((res as ListDevicesResponse)?.devices ?? []) as Device[]
      setDevices(devs)
      return { ok: true, count: devs.length, devices: devs }
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

  function isAbortError(err: any): boolean {
    const name = (err && (err.name || err.constructor?.name)) || ''
    const msg = String((err && (err.message || err)) || '').toLowerCase()
    return name === 'AbortError' || msg.includes('abort') || msg.includes('signal is aborted')
  }

  const invokeAction = useCallback(async (deviceId: string, action: string, args?: Record<string, any>, timeoutMs?: number) => {
    try {
      const res = await clientRef.current.invokeAction({
        deviceId,
        action,
        args: { fields: Object.entries(args ?? {}).reduce<any>((acc, [k, v]) => { acc[k] = toValue(v); return acc }, {}) },
        timeoutMs: timeoutMs ?? 5000,
      }).response
      return {
        ok: (res as InvokeActionResponse).ok,
        response: res as InvokeActionResponse,
        message: (res as InvokeActionResponse).message,
        corrId: (res as InvokeActionResponse).corrId || '',
      }
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
      // prefer aborting via AbortController if provided
      abortRef.current?.abort()
      const c: any = streamRef.current as any
      const fn = c?.cancel
      if (typeof fn === 'function') { fn.call(c) }
      else if (typeof c?.close === 'function') { c.close() }
      else if (typeof c?.responses?.cancel === 'function') { c.responses.cancel() }
    } finally {
      abortRef.current = null
      streamRef.current = null
    }
  }, [])

  const startWatch = useCallback((ids?: string[]) => {
    stopWatch()
    watchActiveRef.current = true
    reconnectAttemptsRef.current = 0

    const connect = () => {
      if (!watchActiveRef.current) return
      try {
        abortRef.current = new AbortController()
        const call = clientRef.current.watchDevices({ ids: ids ?? [] }, { abort: abortRef.current.signal as any })
        streamRef.current = call
        // clear previous error on new connection attempt
        setError('')
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
            case TelemetryEventKind.ACTION_RESULT: {
              const data = structToObject(ev.payload)
              // Optional: if result carries a nested state, reflect it
              const nestedState = data && typeof data.state === 'object' ? data.state as Record<string, any> : null
              if (nestedState) {
                const fields: any = {}
                for (const [k, v] of Object.entries(nestedState)) fields[k] = toValue(v)
                const st: any = { fields }
                setDevices(prev => prev.map(d => d.id === id ? ({ ...d, state: st, lastSeen: Date.now() as any }) : d))
              } else {
                // at least bump lastSeen to reflect activity
                setDevices(prev => prev.map(d => d.id === id ? ({ ...d, lastSeen: Date.now() as any }) : d))
              }
              break
            }
            case TelemetryEventKind.EVENT: {
              // generic event; leave UI state intact, only record lastSeen
              setDevices(prev => prev.map(d => d.id === id ? ({ ...d, lastSeen: Date.now() as any }) : d))
              break
            }
          }
          // fire external handler if provided
          try { onEventRef.current?.(ev, structToObject(ev.payload)) } catch {}
        })
        call.responses.onError(err => {
          if (!watchActiveRef.current || isAbortError(err)) return
          const msg = String((err as any)?.message ?? err)
          setError(msg)
          const attempt = reconnectAttemptsRef.current++
          const delay = Math.min(30000, 1000 * Math.pow(2, attempt))
          if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = window.setTimeout(() => {
            connect()
          }, delay) as unknown as number
        })
      } catch (e: any) {
        if (!watchActiveRef.current || isAbortError(e)) return
        const msg = String(e?.message ?? e)
        setError(msg)
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
      const res = await clientRef.current.upsertDevice({ device }).response as UpsertDeviceResponse
      if (res.ok) {
        const idFromMsg = extractDeviceId(res.message)
        const targetId = (device.id && device.id.trim()) || idFromMsg
        if (targetId) {
          setDevices(prev => {
            let updated = false
            const next = prev.map(d => {
              if (d.id !== targetId) return d
              updated = true
              return {
                ...d,
                name: device.name?.trim() || d.name,
                type: device.type || d.type,
                room: device.room || d.room,
                tags: device.tags?.length ? [...device.tags] : d.tags,
              }
            })
            if (!updated) {
              return prev
            }
            return next
          })
        }
      }
      return { ok: res.ok, message: res.message, deviceId: (device.id && device.id.trim()) || extractDeviceId(res.message) }
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

  const listAutomations = useCallback(async (opts?: { includeDisabled?: boolean; tag?: string; name?: string; pageSize?: number; pageToken?: string }) => {
    try {
      const res = await autoClientRef.current.listAutomations({
        includeDisabled: Boolean(opts?.includeDisabled),
        tag: opts?.tag ?? '',
        nameContains: opts?.name ?? '',
        pageSize: opts?.pageSize ?? 20,
        pageToken: opts?.pageToken ?? '',
      }).response as ListAutomationsResponse
      return { ok: true, automations: res.automations as Automation[], nextPageToken: res.nextPageToken ?? '' }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  }, [])

  const setAutomationEnabled = useCallback(async (automationId: string, enabled: boolean) => {
    try {
      const res = await autoClientRef.current.setAutomationEnabled({ automationId, enabled }).response
      return { ok: (res as any).ok, message: (res as any).message }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  }, [])

  const triggerAutomation = useCallback(async (automationId: string, payload?: Record<string, any>) => {
    try {
      const res = await autoClientRef.current.triggerAutomation({
        automationId,
        payload: { fields: Object.entries(payload ?? {}).reduce<any>((acc, [k, v]) => { acc[k] = toValue(v); return acc }, {}) },
      }).response
      return { ok: (res as any).ok, message: (res as any).message }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  }, [])

  const upsertAutomation = useCallback(async (automation: Automation) => {
    try {
      const res = await autoClientRef.current.upsertAutomation({ automation }).response
      return { ok: (res as any).ok, message: (res as any).message, automationId: (res as any).automationId }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  }, [])

  const listAuditLogs = useCallback(async (opts: { kind?: string; subject?: string; pageSize?: number; pageToken?: string }) => {
    try {
      const res = await auditClientRef.current.listLogs({
        kind: opts.kind ?? '',
        subject: opts.subject ?? '',
        pageSize: opts.pageSize ?? 20,
        pageToken: opts.pageToken ?? '',
      }).response as ListLogsResponse
      return { ok: true, entries: (res.entries as LogEntry[]) || [], nextPageToken: res.nextPageToken ?? '' }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
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
    listAutomations,
    setAutomationEnabled,
    triggerAutomation,
    upsertAutomation,
    listAuditLogs,
  }
}

function extractDeviceId(message?: string): string {
  if (!message) return ''
  const match = message.match(/^(?:created|updated):(.+)$/)
  return match ? match[1].trim() : ''
}
