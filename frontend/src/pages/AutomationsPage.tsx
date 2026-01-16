import type { ReactNode } from 'react'
import type { Automation, LogEntry } from '../proto/home/service'
import { AutomationLogic } from '../proto/home/service'

interface AutomationsPageProps {
  automations: Automation[]
  autoLoading: boolean
  onToggleLog: (automationId: string) => void
  onEdit: (automation: Automation) => void
  onToggleEnabled: (automation: Automation) => void
  onTrigger: (automation: Automation) => void
  autoLogs: Record<string, { entries: LogEntry[]; loading: boolean; error?: string; next?: string }>
  logsOpen: Record<string, boolean>
  onLoadAutomationLogs: (automationId: string) => void
  filtersPanel?: ReactNode
  showFilters?: boolean
}

function tryStringify(obj: any) {
  try { return JSON.stringify(obj) } catch { return String(obj) }
}

export function AutomationsPage({
  automations,
  autoLoading,
  onToggleLog,
  onEdit,
  onToggleEnabled,
  onTrigger,
  autoLogs,
  logsOpen,
  onLoadAutomationLogs,
  filtersPanel,
  showFilters = false,
}: AutomationsPageProps) {
  return (
    <div className="flex gap-4 min-h-0">
      {showFilters && filtersPanel && (
        <div className="hidden lg:flex w-64 shrink-0">
          {filtersPanel}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="grid gap-3 justify-center content-start grid-cols-[repeat(auto-fit,minmax(320px,420px))]">
          {automations.map(a => (
            <div key={a.id} className="rounded-2xl border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/[0.04] p-4 shadow-sm flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-base font-semibold">{a.name || a.id}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{a.id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onToggleLog(a.id)}
                    className="text-xs px-3 py-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200"
                  >
                    {logsOpen[a.id] ? '收起日志' : '查看日志'}
                  </button>
                  <button
                    onClick={() => onEdit(a)}
                    className="text-xs px-3 py-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => onToggleEnabled(a)}
                    className={`px-3 py-1 rounded-full text-xs ${a.enabled ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-200' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200'}`}
                  >
                    {a.enabled ? '已启用' : '已停用'}
                  </button>
                </div>
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {a.when && a.when.conditions?.length
                  ? `触发: ${a.when.logic === AutomationLogic.LOGIC_ANY ? '任一' : '全部'} · ${a.when.conditions.length} 条件`
                  : '无触发条件'}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                动作: {a.then?.length || 0} 个
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => onTrigger(a)}
                  className="flex-1 px-3 py-2 rounded-lg bg-prime-500 text-white hover:bg-prime-600 active:scale-[0.99]"
                >
                  手动触发
                </button>
                <button
                  onClick={() => onToggleEnabled(a)}
                  className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 active:scale-[0.99]"
                >
                  {a.enabled ? '停用' : '启用'}
                </button>
              </div>
              {a.tags && a.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {a.tags.map(t => (
                    <span key={t} className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-200">{t}</span>
                  ))}
                </div>
              )}
              {logsOpen[a.id] && (
                <div className="mt-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 p-2 space-y-1">
                  {autoLogs[a.id]?.loading && <div className="text-xs text-slate-500">加载日志...</div>}
                  {autoLogs[a.id]?.error && <div className="text-xs text-red-500">{autoLogs[a.id]?.error}</div>}
                  {(autoLogs[a.id]?.entries || []).map((log) => (
                    <div key={log.id} className="text-xs text-slate-600 dark:text-slate-300 flex justify-between gap-2">
                      <span className="truncate">{new Date(Number(log.ts || 0)).toLocaleTimeString()} · {log.kind}</span>
                      {log.data && <span className="truncate text-slate-500">{tryStringify(log.data)}</span>}
                    </div>
                  ))}
                  {autoLogs[a.id]?.next && (
                    <button
                      onClick={() => onLoadAutomationLogs(a.id)}
                      className="text-xs px-3 py-1 rounded-full bg-white/70 dark:bg-white/10 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-white/10"
                    >
                      加载更多
                    </button>
                  )}
                  {(!autoLogs[a.id]?.entries || autoLogs[a.id]?.entries.length === 0) && !autoLogs[a.id]?.loading && (
                    <div className="text-xs text-slate-500">暂无日志</div>
                  )}
                </div>
              )}
            </div>
          ))}
          {!automations.length && !autoLoading && (
            <div className="text-sm text-slate-500 dark:text-slate-400">暂无自动化</div>
          )}
        </div>
      </div>
    </div>
  )
}
