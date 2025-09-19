import type { LogEntry } from '../types'

interface ConsoleProps {
  logs: LogEntry[]
  onClear?: () => void
  onCopy?: () => void
  fullHeight?: boolean
  isDarkMode?: boolean
}

export function Console({ logs, onClear, onCopy, fullHeight = false, isDarkMode = false }: ConsoleProps) {
  const outerBorder = fullHeight ? 'border-l' : 'border-t'

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'success': case 'execution_complete': return '✅'
      case 'error': case 'execution_error': return '❌'
      case 'execution_start': return '🚀'
      default: return 'ℹ️'
    }
  }

  const getLogColor = (level: string) => {
    switch (level) {
      case 'success': case 'execution_complete': return 'text-green-600 dark:text-green-400'
      case 'error': case 'execution_error': return 'text-red-600 dark:text-red-400'
      case 'execution_start': return 'text-blue-600 dark:text-blue-400'
      default: return 'text-slate-600 dark:text-slate-400'
    }
  }

  return (
    <section className={`h-full ${outerBorder} border border-black/10 bg-white/60 px-4 py-3 backdrop-blur-md backdrop-saturate-[1.4] transition-colors dark:border-white/10 dark:bg-white/[0.08] ${fullHeight ? 'flex flex-col min-h-0' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 002 2z" />
          </svg>
          <span className="text-black dark:text-white font-medium">控制台</span>
        </div>
        <div className="flex items-center gap-2">
          {onCopy && (
            <button
              onClick={onCopy}
              className="px-2 py-1 text-xs rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"
            >
              复制
            </button>
          )}
          {onClear && (
            <button
              onClick={onClear}
              className="px-2 py-1 text-xs rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"
            >
              清空
            </button>
          )}
        </div>
      </div>

      <div className={`${fullHeight ? 'flex-1 min-h-0' : 'h-52'} overflow-auto rounded-xl bg-white/70 dark:bg-slate-950/70 border border-black/10 dark:border-white/5 p-3 font-mono text-sm leading-6`}>
        {logs.length === 0 ? (
          <div className="text-slate-400 dark:text-slate-500 text-center py-8">
            暂无日志
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="text-xs mt-0.5">{getLogIcon(log.level)}</span>
                <div className="flex-1">
                  <div className={`${getLogColor(log.level)} font-medium`}>
                    {log.message}
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {log.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
