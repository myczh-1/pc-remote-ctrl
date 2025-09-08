import { useState, useCallback } from 'react'
import type { LogLevel, LogEntry } from '../types'

export function useLogger() {
  const [log, setLog] = useState('')
  const [entries, setEntries] = useState<LogEntry[]>([])

  const addLog = useCallback((message: string, level: LogLevel = 'info') => {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date()
    }
    
    setEntries(prev => [...prev, entry])
    setLog(prev => prev + message + '\n')
  }, [])

  const clearLog = useCallback(() => {
    setLog('')
    setEntries([])
  }, [])

  const logSuccess = useCallback((message: string) => addLog(message, 'success'), [addLog])
  const logError = useCallback((message: string) => addLog(message, 'error'), [addLog])
  const logInfo = useCallback((message: string) => addLog(message, 'info'), [addLog])

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