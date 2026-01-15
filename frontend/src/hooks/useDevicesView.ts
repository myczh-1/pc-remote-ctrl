import { useCallback, useMemo, useState } from 'react'
import type { ActionSpec, Device } from '../proto/home/service'
import type { DeviceStatusFilter } from '../components/DeviceFilters'

interface DevicesApi {
  devices?: Device[]
  loading?: boolean
  error?: string
  listDevices: (opts?: { room?: string; tags?: string[] }) => Promise<{ ok: boolean; count?: number; error?: string }>
  invokeAction: (deviceId: string, action: string, args?: Record<string, any>) => Promise<{ ok: boolean; error?: string; message?: string; corrId?: string }>
}

interface Logger {
  logInfo: (message: string, level?: any, executionData?: any) => void
  logError: (message: string, level?: any, executionData?: any) => void
  logSuccess: (message: string, level?: any, executionData?: any) => void
}

export function useDevicesView(api: DevicesApi, logger: Logger) {
  const [deviceFilters, setDeviceFilters] = useState<{ search: string; status: DeviceStatusFilter; room: string; tags: string[] }>(() => ({
    search: '',
    status: 'all',
    room: '',
    tags: [],
  }))
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailDeviceId, setDetailDeviceId] = useState('')
  const [detailInitialAction, setDetailInitialAction] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Device | undefined>(undefined)

  const activeTags = useMemo(() => deviceFilters.tags.filter(Boolean), [deviceFilters.tags])
  const normalizedRoom = deviceFilters.room.trim()
  const availableRooms = useMemo(() => {
    const set = new Set<string>()
    for (const d of api.devices ?? []) {
      const room = (d.room ?? '').trim()
      if (room) set.add(room)
    }
    return Array.from(set).sort()
  }, [api.devices])
  const availableTags = useMemo(() => {
    const set = new Set<string>()
    for (const d of api.devices ?? []) {
      for (const tag of d.tags ?? []) {
        const trimmed = tag.trim()
        if (trimmed) set.add(trimmed)
      }
    }
    return Array.from(set).sort()
  }, [api.devices])
  const totalDevices = api.devices?.length ?? 0
  const visibleDevices = useMemo(() => {
    const query = deviceFilters.search.trim().toLowerCase()
    return (api.devices ?? []).filter(d => {
      if (deviceFilters.status === 'online' && !d.online) return false
      if (deviceFilters.status === 'offline' && d.online) return false
      if (normalizedRoom && (d.room ?? '') !== normalizedRoom) return false
      if (activeTags.length && !activeTags.every(tag => (d.tags ?? []).includes(tag))) return false
      if (!query) return true
      const haystack = [d.name, d.id, d.type, d.room]
        .concat(d.tags ?? [])
        .map(v => (v || '').toString().toLowerCase())
        .join(' ')
      return haystack.includes(query)
    })
  }, [api.devices, deviceFilters.search, deviceFilters.status, normalizedRoom, activeTags])

  const requestDevicesWithRemoteFilters = useCallback(() => {
    return api.listDevices({
      room: normalizedRoom || undefined,
      tags: activeTags,
    })
  }, [api.listDevices, normalizedRoom, activeTags])

  const handleDeviceSearchChange = (search: string) => {
    setDeviceFilters(prev => ({ ...prev, search }))
  }

  const handleDeviceStatusChange = (status: DeviceStatusFilter) => {
    setDeviceFilters(prev => ({ ...prev, status }))
  }

  const handleDeviceRoomChange = (room: string) => {
    setDeviceFilters(prev => ({ ...prev, room }))
  }

  const handleToggleDeviceTag = (tag: string) => {
    setDeviceFilters(prev => {
      const exists = prev.tags.includes(tag)
      const nextTags = exists ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag]
      return { ...prev, tags: nextTags }
    })
  }

  const handleResetDeviceFilters = () => {
    setDeviceFilters({ search: '', status: 'all', room: '', tags: [] })
  }

  const handleRefreshDevices = async () => {
    const r = await requestDevicesWithRemoteFilters()
    if (r.ok) logger.logInfo(`设备: ${r.count} 台`)
    else logger.logError(`刷新设备失败: ${r.error}`)
  }

  const handleQuickAction = async (device: Device, action: ActionSpec) => {
    const requiresArgs = action?.argsSchema && Object.keys(action.argsSchema).length > 0
    if (requiresArgs) {
      logger.logInfo(`动作 ${action.name} 需要参数，请在详情中填写`)
      setDetailDeviceId(device.id)
      setDetailInitialAction(action.name)
      setDetailOpen(true)
      return
    }
    logger.logInfo(`执行: ${action.name} @ ${device.id}`, 'execution_start', { commandSetName: action.name })
    const r = await api.invokeAction(device.id, action.name)
    if (r.ok) {
      logger.logSuccess(`执行完成: ${action.name}${r.corrId ? ` (${r.corrId})` : ''}`, 'execution_complete', { commandSetName: action.name })
    } else {
      logger.logError(`执行失败: ${r.error || r.message}`, 'execution_error', { commandSetName: action.name })
    }
  }

  const openDetail = (deviceId: string, initialAction = '') => {
    setDetailDeviceId(deviceId)
    setDetailInitialAction(initialAction)
    setDetailOpen(true)
  }

  const closeDetail = () => {
    setDetailOpen(false)
    setDetailInitialAction('')
  }

  const clearDetail = () => {
    setDetailOpen(false)
    setDetailInitialAction('')
    setDetailDeviceId('')
  }

  const startEdit = (device: Device) => {
    setEditing(device)
    setCreateOpen(true)
  }

  const stopEdit = () => {
    setCreateOpen(false)
    setEditing(undefined)
  }

  return {
    deviceFilters,
    setDeviceFilters,
    activeTags,
    normalizedRoom,
    availableRooms,
    availableTags,
    totalDevices,
    visibleDevices,
    detailOpen,
    detailDeviceId,
    detailInitialAction,
    createOpen,
    editing,
    openDetail,
    closeDetail,
    clearDetail,
    startEdit,
    stopEdit,
    setCreateOpen,
    setEditing,
    requestDevicesWithRemoteFilters,
    handleDeviceSearchChange,
    handleDeviceStatusChange,
    handleDeviceRoomChange,
    handleToggleDeviceTag,
    handleResetDeviceFilters,
    handleRefreshDevices,
    handleQuickAction,
  }
}
