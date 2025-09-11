import { useCallback, useMemo, useRef, useState } from 'react'
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport'
import { DeviceRegistryServiceClient } from '../proto/cloud/device.client'
import type { DeviceInfo } from '../proto/cloud/device'
import { GatewayServiceClient } from '../proto/cloud/gateway.client'
import type { ExecuteCommandSetResponse } from '../proto/remote_control'

export interface CloudConfig {
  baseUrl: string
}

export function useCloudApi(config?: Partial<CloudConfig>) {
  const baseUrl = config?.baseUrl ?? (import.meta.env.VITE_CLOUD_GRPCWEB_URL as string) ?? 'http://localhost:7073'

  const transport = useMemo(() => new GrpcWebFetchTransport({ baseUrl }), [baseUrl])
  const deviceClientRef = useRef(new DeviceRegistryServiceClient(transport))
  const gatewayClientRef = useRef(new GatewayServiceClient(transport))

  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [executing, setExecuting] = useState(false)

  const refreshDevices = useCallback(async () => {
    setLoadingDevices(true)
    try {
      const res = await deviceClientRef.current.listDevices({}).response
      setDevices(res.devices)
      return { success: true, count: res.devices.length }
    } catch (err: any) {
      console.error('ListDevices error:', err)
      return { success: false, error: String(err?.message ?? err) }
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

  return {
    baseUrl,
    devices,
    loadingDevices,
    refreshDevices,
    executing,
    executeOnDevice,
  }
}
