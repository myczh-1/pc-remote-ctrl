interface LogDisplayProps {
  log: string
  onClear?: () => void
}

export function LogDisplay({ log, onClear }: LogDisplayProps) {

  const logLines = log ? log.split('\n').filter(line => line.trim()) : []
  const hasLogs = logLines.length > 0

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">执行日志</h3>
          {hasLogs && <span className="text-xs text-slate-600 dark:text-slate-400">{logLines.length} 条记录</span>}
        </div>
        {onClear && hasLogs && (
          <button className="px-3 py-1.5 text-sm rounded-lg border border-black/10 bg-white/50 text-slate-900 transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.08] dark:text-slate-100 dark:hover:bg-white/10" onClick={onClear}>
            清空日志
          </button>
        )}
      </div>

      {!hasLogs ? (
        <div className="text-center text-slate-400 py-8">
          <p className="text-sm">暂无日志记录</p>
          <p className="text-xs">执行命令后日志将在此显示</p>
        </div>
      ) : (
        <div className="space-y-1 max-h-[420px] overflow-auto">
          {logLines.slice(-50).map((line, index) => {
            const isError = line.includes('ERROR') || line.includes('错误') || line.includes('失败')
            const isSuccess = line.includes('SUCCESS') || line.includes('成功') || line.includes('完成')
            const isInfo = line.includes('INFO') || line.includes('信息')

            const cls = isError
              ? 'text-red-700 bg-red-50 border-red-300 dark:text-red-300 dark:bg-red-900/20 dark:border-red-500/30'
              : isSuccess
              ? 'text-green-700 bg-green-50 border-green-300 dark:text-green-300 dark:bg-green-900/20 dark:border-green-500/30'
              : isInfo
              ? 'text-blue-700 bg-blue-50 border-blue-300 dark:text-blue-300 dark:bg-blue-900/20 dark:border-blue-500/30'
              : 'text-slate-700 bg-black/5 border-slate-300 dark:text-slate-200 dark:bg-slate-800/30 dark:border-slate-600/30'

            return (
              <div key={index} className={`text-sm border rounded-lg px-2 py-1 flex items-start gap-2 ${cls}`}>
                <span className="text-xs text-slate-500 shrink-0 mt-0.5">
                  {new Date().toLocaleTimeString()}
                </span>
                <span className="whitespace-pre-wrap break-words">{line}</span>
              </div>
            )
          })}
        </div>
      )}

      {logLines.length > 50 && (
        <div className="mt-2 text-xs text-slate-500">
          显示最近 50 条记录，共 {logLines.length} 条
        </div>
      )}
    </div>
  )
}
