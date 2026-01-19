import { useCallback, useEffect, useMemo, useRef } from 'react'
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport'
import { GatewayServiceClient } from '../proto/cloud/gateway.client'
import {
  CleanupLogsRequest,
  CreateDeviceModelRequest,
  DeleteAutomationRequest,
  DeleteDeviceModelRequest,
  DeleteDeviceRequest,
  DeviceEvent,
  GetDeviceModelRequest,
  InvokeActionRequest,
  ListAutomationsRequest,
  ListDevicesRequest,
  ListLogsRequest,
  ReserveDeviceRequest,
  WatchDevicesRequest,
  SetAutomationEnabledRequest,
  TriggerAutomationRequest,
  UpdateDeviceModelRequest,
  UpsertAutomationRequest,
  UpsertDeviceRequest,
} from '../proto/home/service'
import {
  CleanupLogsResponse,
  CreateDeviceModelResponse,
  DeleteAutomationResponse,
  DeleteDeviceModelResponse,
  DeleteDeviceResponse,
  GetDeviceModelResponse,
  InvokeActionResponse,
  ListAutomationsResponse,
  ListDevicesResponse,
  ListLogsResponse,
  ReserveDeviceResponse,
  SetAutomationEnabledResponse,
  TriggerAutomationResponse,
  UpdateDeviceModelResponse,
  UpsertAutomationResponse,
  UpsertDeviceResponse,
} from '../proto/home/service'
import { useApiCore } from './useApiCore'
import type { ApiAdapter } from './useApiCore'
import type { DeviceListParams } from './apiTypes'

export interface CloudConfig {
  baseUrl: string
  agentId: string
  onEvent?: (ev: DeviceEvent, data?: Record<string, any>) => void
}

const homeSvc = '/remote_control.home.HomeService/'
const autoSvc = '/remote_control.home.AutomationService/'
const auditSvc = '/remote_control.home.AuditService/'
const modelSvc = '/remote_control.home.DeviceModelService/'

