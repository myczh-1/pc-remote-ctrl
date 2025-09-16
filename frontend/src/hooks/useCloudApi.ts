import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport'
import { GatewayServiceClient } from '../proto/cloud/gateway.client'
import type {
  Device,
  DeviceEvent,
  UpsertDeviceResponse,
  DeleteDeviceResponse,
  InvokeActionResponse
} from '../proto/home/service'

export interface CloudConfig {
  baseUrl: string
}

export function useCloudApi(config?: Partial<CloudConfig>) {
  // 优先级：传入的config > localStorage > 环境变量 > 默认值
  const getBaseUrl = useCallback(() => {
    if (config?.baseUrl) return config.baseUrl

    try {
      const stored = localStorage.getItem('cloud-config')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed?.baseUrl) return parsed.baseUrl
      }
    } catch (e) {
      console.warn('Failed to parse stored cloud config:', e)
    }

    // 环境变量
    if (import.meta.env.VITE_CLOUD_BASE_URL) {
      return import.meta.env.VITE_CLOUD_BASE_URL
    }

    // 默认值
    return 'https://your-cloud-gateway.com'
  }, [config?.baseUrl])

  const [transport, setTransport] = useState<GrpcWebFetchTransport | null>(null)
  const [client, setClient] = useState<GatewayServiceClient | null>(null)

  // 初始化传输和客户端
  const initClient = useCallback(() => {
    const baseUrl = getBaseUrl()
    const newTransport = new GrpcWebFetchTransport({
      baseUrl,
      // 可以在这里添加认证头等配置
    })

    const newClient = new GatewayServiceClient(newTransport)

    setTransport(newTransport)
    setClient(newClient)

    return newClient
  }, [getBaseUrl])

  // 确保客户端已初始化
  const ensureClient = useCallback(() => {
    if (!client) {
      return initClient()
    }
    return client
  }, [client, initClient])

  // 列出设备
  const listDevices = useCallback(async (deviceId: string, request: {
    ids?: string[]
    type?: string
    room?: string
    tags?: string[]
    includeState?: boolean
  }) => {
    const c = ensureClient()
    const response = await c.listDevices({
      deviceId,
      request: {
        ids: request.ids || [],
        type: request.type || '',
        room: request.room || '',
        tags: request.tags || [],
        includeState: request.includeState || false
      }
    }).response
    return response.devices || []
  }, [ensureClient])

  // 监听设备事件
  const watchDevices = useCallback((deviceId: string, request: {
    ids?: string[]
  }) => {
    const c = ensureClient()
    return c.watchDevices({
      deviceId,
      request: {
        ids: request.ids || []
      }
    })
  }, [ensureClient])

  // 注册/更新设备
  const upsertDevice = useCallback(async (deviceId: string, device: Device): Promise<UpsertDeviceResponse> => {
    const c = ensureClient()
    const response = await c.upsertDevice({
      deviceId,
      request: { device }
    }).response
    return response
  }, [ensureClient])

  // 删除设备
  const deleteDevice = useCallback(async (deviceId: string, targetDeviceId: string): Promise<DeleteDeviceResponse> => {
    const c = ensureClient()
    const response = await c.deleteDevice({
      deviceId,
      request: { deviceId: targetDeviceId }
    }).response
    return response
  }, [ensureClient])

  // 调用设备动作
  const invokeAction = useCallback(async (deviceId: string, targetDeviceId: string, action: string, args?: any, timeoutMs?: number): Promise<InvokeActionResponse> => {
    const c = ensureClient()
    const response = await c.invokeAction({
      deviceId,
      request: {
        deviceId: targetDeviceId,
        action,
        args: args ? { fields: args } : undefined,
        timeoutMs: timeoutMs || 30000
      }
    }).response
    return response
  }, [ensureClient])

  // 更新配置
  const updateConfig = useCallback((newConfig: Partial<CloudConfig>) => {
    try {
      const currentConfig = { baseUrl: getBaseUrl() }
      const updatedConfig = { ...currentConfig, ...newConfig }
      localStorage.setItem('cloud-config', JSON.stringify(updatedConfig))

      // 重新初始化客户端
      setTimeout(() => {
        initClient()
      }, 0)
    } catch (e) {
      console.error('Failed to update cloud config:', e)
    }
  }, [getBaseUrl, initClient])

  // 获取当前配置
  const getCurrentConfig = useCallback((): CloudConfig => {
    return {
      baseUrl: getBaseUrl()
    }
  }, [getBaseUrl])

  // 初始化时创建客户端
  useEffect(() => {
    initClient()
  }, [initClient])

  return {
    // 配置相关
    updateConfig,
    getCurrentConfig,

    // API 方法
    listDevices,
    watchDevices,
    upsertDevice,
    deleteDevice,
    invokeAction,

    // 客户端实例（如果需要直接访问）
    client,
    transport
  }
}