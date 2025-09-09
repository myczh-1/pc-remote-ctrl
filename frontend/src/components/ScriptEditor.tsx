interface ScriptEditorProps {
  scripts: string[]
  onScriptsChange: (scripts: string[]) => void
}

export function ScriptEditor({ scripts, onScriptsChange }: ScriptEditorProps) {
  const addScript = () => {
    onScriptsChange([...scripts, ''])
  }

  const updateScript = (index: number, value: string) => {
    const newScripts = [...scripts]
    newScripts[index] = value
    onScriptsChange(newScripts)
  }

  const removeScript = (index: number) => {
    onScriptsChange(scripts.filter((_, i) => i !== index))
  }

  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
        命令脚本 *
      </label>
      
      {scripts.map((script, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <textarea
            value={script}
            onChange={(e) => updateScript(index, e.target.value)}
            placeholder={`输入第 ${index + 1} 个命令脚本`}
            rows={3}
            style={{
              flex: 1,
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'monospace',
              resize: 'vertical'
            }}
          />
          <button
            type="button"
            onClick={() => removeScript(index)}
            disabled={scripts.length === 1}
            style={{
              marginLeft: '8px',
              padding: '8px',
              border: 'none',
              backgroundColor: scripts.length === 1 ? '#ccc' : '#dc3545',
              color: 'white',
              borderRadius: '4px',
              cursor: scripts.length === 1 ? 'not-allowed' : 'pointer',
              fontSize: '12px'
            }}
            title="删除脚本"
          >
            🗑️
          </button>
        </div>
      ))}
      
      <button
        type="button"
        onClick={addScript}
        style={{
          padding: '6px 12px',
          border: '1px solid #007bff',
          backgroundColor: 'transparent',
          color: '#007bff',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px'
        }}
      >
        ➕ 添加脚本
      </button>
    </div>
  )
}