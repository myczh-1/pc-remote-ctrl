import { useState, useCallback } from 'react'
import { ControllerServiceClient } from '../proto/controller.client'
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport'
import type { Command, ExecutionResult } from '../types'
import type {
  StoreCommandRequest,
  GetAllCommandsRequest,
  ExecuteCommandRequest,
} from '../proto/controller'

const transport = new GrpcWebFetchTransport({ baseUrl: '/api' })
const client = new ControllerServiceClient(transport)

export function useCommands() {
  const [commands, setCommands] = useState<Command[]>([])
  const [loading, setLoading] = useState(false)

  const storeCommand = useCallback(async (req: StoreCommandRequest): Promise<{ success: boolean; message: string }> => {
    setLoading(true)
    try {
      const { response } = await client.storeCommand(req)
      return { success: response.success, message: response.message }
    } catch (error: any) {
      return { success: false, message: error?.message || String(error) }
    } finally {
      setLoading(false)
    }
  }, [])

  const getAllCommands = useCallback(async (): Promise<{ success: boolean; commands: Command[] }> => {
    setLoading(true)
    try {
      const req = {} as GetAllCommandsRequest
      const { response } = await client.getAllCommands(req)
      const commandList = (response.commands ?? []).map(c => ({
        commandId: c.commandId,
        commandName: c.commandName,
        commandScript: c.commandScript,
        description: c.description
      }))
      setCommands(commandList)
      return { success: true, commands: commandList }
    } catch (error: any) {
      return { success: false, commands: [] }
    } finally {
      setLoading(false)
    }
  }, [])

  const executeCommand = useCallback(async (commandId: string): Promise<ExecutionResult> => {
    setLoading(true)
    try {
      const req: ExecuteCommandRequest = { commandId }
      const { response } = await client.executeCommand(req)
      return {
        output: response.output || '',
        error: response.error || '',
        exitCode: response.exitCode || 0,
        success: response.exitCode === 0
      }
    } catch (error: any) {
      return {
        output: '',
        error: error?.message || String(error),
        exitCode: -1,
        success: false
      }
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    commands,
    loading,
    storeCommand,
    getAllCommands,
    executeCommand,
  }
}