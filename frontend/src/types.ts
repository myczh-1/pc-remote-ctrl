// Type definitions for the application

export interface CommandSet {
  commandId: string
  commandName: string
  commandScripts: string[]
  description?: string
  isComposite?: boolean
  sourceCommandIds?: string[]
  created: Date
}

export interface ExecutionResult {
  output: string
  error: string
  exitCode: number
  success: boolean
}

export interface StepExecutionResult extends ExecutionResult {
  stepIndex: number
  stepScript: string
}

export interface CommandSetExecution {
  commandSetId: string
  commandSetName: string
  currentStep: number
  status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped'
  stepResults: StepExecutionResult[]
  startTime?: Date
  endTime?: Date
  error?: string
}

export interface AppState {
  commandSets: CommandSet[]
  log: string
  loading: boolean
}

export type LogLevel = 'info' | 'error' | 'success'

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: Date
}