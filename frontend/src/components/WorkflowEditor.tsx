import { useState, useEffect } from 'react'
import type { CommandSet } from '../types'

interface WorkflowEditorProps {
  workflow?: CommandSet
  availableCommands: CommandSet[]
  onSave: (commandSet: Omit<CommandSet, 'commandId' | 'created'>) => void
  onCancel: () => void
}

export function WorkflowEditor({ workflow, onSave, onCancel }: WorkflowEditorProps) {
  const [name, setName] = useState(workflow?.commandName || '')
  const [description, setDescription] = useState(workflow?.description || '')
  const [scripts, setScripts] = useState<string[]>(workflow?.commandScripts || [''])

  useEffect(() => {
    if (workflow) {
      setName(workflow.commandName)
      setDescription(workflow.description || '')
      setScripts(workflow.commandScripts)
    }
  }, [workflow])

  const addScript = () => {
    setScripts([...scripts, ''])
  }

  const updateScript = (index: number, value: string) => {
    const newScripts = [...scripts]
    newScripts[index] = value
    setScripts(newScripts)
  }

  const removeScript = (index: number) => {
    setScripts(scripts.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    if (!name.trim() || scripts.some(script => !script.trim())) {
      alert('请填写完整信息')
      return
    }

    const filteredScripts = scripts.filter(script => script.trim())
    
    onSave({
      commandName: name.trim(),
      commandScripts: filteredScripts,
      description: description.trim() || undefined
    })
  }

  const canSave = name.trim() && scripts.some(script => script.trim())

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '24px',
        minWidth: '500px',
        maxWidth: '80vw',
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        <h2 style={{ margin: '0 0 20px 0' }}>
          {workflow ? '编辑命令集' : '创建命令集'}
        </h2>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
            命令集名称 *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入命令集名称"
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
            描述
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="输入命令集描述"
            rows={3}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              resize: 'vertical'
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontWeight: 'bold' }}>
              执行脚本 *
            </label>
            <button
              onClick={addScript}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              + 添加脚本
            </button>
          </div>

          {scripts.map((script, index) => (
            <div key={index} style={{ display: 'flex', marginBottom: '8px', alignItems: 'flex-start' }}>
              <span style={{ 
                minWidth: '20px', 
                fontSize: '12px', 
                color: '#666', 
                marginTop: '8px',
                marginRight: '8px'
              }}>
                {index + 1}.
              </span>
              <textarea
                value={script}
                onChange={(e) => updateScript(index, e.target.value)}
                placeholder="输入要执行的命令脚本"
                rows={2}
                style={{
                  flex: 1,
                  padding: '6px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  resize: 'vertical'
                }}
              />
              {scripts.length > 1 && (
                <button
                  onClick={() => removeScript(index)}
                  style={{
                    marginLeft: '8px',
                    padding: '6px 8px',
                    fontSize: '12px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    minWidth: '50px'
                  }}
                >
                  删除
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{
          display: 'flex',
          gap: '8px',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              border: '1px solid #ccc',
              backgroundColor: 'white',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              padding: '8px 16px',
              border: 'none',
              backgroundColor: canSave ? '#007bff' : '#ccc',
              color: 'white',
              borderRadius: '4px',
              cursor: canSave ? 'pointer' : 'not-allowed'
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}