import type { CommandSetExecution } from '../types'

interface WorkflowExecutionStatusProps {
  execution: CommandSetExecution
  onStop?: () => void
  onClear?: () => void
}

export function WorkflowExecutionStatus({ execution, onStop, onClear }: WorkflowExecutionStatusProps) {
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

  const formatDuration = (startTime?: Date, endTime?: Date) => {
    if (!startTime) return ''
    
    const end = endTime || new Date()
    const duration = Math.floor((end.getTime() - startTime.getTime()) / 1000)
    
    if (duration < 60) return `${duration}s`
    
    const minutes = Math.floor(duration / 60)
    const seconds = duration % 60
    return `${minutes}m ${seconds}s`
  }

  return (
    <div style={{ 
      border: '1px solid #ddd', 
      borderRadius: '8px', 
      padding: '16px',
      backgroundColor: '#f8f9fa'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        marginBottom: '12px' 
      }}>
        <div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>
            {execution.commandSetName}
          </h4>
          <div style={{ 
            fontSize: '14px', 
            color: getStatusColor(execution.status),
            fontWeight: 'bold'
          }}>
            {getStatusText(execution.status)}
            {execution.startTime && (
              <span style={{ color: '#6c757d', fontWeight: 'normal', marginLeft: '8px' }}>
                · {formatDuration(execution.startTime, execution.endTime)}
              </span>
            )}
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          {execution.status === 'running' && onStop && (
            <button
              onClick={onStop}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              停止
            </button>
          )}
          
          {(execution.status === 'completed' || execution.status === 'failed' || execution.status === 'stopped') && onClear && (
            <button
              onClick={onClear}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              清除
            </button>
          )}
        </div>
      </div>

      {/* 进度条 */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '4px' 
        }}>
          <span style={{ fontSize: '14px', color: '#6c757d' }}>
            进度: {execution.currentStep} / {execution.stepResults.length + (execution.status === 'running' ? 1 : 0)}
          </span>
          <span style={{ fontSize: '14px', color: '#6c757d' }}>
            {execution.stepResults.length > 0 && (
              `成功: ${execution.stepResults.filter((r: any) => r.success).length} | 失败: ${execution.stepResults.filter((r: any) => !r.success).length}`
            )}
          </span>
        </div>
        
        <div style={{
          width: '100%',
          height: '6px',
          backgroundColor: '#e9ecef',
          borderRadius: '3px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${execution.stepResults.length > 0 ? (execution.currentStep / execution.stepResults.length) * 100 : 0}%`,
            height: '100%',
            backgroundColor: getStatusColor(execution.status),
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>

      {/* 错误信息 */}
      {execution.error && (
        <div style={{
          backgroundColor: '#f8d7da',
          border: '1px solid #f5c6cb',
          color: '#721c24',
          padding: '8px',
          borderRadius: '4px',
          marginBottom: '12px',
          fontSize: '14px'
        }}>
          <strong>错误:</strong> {execution.error}
        </div>
      )}

      {/* 执行结果列表 */}
      {execution.stepResults.length > 0 && (
        <div>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#6c757d' }}>
            执行结果:
          </h5>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {execution.stepResults.map((result: any, index: any) => (
              <div key={index} style={{
                border: '1px solid #ddd',
                borderRadius: '4px',
                padding: '8px',
                marginBottom: '4px',
                fontSize: '12px',
                backgroundColor: result.success ? '#d4edda' : '#f8d7da'
              }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  marginBottom: '4px'
                }}>
                  <span style={{ fontWeight: 'bold' }}>
                    步骤 {index + 1}
                  </span>
                  <span style={{ 
                    color: result.success ? '#155724' : '#721c24',
                    fontWeight: 'bold'
                  }}>
                    {result.success ? '成功' : '失败'} (退出码: {result.exitCode})
                  </span>
                </div>
                
                {result.output && (
                  <div style={{ marginBottom: '4px' }}>
                    <strong>输出:</strong>
                    <pre style={{ 
                      margin: '2px 0 0 0', 
                      fontSize: '11px', 
                      whiteSpace: 'pre-wrap',
                      maxHeight: '60px',
                      overflow: 'auto'
                    }}>
                      {result.output}
                    </pre>
                  </div>
                )}
                
                {result.error && (
                  <div>
                    <strong style={{ color: '#721c24' }}>错误:</strong>
                    <pre style={{ 
                      margin: '2px 0 0 0', 
                      fontSize: '11px', 
                      color: '#721c24',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '60px',
                      overflow: 'auto'
                    }}>
                      {result.error}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}