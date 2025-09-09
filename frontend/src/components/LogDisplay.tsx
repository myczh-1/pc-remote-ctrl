interface LogDisplayProps {
  log: string
  onClear?: () => void
}

export function LogDisplay({ log, onClear }: LogDisplayProps) {
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
      <pre style={{ 
        whiteSpace: 'pre-wrap', 
        maxHeight: '300px', 
        overflow: 'auto',
        fontSize: '0.9rem'
      }}>
        {log || 'No logs yet...'}
      </pre>
    </div>
  )
}