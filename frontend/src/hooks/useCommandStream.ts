// src/hooks/useCommandStream.ts
import { useRef, useState } from 'react'
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport'
import { ControllerServiceClient } from '../proto/remote_control.client'
import type { ExecuteCommandRequest, LogLine } from '../proto/remote_control'

const transport = new GrpcWebFetchTransport({ baseUrl: '/api' })
const client = new ControllerServiceClient(transport)

export function useCommandStream() {
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  /**
   * 开始流式订阅日志
   * @param commandId 要执行的命令 ID
   * @param onLine 每收到一行日志的回调
   * @param onEnd 流结束（或被停止）时回调
   * @param onError 出错时回调（Abort 不算错）
   */
  const start = async (
    commandId: string,
    onLine: (line: LogLine) => void,
    onEnd?: () => void,
    onError?: (err: unknown) => void,
  ) => {
    if (running) return
    setRunning(true)
    const ac = new AbortController()
    abortRef.current = ac

    const req: ExecuteCommandRequest = { commandId }
    const call = client.executeCommandStream(req, { abort: ac.signal })

    try {
      for await (const msg of call.responses) {
        onLine?.(msg)
      }
      onEnd?.()
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        onError?.(e)
      }
    } finally {
      setRunning(false)
    }
  }

  /** 停止订阅（取消） */
  const stop = () => {
    abortRef.current?.abort()
    abortRef.current = null
  }

  return { running, start, stop }
}
