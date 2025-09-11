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
          <h3 className="text-base font-semibold text-gray-900">执行日志</h3>
          {hasLogs && <span className="text-xs text-gray-500">{logLines.length} 条记录</span>}
        </div>
        {onClear && hasLogs && (
          <button className="px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50" onClick={onClear}>
            清空日志
          </button>
        )}
      </div>

      {!hasLogs ? (
        <div className="text-center text-gray-600 py-8">
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
              ? 'text-red-700 bg-red-50 border-red-200'
              : isSuccess
              ? 'text-green-700 bg-green-50 border-green-200'
              : isInfo
              ? 'text-blue-700 bg-blue-50 border-blue-200'
              : 'text-gray-800 bg-gray-50 border-gray-200'

            return (
              <div key={index} className={`text-sm border rounded px-2 py-1 flex items-start gap-2 ${cls}`}>
                <span className="text-xs text-gray-500 shrink-0 mt-0.5">
                  {new Date().toLocaleTimeString()}
                </span>
                <span className="whitespace-pre-wrap break-words">{line}</span>
              </div>
            )
          })}
        </div>
      )}

      {logLines.length > 50 && (
        <div className="mt-2 text-xs text-gray-500">
          显示最近 50 条记录，共 {logLines.length} 条
        </div>
      )}
    </div>
  )
}
