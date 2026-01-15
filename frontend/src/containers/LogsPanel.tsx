import { Console } from '../components/Console'
import type { LogEntry as AuditLogEntry } from '../proto/home/service'
import type { LogEntry as LocalLogEntry } from '../types'

interface LogsPanelProps {
  auditLogs: AuditLogEntry[]
  liveLogs?: LocalLogEntry[]
  loading: boolean
  error?: string
  hasMore: boolean
  filters: { kind: string; subject: string }
  onChangeFilters: (next: Partial<{ kind: string; subject: string }>) => void
  onApplyFilters: () => void
  onResetFilters: () => void
  onRefresh: () => void
  onLoadMore: () => void
  supported: boolean
  fullHeight?: boolean
  fullScreen?: boolean
  isDarkMode?: boolean
  onExpand?: () => void
  onCloseFull?: () => void
}

export function LogsPanel(props: LogsPanelProps) {
  return (
    <Console
      auditLogs={props.auditLogs}
      liveLogs={props.liveLogs}
      loading={props.loading}
      error={props.error}
      hasMore={props.hasMore}
      filters={props.filters}
      onChangeFilters={props.onChangeFilters}
      onApplyFilters={props.onApplyFilters}
      onResetFilters={props.onResetFilters}
      onRefresh={props.onRefresh}
      onLoadMore={props.onLoadMore}
      fullHeight={props.fullHeight}
      fullScreen={props.fullScreen}
      isDarkMode={props.isDarkMode}
      supported={props.supported}
      onExpand={props.onExpand}
      onCloseFull={props.onCloseFull}
    />
  )
}
