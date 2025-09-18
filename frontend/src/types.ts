// Type definitions for the smart home application

export type LogLevel = 'info' | 'error' | 'success' | 'execution_start' | 'execution_complete' | 'execution_error'

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: Date
  // Execution metadata for device actions
  executionData?: {
    commandSetName?: string  // action name
    deviceId?: string
    success?: boolean
    duration?: string
    error?: string
  }
}

// Re-export protobuf types for convenience
export type { Device, DeviceEvent } from './proto/home/service'