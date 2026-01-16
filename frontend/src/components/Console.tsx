import type { LogEntry as AuditLogEntry } from '../proto/home/service'
import type { LogEntry as LocalLogEntry } from '../types'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface ConsoleProps {
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

function formatData(data?: AuditLogEntry['data']) {
  if (!data) return ''
  try {
    return JSON.stringify(data)
  } catch {
    return ''
  }
}

function formatTimestamp(ts?: string | number | bigint) {
  const num = Number(ts || 0)
  if (!num) return '--'
  try {
    return new Date(num).toLocaleString()
  } catch {
    return String(ts)
  }
}

export function Console({
  auditLogs,
  liveLogs = [],
  loading,
  error,
  hasMore,
  filters,
  onChangeFilters,
  onApplyFilters,
  onResetFilters,
  onRefresh,
  onLoadMore,
  supported,
  fullHeight = false,
  fullScreen = false,
  onExpand,
  onCloseFull,
}: ConsoleProps) {
  const outerBorder = fullHeight ? 'border-l' : 'border-t'
  const baseLayout = fullHeight
    ? 'h-full min-h-0 flex flex-col w-full'
    : 'flex flex-col w-full min-h-[280px] max-h-[25vh]'
  const contentLayout = 'flex-1 min-h-0 flex flex-col gap-3'

  return (
    <section className={`${outerBorder} border border-black/10 bg-white/60 px-4 py-3 backdrop-blur-md backdrop-saturate-[1.4] transition-colors dark:border-white/10 dark:bg-white/[0.08] ${baseLayout}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 002 2z" />
          </svg>
          <span className="text-black dark:text-white font-medium">日志</span>
        </div>
        <div className="flex items-center gap-2">
          {!fullScreen && (
            <Button
              onClick={onExpand}
              title="放大"
              variant="outline"
              className="w-8 h-8 rounded-full p-0"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h4M7 7v4M17 17h-4M17 17v-4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15l-2 2m0 0H7m0 0v0M15 9l2-2m0 0h0m0 0v0" />
              </svg>
            </Button>
          )}
          {fullScreen && (
            <Button
              onClick={onCloseFull}
              title="关闭"
              variant="outline"
              className="w-8 h-8 rounded-full p-0"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12" />
              </svg>
            </Button>
          )}
        </div>
      </div>

      <div className={contentLayout}>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input
            value={filters.kind}
            onChange={e => onChangeFilters({ kind: e.target.value })}
            placeholder="事件类型 (kind)"
            className="text-sm"
          />
          <Input
            value={filters.subject}
            onChange={e => onChangeFilters({ subject: e.target.value })}
            placeholder="目标 ID (subject)"
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button
              onClick={onApplyFilters}
              className="flex-1 px-3 py-2 rounded-lg bg-prime-500 text-white text-sm hover:bg-prime-600 active:scale-[0.99]"
            >
              应用筛选
            </Button>
            <Button
              onClick={onResetFilters}
              variant="outline"
              className="px-3 py-2 text-sm"
            >
              重置
            </Button>
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-500 border border-red-200 bg-red-50/80 dark:border-red-500/20 dark:bg-red-500/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className={`flex-1 min-h-0 overflow-auto rounded-xl bg-white/70 dark:bg-slate-950/70 border border-black/10 dark:border-white/5 p-3 text-sm leading-6`}>
          {supported ? (
            auditLogs.length === 0 && !loading ? (
              <div className="text-slate-400 dark:text-slate-500 text-center py-8">暂无审计日志</div>
            ) : (
              <div className="space-y-2">
                {auditLogs.map(log => (
                  <div key={log.id} className="rounded-lg border border-black/5 dark:border-white/10 bg-white/80 dark:bg-white/[0.04] px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{formatTimestamp(log.ts)}</span>
                      {log.kind && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-200">类型·{log.kind}</span>}
                      {log.subject && <span className="truncate">对象·{log.subject}</span>}
                      {log.actor && <span className="truncate">操作人·{log.actor}</span>}
                    </div>
                    {log.data && (
                      <div className="mt-1 text-xs text-slate-600 dark:text-slate-300 break-all">
                        {formatData(log.data)}
                      </div>
                    )}
                  </div>
                ))}
                {loading && <div className="text-xs text-slate-500">加载中...</div>}
              </div>
            )
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                当前模式不支持查询审计日志，以下为实时事件。
              </div>
              {liveLogs.length === 0 ? (
                <div className="text-slate-400 dark:text-slate-500 text-center py-8">暂无实时事件</div>
              ) : (
                liveLogs.map((log, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <span className="text-xs text-slate-400 dark:text-slate-500">[{log.timestamp.toLocaleTimeString()}]</span>
                    <span className="font-medium truncate">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <Button
            onClick={onRefresh}
            disabled={loading}
            variant="outline"
            className="px-3 py-1 rounded-full text-xs"
          >
            刷新
          </Button>
          {supported && (
            <Button
              onClick={onLoadMore}
              disabled={!hasMore || loading}
              variant="outline"
              className="px-3 py-1 rounded-full text-xs"
            >
              加载更多
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
