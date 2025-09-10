import { useState, useEffect, useCallback } from 'react'
import { ControllerServiceClient } from '../proto/remote_control.client'
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport'
import type { CommandSet } from '../types'
import type {
  StoreCommandSetRequest,
  UpdateCommandSetRequest,
  DeleteCommandSetRequest,
  GetAllCommandSetsRequest,
} from '../proto/remote_control'

const transport = new GrpcWebFetchTransport({ baseUrl: '/api' })
const client = new ControllerServiceClient(transport)

const STORAGE_KEY = 'lazy-ctrl-command-sets'

export function useCommandSets() {
  const [commandSets, setCommandSets] = useState<CommandSet[]>([])
  const [loading, setLoading] = useState(false)

  // 从后端加载命令集
  const loadFromServer = useCallback(async () => {
    setLoading(true)
    try {
      const req = {} as GetAllCommandSetsRequest
      const { response } = await client.getAllCommandSets(req)
      const serverCommandSets = (response.commandSets ?? []).map(cs => ({
        commandId: cs.commandSetId,
        commandName: cs.commandSetName,
        commandScripts: cs.commandScripts,
        description: cs.description,
        isComposite: false,
        created: new Date()
      }))
      setCommandSets(serverCommandSets)
      return { success: true, commandSets: serverCommandSets }
    } catch (error: any) {
      console.error('Failed to load command sets from server:', error)
      return { success: false, commandSets: [] }
    } finally {
      setLoading(false)
    }
  }, [])

  // 初始化时从本地存储加载，然后从服务器同步
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        const setsWithDates = parsed.map((cs: any) => ({
          ...cs,
          created: new Date(cs.created)
        })).filter((cs: any) => cs.commandScripts) // 只保留有commandScripts的数据
        setCommandSets(setsWithDates)
      } catch (error) {
        console.error('Failed to parse stored command sets:', error)
      }
    }
    // 从服务器加载最新数据
    loadFromServer()
  }, [])

  const saveToStorage = useCallback((commandSets: CommandSet[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(commandSets))
  }, [])

  const createCommandSet = useCallback(async (commandSet: Omit<CommandSet, 'commandId' | 'created'>) => {
    const newCommandSet: CommandSet = {
      ...commandSet,
      commandId: crypto.randomUUID(),
      created: new Date()
    }
    
    setLoading(true)
    try {
      // 保存到服务器
      const req: StoreCommandSetRequest = {
        commandSetId: newCommandSet.commandId,
        commandSetName: newCommandSet.commandName,
        commandScripts: newCommandSet.commandScripts,
        description: newCommandSet.description || ''
      }
      
      const { response } = await client.storeCommandSet(req)
      
      if (response.success) {
        // 服务器保存成功，更新本地状态
        setCommandSets(prev => {
          const updated = [...prev, newCommandSet]
          saveToStorage(updated)
          return updated
        })
        return { success: true, commandSet: newCommandSet, message: response.message }
      } else {
        return { success: false, commandSet: null, message: response.message }
      }
    } catch (error: any) {
      return { success: false, commandSet: null, message: error.message || String(error) }
    } finally {
      setLoading(false)
    }
  }, [saveToStorage])

  const updateCommandSet = useCallback(async (id: string, updates: Partial<Omit<CommandSet, 'commandId' | 'created'>>) => {
    const existing = commandSets.find(cs => cs.commandId === id)
    if (!existing) {
      return { success: false, message: 'Command set not found' }
    }

    const updatedCommandSet = { ...existing, ...updates }
    
    setLoading(true)
    try {
      // 调用后端更新API
      const req: UpdateCommandSetRequest = {
        commandSetId: id,
        commandSetName: updatedCommandSet.commandName,
        commandScripts: updatedCommandSet.commandScripts,
        description: updatedCommandSet.description || ''
      }
      
      const { response } = await client.updateCommandSet(req)
      
      if (response.success) {
        // 后端更新成功，更新本地状态
        setCommandSets(prev => {
          const updated = prev.map(commandSet =>
            commandSet.commandId === id ? updatedCommandSet : commandSet
          )
          saveToStorage(updated)
          return updated
        })
        return { success: true, message: response.message }
      } else {
        return { success: false, message: response.message }
      }
    } catch (error: any) {
      return { success: false, message: error.message || String(error) }
    } finally {
      setLoading(false)
    }
  }, [commandSets, saveToStorage])

  const deleteCommandSet = useCallback(async (id: string) => {
    setLoading(true)
    try {
      // 调用后端删除API
      const req: DeleteCommandSetRequest = {
        commandSetId: id
      }
      
      const { response } = await client.deleteCommandSet(req)
      
      if (response.success) {
        // 后端删除成功，更新本地状态
        setCommandSets(prev => {
          const updated = prev.filter(commandSet => commandSet.commandId !== id)
          saveToStorage(updated)
          return updated
        })
        return { success: true, message: response.message }
      } else {
        return { success: false, message: response.message }
      }
    } catch (error: any) {
      return { success: false, message: error.message || String(error) }
    } finally {
      setLoading(false)
    }
  }, [saveToStorage])

  const getCommandSet = useCallback((id: string) => {
    return commandSets.find(commandSet => commandSet.commandId === id)
  }, [commandSets])

  const createCompositeCommandSet = useCallback((
    name: string,
    sourceCommandIds: string[],
    description?: string
  ) => {
    const sourceCommandSets = sourceCommandIds
      .map(id => getCommandSet(id))
      .filter(Boolean) as CommandSet[]

    if (sourceCommandSets.length === 0) return null

    const combinedScripts = sourceCommandSets.reduce<string[]>((acc, commandSet) => {
      return [...acc, ...commandSet.commandScripts]
    }, [])

    return createCommandSet({
      commandName: name,
      commandScripts: combinedScripts,
      description,
      isComposite: true,
      sourceCommandIds
    })
  }, [commandSets, createCommandSet, getCommandSet])

  const duplicateCommandSet = useCallback((id: string, newName?: string) => {
    const original = getCommandSet(id)
    if (!original) return null

    return createCommandSet({
      commandName: newName || `${original.commandName} (副本)`,
      commandScripts: [...original.commandScripts],
      description: original.description,
      isComposite: false
    })
  }, [getCommandSet, createCommandSet])

  return {
    commandSets,
    loading,
    createCommandSet,
    updateCommandSet,
    deleteCommandSet,
    getCommandSet,
    createCompositeCommandSet,
    duplicateCommandSet,
    loadFromServer
  }
}