export function useCloudApi(config?: Partial<CloudConfig>) {
  const baseUrl = config?.baseUrl ?? (typeof localStorage !== 'undefined' ? (localStorage.getItem('cloud.baseUrl') || '/cloud') : '/cloud')
  const agentId = config?.agentId ?? (typeof localStorage !== 'undefined' ? (localStorage.getItem('cloud.agentId') || '') : '')
  const transport = useMemo(() => new GrpcWebFetchTransport({ baseUrl }), [baseUrl])
  const clientRef = useRef(new GatewayServiceClient(transport))

  useEffect(() => {
    const nextTransport = new GrpcWebFetchTransport({ baseUrl })
    clientRef.current = new GatewayServiceClient(nextTransport)
  }, [baseUrl])

  const unary = useCallback(async (method: string, payload: Uint8Array) => {
    const res = await clientRef.current.unary({
      deviceId: agentId,
      method,
      payload,
    }).response
    return res.payload
  }, [agentId])

  const stream = useCallback((method: string, payload: Uint8Array, options: { abort: AbortSignal }) => {
    return clientRef.current.stream({ deviceId: agentId, method, payload }, options)
  }, [agentId])

  const listDevices = useCallback(async (params: DeviceListParams) => {
    const req = ListDevicesRequest.create({
      ids: params.ids ?? [],
      type: params.type ?? '',
      room: params.room ?? '',
      tags: params.tags ?? [],
      includeState: params.includeState ?? true,
      includePending: params.includePending ?? false,
    })
    const bytes = ListDevicesRequest.toBinary(req)
    const resBytes = await unary(homeSvc + 'ListDevices', bytes)
    return ListDevicesResponse.fromBinary(resBytes)
  }, [unary])

  const watchDevices = useCallback((params: { ids: string[] }, options: { abort: AbortSignal }) => {
    const req = WatchDevicesRequest.create({ ids: params.ids ?? [] })
    const bytes = WatchDevicesRequest.toBinary(req)
    const call = stream(homeSvc + 'WatchDevices', bytes, options)
    const responses = {
      onMessage: (handler: (ev: DeviceEvent) => void) => {
        call.responses.onMessage(msg => {
          const ev = DeviceEvent.fromBinary(msg.payload)
          handler(ev)
        })
      },
      onError: (handler: (err: any) => void) => call.responses.onError(handler),
      cancel: () => call.responses.cancel?.(),
    }
    return { ...call, responses } as any
  }, [stream])

  const invokeAction = useCallback(async (params: { deviceId: string; action: string; args?: any; timeoutMs?: number }) => {
    const req = InvokeActionRequest.create({
      deviceId: params.deviceId,
      action: params.action,
      args: params.args,
      timeoutMs: params.timeoutMs ?? 5000,
    })
    const bytes = InvokeActionRequest.toBinary(req)
    const resBytes = await unary(homeSvc + 'InvokeAction', bytes)
    return InvokeActionResponse.fromBinary(resBytes)
  }, [unary])

  const upsertDevice = useCallback(async (params: { device: any }) => {
    const req = UpsertDeviceRequest.create({ device: params.device })
    const bytes = UpsertDeviceRequest.toBinary(req)
    const resBytes = await unary(homeSvc + 'UpsertDevice', bytes)
    return UpsertDeviceResponse.fromBinary(resBytes)
  }, [unary])

  const reserveDevice = useCallback(async (params: { modelId: string; modelVersion: string }) => {
    const req = ReserveDeviceRequest.create({ modelId: params.modelId, modelVersion: params.modelVersion })
    const bytes = ReserveDeviceRequest.toBinary(req)
    const resBytes = await unary(homeSvc + 'ReserveDevice', bytes)
    return ReserveDeviceResponse.fromBinary(resBytes)
  }, [unary])

  const deleteDevice = useCallback(async (params: { deviceId: string }) => {
    const req = DeleteDeviceRequest.create({ deviceId: params.deviceId })
    const bytes = DeleteDeviceRequest.toBinary(req)
    const resBytes = await unary(homeSvc + 'DeleteDevice', bytes)
    return DeleteDeviceResponse.fromBinary(resBytes)
  }, [unary])

  const listAutomations = useCallback(async (params: { includeDisabled: boolean; tag: string; nameContains: string; pageSize: number; pageToken: string }) => {
    const req = ListAutomationsRequest.create({
      includeDisabled: params.includeDisabled,
      tag: params.tag,
      nameContains: params.nameContains,
      pageSize: params.pageSize,
      pageToken: params.pageToken,
    })
    const bytes = ListAutomationsRequest.toBinary(req)
    const resBytes = await unary(autoSvc + 'ListAutomations', bytes)
    return ListAutomationsResponse.fromBinary(resBytes)
  }, [unary])

  const setAutomationEnabled = useCallback(async (params: { automationId: string; enabled: boolean }) => {
    const req = SetAutomationEnabledRequest.create({ automationId: params.automationId, enabled: params.enabled })
    const bytes = SetAutomationEnabledRequest.toBinary(req)
    const resBytes = await unary(autoSvc + 'SetAutomationEnabled', bytes)
    return SetAutomationEnabledResponse.fromBinary(resBytes)
  }, [unary])

  const triggerAutomation = useCallback(async (params: { automationId: string; payload?: any }) => {
    const req = TriggerAutomationRequest.create({ automationId: params.automationId, payload: params.payload })
    const bytes = TriggerAutomationRequest.toBinary(req)
    const resBytes = await unary(autoSvc + 'TriggerAutomation', bytes)
    return TriggerAutomationResponse.fromBinary(resBytes)
  }, [unary])

  const upsertAutomation = useCallback(async (params: { automation: any }) => {
    const req = UpsertAutomationRequest.create({ automation: params.automation })
    const bytes = UpsertAutomationRequest.toBinary(req)
    const resBytes = await unary(autoSvc + 'UpsertAutomation', bytes)
    return UpsertAutomationResponse.fromBinary(resBytes)
  }, [unary])

  const deleteAutomation = useCallback(async (params: { automationId: string }) => {
    const req = DeleteAutomationRequest.create({ automationId: params.automationId })
    const bytes = DeleteAutomationRequest.toBinary(req)
    const resBytes = await unary(autoSvc + 'DeleteAutomation', bytes)
    return DeleteAutomationResponse.fromBinary(resBytes)
  }, [unary])

  const listAuditLogs = useCallback(async (params: { kind: string; subject: string; pageSize: number; pageToken: string }) => {
    const req = ListLogsRequest.create({
      kind: params.kind,
      subject: params.subject,
      pageSize: params.pageSize,
      pageToken: params.pageToken,
    })
    const bytes = ListLogsRequest.toBinary(req)
    const resBytes = await unary(auditSvc + 'ListLogs', bytes)
    return ListLogsResponse.fromBinary(resBytes)
  }, [unary])

  const cleanupAuditLogs = useCallback(async (params: { kind: string; subject: string; olderThan?: string }) => {
    const req = CleanupLogsRequest.create({
      kind: params.kind,
      subject: params.subject,
      olderThan: params.olderThan ?? '',
    })
    const bytes = CleanupLogsRequest.toBinary(req)
    const resBytes = await unary(auditSvc + 'CleanupLogs', bytes)
    return CleanupLogsResponse.fromBinary(resBytes)
  }, [unary])

  const listDeviceModels = useCallback(async (_params: { id?: string; nameContains?: string }) => {
    return { ok: false, error: 'unsupported in cloud mode' }
  }, [])

  const getDeviceModel = useCallback(async (params: { id: string; version: string }) => {
    const req = GetDeviceModelRequest.create({ id: params.id, version: params.version })
    const bytes = GetDeviceModelRequest.toBinary(req)
    const resBytes = await unary(modelSvc + 'GetDeviceModel', bytes)
    return GetDeviceModelResponse.fromBinary(resBytes)
  }, [unary])

  const createDeviceModel = useCallback(async (params: { model: any }) => {
    const req = CreateDeviceModelRequest.create({ model: params.model })
    const bytes = CreateDeviceModelRequest.toBinary(req)
    const resBytes = await unary(modelSvc + 'CreateDeviceModel', bytes)
    return CreateDeviceModelResponse.fromBinary(resBytes)
  }, [unary])

  const updateDeviceModel = useCallback(async (params: { model: any }) => {
    const req = UpdateDeviceModelRequest.create({ model: params.model })
    const bytes = UpdateDeviceModelRequest.toBinary(req)
    const resBytes = await unary(modelSvc + 'UpdateDeviceModel', bytes)
    return UpdateDeviceModelResponse.fromBinary(resBytes)
  }, [unary])

  const deleteDeviceModel = useCallback(async (params: { id: string; version: string }) => {
    const req = DeleteDeviceModelRequest.create({ id: params.id, version: params.version })
    const bytes = DeleteDeviceModelRequest.toBinary(req)
    const resBytes = await unary(modelSvc + 'DeleteDeviceModel', bytes)
    return DeleteDeviceModelResponse.fromBinary(resBytes)
  }, [unary])

  const adapter: ApiAdapter = useMemo(() => ({
    listDevices,
    watchDevices,
    invokeAction,
    upsertDevice,
    reserveDevice,
    deleteDevice,
    listAutomations,
    setAutomationEnabled,
    triggerAutomation,
    upsertAutomation,
    listAuditLogs,
  }), [
    listDevices,
    watchDevices,
    invokeAction,
    upsertDevice,
    reserveDevice,
    deleteDevice,
    listAutomations,
    setAutomationEnabled,
    triggerAutomation,
    upsertAutomation,
    listAuditLogs,
  ])

  const api = useApiCore(adapter, { onEvent: config?.onEvent })

  return {
    baseUrl,
    agentId,
    ...api,
    deleteAutomation,
    cleanupAuditLogs,
    listDeviceModels,
    getDeviceModel,
    createDeviceModel,
    updateDeviceModel,
    deleteDeviceModel,
  }
}
