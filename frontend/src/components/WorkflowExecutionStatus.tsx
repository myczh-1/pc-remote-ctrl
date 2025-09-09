import { ExecutionHeader } from './ExecutionHeader'
import { StepResultCard } from './StepResultCard'
import type { CommandSetExecution } from '../types'

interface WorkflowExecutionStatusProps {
  execution: CommandSetExecution
  onStop?: () => void
  onClear?: () => void
}

export function WorkflowExecutionStatus({ execution, onStop, onClear }: WorkflowExecutionStatusProps) {
  const formatDuration = (startTime?: Date, endTime?: Date) => {
    if (!startTime) return ''
    
    const end = endTime || new Date()
    const duration = Math.floor((end.getTime() - startTime.getTime()) / 1000)
    
    if (duration < 60) return `${duration}s`
    
    const minutes = Math.floor(duration / 60)
    const seconds = duration % 60
    return `${minutes}m ${seconds}s`
  }

  const totalSteps = execution.stepResults.length + (execution.status === 'running' ? 1 : 0)
  const duration = formatDuration(execution.startTime, execution.endTime)

  return (
    <div style={{ 
      border: '1px solid #ddd', 
      borderRadius: '8px', 
      padding: '16px',
      backgroundColor: '#f8f9fa'
    }}>
      <ExecutionHeader
        commandSetName={execution.commandSetName}
        status={execution.status}
        currentStep={execution.currentStep}
        totalSteps={totalSteps}
        duration={duration}
        onStop={onStop}
        onClear={onClear}
      />

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

      {execution.stepResults.length > 0 && (
        <div>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#6c757d' }}>
            执行结果:
          </h5>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {execution.stepResults.map((result, index) => (
              <StepResultCard 
                key={index} 
                step={result} 
                index={index} 
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}