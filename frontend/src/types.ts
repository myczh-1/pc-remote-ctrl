// Type definitions for the application

export interface Command {
  commandId: string
  commandName: string
  commandScript: string
  description?: string
}

export interface ExecutionResult {
  output: string
  error: string
  exitCode: number
  success: boolean
}

export interface AppState {
  commands: Command[]
  log: string
  loading: boolean
}

export type LogLevel = 'info' | 'error' | 'success'

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: Date
}