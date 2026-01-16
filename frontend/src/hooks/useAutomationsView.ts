import { useCallback, useEffect, useRef, useState } from 'react'
import type { Automation, LogEntry } from '../proto/home/service'

interface AutomationsApi {
  listAutomations: (opts: { includeDisabled?: boolean; tag?: string; name?: string; pageSize?: number; pageToken?: string }) => Promise<{ ok: boolean; automations?: Automation[]; nextPageToken?: string; error?: string }>
  setAutomationEnabled: (automationId: string, enabled: boolean) => Promise<{ ok: boolean; error?: string; message?: string }>
  triggerAutomation: (automationId: string) => Promise<{ ok: boolean; error?: string; message?: string }>
  upsertAutomation: (automation: Automation) => Promise<{ ok: boolean; error?: string; message?: string }>
  listAuditLogs: (opts: { kind?: string; subject?: string; pageSize?: number; pageToken?: string }) => Promise<{ ok: boolean; entries?: LogEntry[]; nextPageToken?: string; error?: string }>
}

interface Logger {
  logInfo: (message: string) => void
  logError: (message: string) => void
  logSuccess: (message: string) => void
}

export function useAutomationsView(automationApi: AutomationsApi | null, logger: Logger) {
  const listAutomations = automationApi?.listAutomations
  const setAutomationEnabled = automationApi?.setAutomationEnabled
  const triggerAutomationApi = automationApi?.triggerAutomation
  const upsertAutomation = automationApi?.upsertAutomation
  const listAuditLogs = automationApi?.listAuditLogs
  const [automations, setAutomations] = useState<Automation[]>([])
  const [autoLoading, setAutoLoading] = useState(false)
  const [autoError, setAutoError] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterName, setFilterName] = useState('')
  const [autoEditOpen, setAutoEditOpen] = useState(false)
  const [editingAuto, setEditingAuto] = useState<Automation | undefined>(undefined)
  const [autoLogs, setAutoLogs] = useState<Record<string, { entries: LogEntry[]; loading: boolean; error?: string; next?: string }>>({})
  const [logsOpen, setLogsOpen] = useState<Record<string, boolean>>({})
  const autoLogsRef = useRef(autoLogs)

  useEffect(() => {
    autoLogsRef.current = autoLogs
  }, [autoLogs])

  const loadAutomations = useCallback(async (_reset?: boolean) => {
    if (!listAutomations) {
      setAutoError('云端模式暂不支持自动化管理')
      return
    }
    setAutoLoading(true)
    setAutoError('')
    try {
      const nextTokens = new Set<string>()
      let pageToken = ''
      let nextPage = ''
      const all: Automation[] = []

      do {
        const res = await listAutomations({
          includeDisabled: true,
          tag: filterTag,
          name: filterName,
          pageSize: 50,
          pageToken,
        })
        if (!res.ok) {
          setAutoError(res.error || '加载失败')
          return
        }
        all.push(...(res.automations || []))
        nextPage = res.nextPageToken || ''
        if (!nextPage || nextTokens.has(nextPage)) {
          nextPage = ''
        } else {
          nextTokens.add(nextPage)
        }
        pageToken = nextPage
      } while (pageToken)

      setAutomations(all)
    } catch (e: any) {
      setAutoError(String(e?.message ?? e))
    } finally {
      setAutoLoading(false)
    }
  }, [listAutomations, filterName, filterTag])

  const loadAutomationLogs = useCallback(async (automationId: string, reset?: boolean) => {
    if (!listAuditLogs) {
      logger.logError('暂不支持查询日志')
      return
    }
    setAutoLogs(prev => ({ ...prev, [automationId]: { ...(prev[automationId] || { entries: [] }), loading: true, error: undefined } }))
    const prevState = autoLogsRef.current[automationId]
    const res = await listAuditLogs({
      subject: automationId,
      pageSize: 10,
      pageToken: reset ? '' : (prevState?.next || ''),
      kind: 'automation_execute',
    })
    if (res.ok) {
      const entries = (res as any).entries || []
      setAutoLogs(prev => ({
        ...prev,
        [automationId]: {
          entries: reset ? entries : [...(prevState?.entries || []), ...entries],
          loading: false,
          next: (res as any).nextPageToken || '',
        },
      }))
    } else {
      setAutoLogs(prev => ({ ...prev, [automationId]: { ...(prevState || { entries: [] }), loading: false, error: (res as any).error } }))
    }
  }, [listAuditLogs, logger])

  const toggleLogOpen = async (automationId: string) => {
    const open = !logsOpen[automationId]
    setLogsOpen(prev => ({ ...prev, [automationId]: open }))
    if (open && !autoLogs[automationId]) {
      await loadAutomationLogs(automationId, true)
    }
  }

  const closeLog = (automationId: string) => {
    setLogsOpen(prev => {
      if (!prev[automationId]) return prev
      return { ...prev, [automationId]: false }
    })
  }

  const clearLog = (automationId: string) => {
    setAutoLogs(prev => {
      if (!prev[automationId]) return prev
      const next = { ...prev }
      delete next[automationId]
      return next
    })
    closeLog(automationId)
  }

  const toggleEnabled = async (automation: Automation) => {
    if (!setAutomationEnabled) {
      logger.logError('云端模式暂不支持')
      return
    }
    const r = await setAutomationEnabled(automation.id, !automation.enabled)
    if (r.ok) {
      logger.logSuccess(`${!automation.enabled ? '启用' : '停用'}成功`)
      await loadAutomations(true)
    } else {
      logger.logError(r.error || r.message || '操作失败')
    }
  }

  const triggerAutomation = async (automation: Automation) => {
    if (!triggerAutomationApi) {
      logger.logError('云端模式暂不支持')
      return
    }
    logger.logInfo(`手动触发: ${automation.name || automation.id}`)
    const r = await triggerAutomationApi(automation.id)
    if (r.ok) logger.logSuccess('触发成功')
    else logger.logError(r.error || r.message || '触发失败')
  }

  const submitAutomation = async (automation: Automation) => {
    if (!upsertAutomation) throw new Error('云端模式暂不支持自动化管理')
    const res = await upsertAutomation(automation)
    if (!res.ok) throw new Error(res.error || res.message || '保存失败')
    logger.logSuccess(`${editingAuto ? '更新' : '创建'}成功`)
    setAutoEditOpen(false)
    setEditingAuto(undefined)
    await loadAutomations(true)
  }

  return {
    automations,
    autoLoading,
    autoError,
    filterTag,
    filterName,
    autoEditOpen,
    editingAuto,
    autoLogs,
    logsOpen,
    setFilterTag,
    setFilterName,
    setAutoEditOpen,
    setEditingAuto,
    loadAutomations,
    loadAutomationLogs,
    toggleLogOpen,
    toggleEnabled,
    triggerAutomation,
    submitAutomation,
  }
}
