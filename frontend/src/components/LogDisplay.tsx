interface LogDisplayProps {
  log: string
  onClear?: () => void
}

export function LogDisplay({ log, onClear }: LogDisplayProps) {
  const logLines = log ? log.split('\n').filter(line => line.trim()) : []
  const hasLogs = logLines.length > 0

  return (
    <div className="log-display">
      <div className="log-header">
        <div className="log-title">
          <h3>📜 执行日志</h3>
          {hasLogs && <span className="log-count">{logLines.length} 条记录</span>}
        </div>
        {onClear && hasLogs && (
          <button className="btn btn-outline" onClick={onClear}>
            🗑️ 清空日志
          </button>
        )}
      </div>
      
      <div className="log-content">
        {!hasLogs ? (
          <div className="log-empty">
            <div className="empty-icon">📄</div>
            <p>暂无日志记录</p>
            <small>执行命令后日志将在此显示</small>
          </div>
        ) : (
          <div className="log-entries">
            {logLines.slice(-50).map((line, index) => {
              const isError = line.includes('ERROR') || line.includes('错误') || line.includes('失败')
              const isSuccess = line.includes('SUCCESS') || line.includes('成功') || line.includes('完成')
              const isInfo = line.includes('INFO') || line.includes('信息')
              
              return (
                <div 
                  key={index} 
                  className={`log-entry ${isError ? 'error' : isSuccess ? 'success' : isInfo ? 'info' : 'default'}`}
                >
                  <span className="log-time">
                    {new Date().toLocaleTimeString()}
                  </span>
                  <span className="log-message">{line}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      
      {logLines.length > 50 && (
        <div className="log-footer">
          <small>显示最近 50 条记录，共 {logLines.length} 条</small>
        </div>
      )}
    </div>
  )
}