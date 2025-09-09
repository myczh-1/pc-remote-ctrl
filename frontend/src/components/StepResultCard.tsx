import type { StepExecutionResult } from '../types'

interface StepResultCardProps {
  step: StepExecutionResult
  index: number
}

export function StepResultCard({ step, index }: StepResultCardProps) {
  const getStepStatusColor = (success: boolean) => {
    return success ? '#28a745' : '#dc3545'
  }

  const getStepStatusIcon = (success: boolean) => {
    return success ? '✅' : '❌'
  }

  return (
    <div style={{ 
      border: '1px solid #e9ecef',
      borderRadius: '6px', 
      padding: '12px',
      marginBottom: '8px',
      backgroundColor: step.success ? '#f8fff8' : '#fff8f8'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        marginBottom: '8px',
        fontSize: '14px',
        fontWeight: 'bold'
      }}>
        <span style={{ color: getStepStatusColor(step.success) }}>
          {getStepStatusIcon(step.success)} 步骤 {index + 1}
        </span>
        <span style={{ marginLeft: '8px', color: '#6c757d', fontSize: '12px' }}>
          退出码: {step.exitCode}
        </span>
      </div>

      <div style={{ marginBottom: '8px' }}>
        <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '4px' }}>
          脚本:
        </div>
        <div style={{ 
          backgroundColor: '#f1f3f4',
          border: '1px solid #e9ecef',
          borderRadius: '4px',
          padding: '8px',
          fontSize: '13px',
          fontFamily: 'monospace'
        }}>
          {step.stepScript}
        </div>
      </div>

      {step.output && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '4px' }}>
            输出:
          </div>
          <pre style={{ 
            backgroundColor: '#f8f9fa',
            border: '1px solid #e9ecef',
            borderRadius: '4px',
            padding: '8px',
            margin: 0,
            fontSize: '12px',
            whiteSpace: 'pre-wrap',
            maxHeight: '120px',
            overflowY: 'auto'
          }}>
            {step.output}
          </pre>
        </div>
      )}

      {step.error && (
        <div>
          <div style={{ fontSize: '12px', color: '#dc3545', marginBottom: '4px' }}>
            错误:
          </div>
          <pre style={{ 
            backgroundColor: '#fff5f5',
            border: '1px solid #f5c6cb',
            borderRadius: '4px',
            padding: '8px',
            margin: 0,
            fontSize: '12px',
            color: '#721c24',
            whiteSpace: 'pre-wrap',
            maxHeight: '120px',
            overflowY: 'auto'
          }}>
            {step.error}
          </pre>
        </div>
      )}
    </div>
  )
}