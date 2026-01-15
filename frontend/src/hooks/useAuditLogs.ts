import { useCallback, useRef, useState } from 'react'
import type { LogEntry } from '../proto/home/service'

type ListAuditLogs = (opts: { kind?: string; subject?: string; pageSize?: number; pageToken?: string }) => Promise<{
  ok: boolean
  entries?: LogEntry[]
  nextPageToken?: string
  error?: string
}>

export function useAuditLogs(listAuditLogs: ListAuditLogs) {
  const [auditLogs, setAuditLogs] = useState<LogEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState('')
  const [auditFilters, setAuditFilters] = useState({ kind: '', subject: '' })
  const [auditNext, setAuditNext] = useState('')
  const auditNextRef = useRef('')
  const auditQueryRef = useRef({ kind: '', subject: '' })

  const fetchAuditLogs = useCallback(async (reset?: boolean) => {
    if (auditLoading && !reset) {
      return
    }
    setAuditLoading(true)
    setAuditError('')
    try {
      const res = await listAuditLogs({
        kind: auditQueryRef.current.kind,
        subject: auditQueryRef.current.subject,
        pageSize: 30,
        pageToken: reset ? '' : auditNextRef.current,
      })
      if (!res.ok) {
        setAuditError(res.error || '加载日志失败')
        if (reset) {
          setAuditLogs([])
          auditNextRef.current = ''
          setAuditNext('')
        }
        return
      }
      const batch = (res.entries as LogEntry[]) || []
      setAuditLogs(prev => (reset ? batch : [...prev, ...batch]))
      const nextToken = res.nextPageToken || ''
      auditNextRef.current = nextToken
      setAuditNext(nextToken)
    } catch (e: any) {
      setAuditError(String(e?.message ?? e))
      if (reset) {
        setAuditLogs([])
        auditNextRef.current = ''
        setAuditNext('')
      }
    } finally {
      setAuditLoading(false)
    }
  }, [listAuditLogs, auditLoading])

  const ensureAuditLogsLoaded = useCallback(() => {
    if (!auditLogs.length && !auditLoading) {
      fetchAuditLogs(true)
    }
  }, [auditLoading, auditLogs.length, fetchAuditLogs])

  const handleAuditFilterChange = (next: Partial<{ kind: string; subject: string }>) => {
    setAuditFilters(prev => ({ ...prev, ...next }))
  }

  const applyAuditFilters = () => {
    const next = {
      kind: auditFilters.kind.trim(),
      subject: auditFilters.subject.trim(),
    }
    auditQueryRef.current = next
    fetchAuditLogs(true)
  }

  const resetAuditFilters = () => {
    const next = { kind: '', subject: '' }
    setAuditFilters(next)
    auditQueryRef.current = next
    fetchAuditLogs(true)
  }

  const refreshAuditLogs = () => {
    fetchAuditLogs(true)
  }

  const loadMoreAuditLogs = () => {
    if (auditLoading) return
    if (!auditNextRef.current) return
    fetchAuditLogs(false)
  }

  return {
    auditLogs,
    auditLoading,
    auditError,
    auditFilters,
    auditNext,
    handleAuditFilterChange,
    applyAuditFilters,
    resetAuditFilters,
    refreshAuditLogs,
    loadMoreAuditLogs,
    ensureAuditLogsLoaded,
  }
}
