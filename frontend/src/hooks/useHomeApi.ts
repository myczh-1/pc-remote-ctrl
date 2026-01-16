import { useCallback, useEffect, useMemo, useRef } from 'react'
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport'
import {
  AutomationServiceClient,
  AuditServiceClient,
  CloudConfigServiceClient,
  DeviceModelServiceClient,
  HomeServiceClient,
} from '../proto/home/service.client'
import type { CloudConfig, Device, DeviceEvent, DeviceModelSpec } from '../proto/home/service'
import { useApiCore } from './useApiCore'
import type { ApiAdapter } from './useApiCore'
import type { DeviceListParams } from './apiTypes'

export interface HomeConfig {
  baseUrl: string
  onEvent?: (ev: DeviceEvent, data?: Record<string, any>) => void
}

export { type DeviceListParams } from './apiTypes'

export function useHomeApi(config?: Partial<HomeConfig>) {
  const baseUrl = config?.baseUrl ?? ((import.meta as any).env?.VITE_HOME_GRPCWEB_URL as string ?? '/api')
  const transport = useMemo(() => new GrpcWebFetchTransport({ baseUrl }), [baseUrl])
  const clientRef = useRef(new HomeServiceClient(transport))
  const autoClientRef = useRef(new AutomationServiceClient(transport))
  const auditClientRef = useRef(new AuditServiceClient(transport))
  const modelClientRef = useRef(new DeviceModelServiceClient(transport))
  const cloudConfigClientRef = useRef(new CloudConfigServiceClient(transport))

  useEffect(() => {
    clientRef.current = new HomeServiceClient(new GrpcWebFetchTransport({ baseUrl }))
    autoClientRef.current = new AutomationServiceClient(new GrpcWebFetchTransport({ baseUrl }))
    auditClientRef.current = new AuditServiceClient(new GrpcWebFetchTransport({ baseUrl }))
    modelClientRef.current = new DeviceModelServiceClient(new GrpcWebFetchTransport({ baseUrl }))
    cloudConfigClientRef.current = new CloudConfigServiceClient(new GrpcWebFetchTransport({ baseUrl }))
  }, [baseUrl])

  const listDevices = useCallback((params: DeviceListParams) => {
    return clientRef.current.listDevices(params).response
  }, [])

  const watchDevices = useCallback((params: { ids: string[] }, options: { abort: AbortSignal }) => {
    return clientRef.current.watchDevices(params, options)
  }, [])

  const invokeAction = useCallback((params: { deviceId: string; action: string; args?: any; timeoutMs?: number }) => {
    return clientRef.current.invokeAction(params).response
  }, [])

  const upsertDevice = useCallback((params: { device: Device }) => {
    return clientRef.current.upsertDevice(params).response
  }, [])

  const deleteDevice = useCallback((params: { deviceId: string }) => {
    return clientRef.current.deleteDevice(params).response
  }, [])

  const listAutomations = useCallback((params: { includeDisabled: boolean; tag: string; nameContains: string; pageSize: number; pageToken: string }) => {
    return autoClientRef.current.listAutomations(params).response
  }, [])

  const setAutomationEnabled = useCallback((params: { automationId: string; enabled: boolean }) => {
    return autoClientRef.current.setAutomationEnabled(params).response
  }, [])

  const triggerAutomation = useCallback((params: { automationId: string; payload?: any }) => {
    return autoClientRef.current.triggerAutomation(params).response
  }, [])

  const upsertAutomation = useCallback((params: { automation: any }) => {
    return autoClientRef.current.upsertAutomation(params).response
  }, [])

  const listAuditLogs = useCallback((params: { kind: string; subject: string; pageSize: number; pageToken: string }) => {
    return auditClientRef.current.listLogs(params).response
  }, [])

  const listDeviceModels = useCallback((params: { id?: string; nameContains?: string }) => {
    return modelClientRef.current.listDeviceModels({
      id: params.id ?? '',
      nameContains: params.nameContains ?? '',
    }).response
  }, [])

  const getDeviceModel = useCallback((params: { id: string; version: string }) => {
    return modelClientRef.current.getDeviceModel(params).response
  }, [])

  const createDeviceModel = useCallback((params: { model: DeviceModelSpec }) => {
    return modelClientRef.current.createDeviceModel(params).response
  }, [])

  const updateDeviceModel = useCallback((params: { model: DeviceModelSpec }) => {
    return modelClientRef.current.updateDeviceModel(params).response
  }, [])

  const deleteDeviceModel = useCallback((params: { id: string; version: string }) => {
    return modelClientRef.current.deleteDeviceModel(params).response
  }, [])

  const listCloudConfigs = useCallback(() => {
    return cloudConfigClientRef.current.listCloudConfigs({}).response
  }, [])

  const upsertCloudConfig = useCallback((params: { config: CloudConfig }) => {
    return cloudConfigClientRef.current.upsertCloudConfig(params).response
  }, [])

  const deleteCloudConfig = useCallback((params: { configId: string }) => {
    return cloudConfigClientRef.current.deleteCloudConfig(params).response
  }, [])

  const applyCloudConfig = useCallback((params: { configId: string }) => {
    return cloudConfigClientRef.current.applyCloudConfig(params).response
  }, [])

  const adapter: ApiAdapter = useMemo(() => ({
    listDevices,
    watchDevices,
    invokeAction,
    upsertDevice,
    deleteDevice,
    listAutomations,
    setAutomationEnabled,
    triggerAutomation,
    upsertAutomation,
    listAuditLogs,
    listDeviceModels,
    getDeviceModel,
    createDeviceModel,
    updateDeviceModel,
    deleteDeviceModel,
    listCloudConfigs,
    upsertCloudConfig,
    deleteCloudConfig,
    applyCloudConfig,
  }), [
    listDevices,
    watchDevices,
    invokeAction,
    upsertDevice,
    deleteDevice,
    listAutomations,
    setAutomationEnabled,
    triggerAutomation,
    upsertAutomation,
    listAuditLogs,
    listDeviceModels,
    getDeviceModel,
    createDeviceModel,
    updateDeviceModel,
    deleteDeviceModel,
    listCloudConfigs,
    upsertCloudConfig,
    deleteCloudConfig,
    applyCloudConfig,
  ])

  const api = useApiCore(adapter, { onEvent: config?.onEvent })

  return {
    baseUrl,
    ...api,
    listCloudConfigs,
    upsertCloudConfig,
    deleteCloudConfig,
    applyCloudConfig,
  }
}
