import { WorkflowExecutionStatus } from './WorkflowExecutionStatus'
import type { CommandSetExecution } from '../types'

interface ExecutionStatusPanelProps {
  execution: CommandSetExecution | null
  onStop: () => void
  onClear: () => void
}

export function ExecutionStatusPanel({ execution, onStop, onClear }: ExecutionStatusPanelProps) {
  if (!execution) {
    return null
  }

  return (
    <div className="execution-status">
      <WorkflowExecutionStatus 
        execution={execution}
        onStop={onStop}
        onClear={onClear}
      />
    </div>
  )
}