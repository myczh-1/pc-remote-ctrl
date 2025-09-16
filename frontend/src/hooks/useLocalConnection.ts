import { useState, useEffect, useCallback, useRef } from 'react'
import { HomeServiceClient } from '../proto/home/service.client'
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport'

export type LocalConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed'

export function useLocalConnection() {
  const [connectionStatus, setConnectionStatus] = useState<LocalConnectionStatus>('idle')
  const [lastError, setLastError] = useState<string>('')
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null)
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const transportRef = useRef<GrpcWebFetchTransport | null>(null)
  const clientRef = useRef<HomeServiceClient | null>(null)

  // 初始化客户端
  const initClient = useCallback(() => {
    if (!transportRef.current) {
      transportRef.current = new GrpcWebFetchTransport({ baseUrl: '/api' })
      clientRef.current = new HomeServiceClient(transportRef.current)
    }
  }, [])

  // 检查连接状态
  const checkConnection = useCallback(async () => {
    if (!clientRef.current) {
      initClient()
    }

    setConnectionStatus('connecting')
    setLastError('')

    try {
      // 使用ListDevices测试连接
      const req = { ids: [], type: '', room: '', tags: [], includeState: false }
      await clientRef.current!.listDevices(req).response

      setConnectionStatus('connected')
      setLastCheckTime(new Date())
    } catch (error: any) {
      console.error('Local connection check failed:', error)
      setConnectionStatus('failed')
      setLastError(String(error?.message || error || '连接失败'))
      setLastCheckTime(new Date())
    }
  }, [initClient])

  // 开始监控连接状态
  const startMonitoring = useCallback(() => {
    // 立即检查一次
    checkConnection()

    // 设置定时检查
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current)
    }

    checkIntervalRef.current = setInterval(() => {
      checkConnection()
    }, 10000) // 每10秒检查一次
  }, [checkConnection])

  // 停止监控
  const stopMonitoring = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current)
      checkIntervalRef.current = null
    }
    setConnectionStatus('idle')
    setLastError('')
    setLastCheckTime(null)
  }, [])

  // 手动刷新连接状态
  const refreshConnection = useCallback(() => {
    checkConnection()
  }, [checkConnection])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
      }
    }
  }, [])

  return {
    connectionStatus,
    lastError,
    lastCheckTime,
    startMonitoring,
    stopMonitoring,
    refreshConnection
  }
}