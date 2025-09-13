import { useState, useCallback } from 'react'
import type { LogLevel, LogEntry } from '../types'

export function useLogger() {
  const [log, setLog] = useState('')
  const [entries, setEntries] = useState<LogEntry[]>([])

  const addLog = useCallback((message: string, level: LogLevel = 'info', executionData?: LogEntry['executionData']) => {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      executionData
    }
    
    setEntries(prev => [...prev, entry])
    setLog(prev => prev + message + '\n')
  }, [])

  const clearLog = useCallback(() => {
    setLog('')
    setEntries([])
  }, [])

  const logSuccess = useCallback((message: string, level: LogLevel = 'success', executionData?: LogEntry['executionData']) => 
    addLog(message, level, executionData), [addLog])
  const logError = useCallback((message: string, level: LogLevel = 'error', executionData?: LogEntry['executionData']) => 
    addLog(message, level, executionData), [addLog])
  const logInfo = useCallback((message: string, level: LogLevel = 'info', executionData?: LogEntry['executionData']) => 
    addLog(message, level, executionData), [addLog])

  return {
    log,
    entries,
    addLog,
    clearLog,
    logSuccess,
    logError,
    logInfo,
  }
}