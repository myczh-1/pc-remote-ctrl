import { useState, useCallback, useRef, useEffect } from 'react'
import { ControllerServiceClient } from '../proto/remote_control.client'
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport'
import type { CommandSet, CommandSetExecution, StepExecutionResult } from '../types'
import type { ExecuteCommandSetRequest } from '../proto/remote_control'

const transport = new GrpcWebFetchTransport({ baseUrl: '/api' })
const client = new ControllerServiceClient(transport)

export function useCommandSetExecution() {
  const [execution, setExecution] = useState<CommandSetExecution | null>(null)
  const abortRef = useRef<boolean>(false)

  const executeCommandSet = useCallback(async (commandSet: CommandSet) => {
    if (execution?.status === 'running') return

    abortRef.current = false
    const commandSetExecution: CommandSetExecution = {
      commandSetId: commandSet.commandId,
      commandSetName: commandSet.commandName,
      currentStep: 0,
      status: 'running',
      stepResults: [],
      startTime: new Date()
    }
    
    setExecution(commandSetExecution)

    try {
      // 使用新的 gRPC 接口直接执行命令集
      const req: ExecuteCommandSetRequest = {
        commandSetId: commandSet.commandId
      }
      
      const { response } = await client.executeCommandSet(req)
      
      // 转换后端返回的结果格式
      const stepResults: StepExecutionResult[] = (response.stepResults ?? []).map(step => ({
        stepIndex: step.stepIndex,
        stepScript: step.stepScript,
        output: step.output,
        error: step.error,
        exitCode: step.exitCode,
        success: step.success
      }))
      
      setExecution(prev => prev ? {
        ...prev,
        stepResults,
        currentStep: stepResults.length,
        status: response.success ? 'completed' : 'failed',
        endTime: new Date(),
        error: response.success ? undefined : response.error
      } : null)

      return {
        success: response.success,
        stepResults,
        error: response.error
      }

    } catch (error: any) {
      setExecution(prev => prev ? {
        ...prev,
        status: 'failed',
        endTime: new Date(),
        error: `命令集执行异常: ${error.message}`
      } : null)

      return {
        success: false,
        stepResults: [],
        error: error.message || String(error)
      }
    }
  }, [execution])

  const stopExecution = useCallback(() => {
    if (execution?.status === 'running') {
      // 注意：当前的 gRPC 接口不支持中途停止，这里只能标记状态
      // 未来可以扩展 proto 支持取消操作
      setExecution(prev => prev ? {
        ...prev,
        status: 'stopped',
        endTime: new Date()
      } : null)
    }
  }, [execution])

  const clearExecution = useCallback(() => {
    setExecution(null)
    abortRef.current = false
  }, [])

  // 自动清理：执行完成后5秒自动清除状态
  useEffect(() => {
    if (execution && execution.status !== 'running') {
      const timer = setTimeout(() => {
        setExecution(null)
      }, 5000) // 5秒后自动清除
      
      return () => clearTimeout(timer)
    }
  }, [execution?.status])

  return {
    execution,
    executeCommandSet,
    stopExecution,
    clearExecution,
    isRunning: execution?.status === 'running'
  }
}