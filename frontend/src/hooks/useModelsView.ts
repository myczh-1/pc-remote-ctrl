import { useCallback, useRef, useState } from 'react'
import type { DeviceModel, DeviceModelSpec } from '../proto/home/service'

interface ModelsApi {
  listDeviceModels?: (opts?: { id?: string; nameContains?: string }) => Promise<{ ok: boolean; models?: DeviceModel[]; error?: string }>
  createDeviceModel?: (model: DeviceModelSpec) => Promise<{ ok: boolean; error?: string; message?: string }>
  updateDeviceModel?: (model: DeviceModelSpec) => Promise<{ ok: boolean; error?: string; message?: string }>
  deleteDeviceModel?: (id: string, version: string) => Promise<{ ok: boolean; error?: string; message?: string }>
}

interface Logger {
  logError: (message: string) => void
  logSuccess: (message: string) => void
}

export function useModelsView(api: ModelsApi, logger: Logger) {
  const [models, setModels] = useState<DeviceModel[]>([])
  const [modelLoading, setModelLoading] = useState(false)
  const modelLoadingRef = useRef(false)
  const [modelError, setModelError] = useState('')
  const [modelEditOpen, setModelEditOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<DeviceModel | undefined>(undefined)

  const loadDeviceModels = useCallback(async () => {
    if (modelLoadingRef.current) return
    modelLoadingRef.current = true
    setModelLoading(true)
    setModelError('')
    try {
      const res = await api.listDeviceModels?.({})
      if (!res || !res.ok) {
        setModelError(res?.error || '加载设备模型失败')
        return
      }
      setModels(res.models || [])
    } catch (e: any) {
      setModelError(String(e?.message ?? e))
    } finally {
      modelLoadingRef.current = false
      setModelLoading(false)
    }
  }, [api.listDeviceModels])

  const submitModel = async (model: DeviceModelSpec) => {
    try {
      if (editingModel) {
        const res = await api.updateDeviceModel?.(model)
        if (!res?.ok) throw new Error(res?.error || res?.message || '更新失败')
        logger.logSuccess('模型已更新')
      } else {
        const res = await api.createDeviceModel?.(model)
        if (!res?.ok) throw new Error(res?.error || res?.message || '创建失败')
        logger.logSuccess('模型已创建')
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      throw new Error(`模型保存失败: ${msg}`)
    }
    setModelEditOpen(false)
    setEditingModel(undefined)
    await loadDeviceModels()
  }

  const deleteModel = async (model: DeviceModel) => {
    const res = await api.deleteDeviceModel?.(model.id, model.version)
    if (res?.ok) {
      logger.logSuccess(`模型已删除：${model.id}@${model.version}`)
      await loadDeviceModels()
    } else {
      logger.logError(res?.error || res?.message || '删除失败')
    }
  }

  return {
    models,
    modelLoading,
    modelError,
    modelEditOpen,
    editingModel,
    setModelEditOpen,
    setEditingModel,
    loadDeviceModels,
    submitModel,
    deleteModel,
  }
}
