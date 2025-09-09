interface ExecutionHeaderProps {
  commandSetName: string
  status: string
  currentStep: number
  totalSteps: number
  duration: string
  onStop?: () => void
  onClear?: () => void
}

export function ExecutionHeader({
  commandSetName,
  status,
  currentStep,
  totalSteps,
  duration,
  onStop,
  onClear
}: ExecutionHeaderProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return '#007bff'
      case 'completed': return '#28a745'  
      case 'failed': return '#dc3545'
      case 'stopped': return '#ffc107'
      default: return '#6c757d'
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
    <div style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      marginBottom: '16px',
      padding: '12px',
      backgroundColor: 'white',
      border: '1px solid #dee2e6',
      borderRadius: '6px'
    }}>
      <div>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>
          {commandSetName}
        </h3>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '16px',
          fontSize: '14px'
        }}>
          <span style={{ 
            color: getStatusColor(status),
            fontWeight: 'bold'
          }}>
            {getStatusText(status)}
          </span>
          <span style={{ color: '#6c757d' }}>
            步骤: {currentStep}/{totalSteps}
          </span>
          {duration && (
            <span style={{ color: '#6c757d' }}>
              耗时: {duration}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        {status === 'running' && onStop && (
          <button
            onClick={onStop}
            style={{
              padding: '6px 12px',
              backgroundColor: '#ffc107',
              color: '#212529',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            停止
          </button>
        )}
        
        {(status === 'completed' || status === 'failed' || status === 'stopped') && onClear && (
          <button
            onClick={onClear}
            style={{
              padding: '6px 12px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            清除
          </button>
        )}
      </div>
    </div>
  )
}