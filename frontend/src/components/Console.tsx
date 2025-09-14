import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import Convert from 'ansi-to-html'
import type { LogEntry, CommandSetExecution } from '../types'

interface ConsoleProps {
  logs: LogEntry[];
  execution?: CommandSetExecution | null;
  onClear?: () => void;
  onCopy?: () => void;
  onStopExecution?: () => void;
  onClearExecution?: () => void;
  fullHeight?: boolean; // 横向布局时填满父容器高度
  isDarkMode?: boolean;
}

export function Console({ logs, execution, onClear, onCopy, onStopExecution, onClearExecution, fullHeight = false, isDarkMode = false }: ConsoleProps) {
  const convert = new Convert({ fg: '#fff', bg: '#000' })
  const outerBorder = fullHeight ? 'border-l' : 'border-t'
  
  const formatDuration = (startTime?: Date, endTime?: Date) => {
    if (!startTime) return ''
    
    const end = endTime || new Date()
    const duration = Math.floor((end.getTime() - startTime.getTime()) / 1000)
    
    if (duration < 60) return `${duration}s`
    
    const minutes = Math.floor(duration / 60)
    const seconds = duration % 60
    return `${minutes}m ${seconds}s`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-blue-500'
      case 'completed': return 'text-green-500'  
      case 'failed': return 'text-red-500'
      case 'stopped': return 'text-yellow-500'
      default: return 'text-slate-500'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'running': return '执行中'
      case 'completed': return '已完成'
      case 'failed': return '执行失败'
      case 'stopped': return '已停止'
      case 'paused': return '已暂停'
      default: return '未知状态'
    }
  }

  return (
    <section className={`glass ${outerBorder} border-black/10 dark:border-white/5 px-4 py-3 h-full ${fullHeight ? 'flex flex-col min-h-0' : ''}`}>
      {/* 执行状态栏 */}
      {execution && (
        <div className="mb-3 p-3 bg-white/50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-white/10 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3" />
                </svg>
                <span className="font-medium text-slate-900 dark:text-slate-100">{execution.commandSetName}</span>
              </div>
              <span className={`text-sm font-medium ${getStatusColor(execution.status)}`}>
                {getStatusText(execution.status)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                <span>步骤: {execution.currentStep}/{execution.stepResults.length + (execution.status === 'running' ? 1 : 0)}</span>
                {execution.startTime && (
                  <span>耗时: {formatDuration(execution.startTime, execution.endTime)}</span>
                )}
              </div>
              <div className="flex gap-2">
                {execution.status === 'running' && onStopExecution && (
                  <button
                    onClick={onStopExecution}
                    className="px-2 py-1 text-xs bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg"
                  >
                    停止
                  </button>
                )}
                {(execution.status === 'completed' || execution.status === 'failed' || execution.status === 'stopped') && onClearExecution && (
                  <button
                    onClick={onClearExecution}
                    className="px-2 py-1 text-xs bg-slate-500 hover:bg-slate-600 text-white rounded-lg"
                  >
                    清除
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-black dark:text-white">控制台输出</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onCopy}
            className="px-2 py-1 text-xs rounded-lg border border-white/10 hover:bg-white/5"
          >
            复制
          </button>
          <button 
            onClick={onClear}
            className="px-2 py-1 text-xs rounded-lg border border-white/10 hover:bg-white/5"
          >
            清空
          </button>
        </div>
      </div>
      <div className={`${fullHeight ? 'flex-1 min-h-0' : 'h-52'} overflow-auto rounded-xl bg-white/70 dark:bg-slate-950/70 border border-black/10 dark:border-white/5 p-3 font-mono text-sm leading-6 text-slate-900 dark:text-slate-100`}>
        <div className="whitespace-pre-wrap">
          {logs.map((log, index) => {
            const renderLogContent = () => {
              switch (log.level) {
                case 'execution_start':
                  return (
                    <div className="text-blue-600 dark:text-blue-400 font-medium">
                      🚀 开始执行: {log.executionData?.commandSetName}
                    </div>
                  )
                case 'execution_step':
                  const stepData = log.executionData
                  const stepStatus = stepData?.success ? '✅' : '❌'
                  return (
                    <div className="border-l-2 border-slate-300 dark:border-slate-600 pl-3 ml-2 my-2">
                      <div className={`font-medium ${stepData?.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {stepStatus} 步骤 {(stepData?.stepIndex || 0) + 1} (退出码: {stepData?.exitCode})
                      </div>
                      <div className="text-slate-600 dark:text-slate-400 text-xs mb-1">
                        脚本:
                      </div>
                      <div className="mb-2">
                        <SyntaxHighlighter
                          language="bash"
                          style={isDarkMode ? oneDark : oneLight}
                          customStyle={{
                            margin: 0,
                            padding: '6px 8px',
                            fontSize: '11px',
                            borderRadius: '4px',
                            backgroundColor: isDarkMode ? '#1e293b' : '#f1f5f9'
                          }}
                          PreTag="div"
                        >
                          {stepData?.stepScript || ''}
                        </SyntaxHighlighter>
                      </div>
                      {stepData?.output && (
                        <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded text-xs mt-1 border border-slate-200 dark:border-slate-700">
                          <div className="text-slate-500 dark:text-slate-400 mb-1 font-medium">输出:</div>
                          <div
                            className="font-mono text-xs leading-relaxed"
                            dangerouslySetInnerHTML={{
                              __html: convert.toHtml(stepData.output || '')
                            }}
                          />
                        </div>
                      )}
                      {stepData?.error && (
                        <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded text-xs mt-1 border border-red-200 dark:border-red-800">
                          <div className="text-red-500 dark:text-red-400 mb-1 font-medium">错误:</div>
                          <div
                            className="font-mono text-red-700 dark:text-red-300 text-xs leading-relaxed"
                            dangerouslySetInnerHTML={{
                              __html: convert.toHtml(stepData.error || '')
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )
                case 'execution_complete':
                  return (
                    <div className="text-green-600 dark:text-green-400 font-medium">
                      ✅ 执行完成: {log.executionData?.commandSetName} (耗时: {log.executionData?.duration})
                    </div>
                  )
                case 'execution_error':
                  return (
                    <div className="text-red-600 dark:text-red-400 font-medium">
                      ❌ 执行失败: {log.executionData?.commandSetName} - {log.message}
                    </div>
                  )
                default:
                  // 兼容旧的日志格式
                  const oldType = log.level === 'success' ? 'ok' : log.level === 'error' ? 'err' : 'info'
                  return (
                    <div className={`log-line ${oldType}`}>
                      {log.message}
                    </div>
                  )
              }
            }

            return (
              <div key={index} className="mb-1">
                {renderLogContent()}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  );
}
