import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport'
import { DeviceRegistryServiceClient } from '../proto/cloud/device.client'
import type { DeviceInfo } from '../proto/cloud/device'
import { GatewayServiceClient } from '../proto/cloud/gateway.client'
import type { ExecuteCommandSetResponse } from '../proto/remote_control'

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
        if (parsed.baseUrl) return parsed.baseUrl
      }
    } catch (error) {
      console.warn('Failed to parse stored cloud config:', error)
    }
    
    return (import.meta.env.VITE_CLOUD_GRPCWEB_URL as string) ?? 'http://localhost:7073'
  }, [config?.baseUrl])

  const [baseUrl, setBaseUrl] = useState(getBaseUrl)

  const transport = useMemo(() => new GrpcWebFetchTransport({ baseUrl }), [baseUrl])
  const deviceClientRef = useRef(new DeviceRegistryServiceClient(transport))
  const gatewayClientRef = useRef(new GatewayServiceClient(transport))

  // 当配置变化时更新clients
  useEffect(() => {
    const newTransport = new GrpcWebFetchTransport({ baseUrl })
    deviceClientRef.current = new DeviceRegistryServiceClient(newTransport)
    gatewayClientRef.current = new GatewayServiceClient(newTransport)
  }, [baseUrl])

  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle')
  const [lastError, setLastError] = useState<string>('')
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null)

  const refreshDevices = useCallback(async () => {
    setLoadingDevices(true)
    setConnectionStatus('connecting')
    setLastError('')
    
    try {
      const res = await deviceClientRef.current.listDevices({}).response
      setDevices(res.devices)
      setConnectionStatus('connected')
      setLastRefreshTime(new Date())
      return { success: true, count: res.devices.length }
    } catch (err: any) {
      console.error('ListDevices error:', err)
      setConnectionStatus('failed')
      const errorMessage = String(err?.message ?? err)
      setLastError(errorMessage)
      // 连接失败时清空设备列表
      setDevices([])
      return { success: false, error: errorMessage }
    } finally {
      setLoadingDevices(false)
    }
  }, [])

  const executeOnDevice = useCallback(async (deviceId: string, commandSetId: string) => {
    setExecuting(true)
    try {
      const res = await gatewayClientRef.current.executeOnDevice({ deviceId, request: { commandSetId } }).response
      return { success: true, response: res as ExecuteCommandSetResponse }
    } catch (err: any) {
      console.error('ExecuteOnDevice error:', err)
      return { success: false, error: String(err?.message ?? err) }
    } finally {
      setExecuting(false)
    }
  }, [])

  const updateConfig = useCallback((newConfig: Partial<CloudConfig>) => {
    if (newConfig.baseUrl) {
      setBaseUrl(newConfig.baseUrl)
    }
  }, [])

  return {
    baseUrl,
    devices,
    loadingDevices,
    refreshDevices,
    executing,
    executeOnDevice,
    updateConfig,
    connectionStatus,
    lastError,
    lastRefreshTime,
  }
}
