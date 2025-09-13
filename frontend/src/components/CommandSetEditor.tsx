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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
      <div className="bg-white dark:bg-surface border border-black/10 dark:border-white/10 rounded-lg p-6 min-w-[500px] max-w-[80vw] max-h-[80vh] overflow-y-auto shadow-xl">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-5">
          {commandSet ? '编辑命令集' : '创建命令集'}
        </h2>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
            命令集名称 *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入命令集名称"
            className="w-full px-3 py-2 border border-slate-300 dark:border-white/10 rounded-md bg-white dark:bg-surface-soft text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:ring-2 focus:ring-prime-500 focus:border-prime-500 dark:focus:ring-prime-400 dark:focus:border-prime-400"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
            描述
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="输入命令集描述"
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 dark:border-white/10 rounded-md bg-white dark:bg-surface-soft text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm resize-y focus:ring-2 focus:ring-prime-500 focus:border-prime-500 dark:focus:ring-prime-400 dark:focus:border-prime-400"
          />
        </div>

        <ScriptEditor 
          scripts={scripts}
          onScriptsChange={setScripts}
        />

        <div className="flex gap-2 justify-end mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-slate-300 dark:border-white/20 bg-white dark:bg-surface-soft text-slate-700 dark:text-slate-300 rounded-md text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`px-4 py-2 rounded-md text-sm text-white transition-colors ${
              canSave 
                ? 'bg-prime-500 hover:bg-prime-600 dark:bg-prime-600 dark:hover:bg-prime-700' 
                : 'bg-slate-400 dark:bg-slate-600 cursor-not-allowed'
            }`}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}