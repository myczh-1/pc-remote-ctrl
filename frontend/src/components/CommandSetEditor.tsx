import { useState, useEffect } from 'react'
import { ScriptEditor } from './ScriptEditor'
import type { CommandSet } from '../types'

interface CommandSetEditorProps {
  commandSet?: CommandSet
  availableCommands: CommandSet[]
  onSave: (commandSet: Omit<CommandSet, 'commandId' | 'created'>) => void
  onCancel: () => void
}

export function CommandSetEditor({ commandSet, onSave, onCancel }: CommandSetEditorProps) {
  const [name, setName] = useState(commandSet?.commandName || '')
  const [description, setDescription] = useState(commandSet?.description || '')
  const [scripts, setScripts] = useState<string[]>(commandSet?.commandScripts || [''])

  useEffect(() => {
    if (commandSet) {
      setName(commandSet.commandName)
      setDescription(commandSet.description || '')
      setScripts(commandSet.commandScripts)
    }
  }, [commandSet])


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
          {commandSet ? '编辑命令集' : '创建命令集'}
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

        <ScriptEditor 
          scripts={scripts}
          onScriptsChange={setScripts}
        />

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