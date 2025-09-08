// src/components/LogDisplay.tsx
import { useEffect, useRef } from 'react'

interface LogDisplayProps {
  log: string
  onClear?: () => void
}

export function LogDisplay({ log, onClear }: LogDisplayProps) {
  const preRef = useRef<HTMLPreElement | null>(null)

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [log])

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Log</h3>
        {onClear && (
          <button onClick={onClear} style={{ fontSize: '0.8rem' }}>
            Clear
          </button>
        )}
      </div>
      <pre
        ref={preRef}
        style={{
          whiteSpace: 'pre-wrap',
          maxHeight: '300px',
          overflow: 'auto',
          fontSize: '0.9rem',
        }}
      >
        {log || 'No logs yet...'}
      </pre>
    </div>
  )
}
