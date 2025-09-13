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
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
        命令脚本 *
      </label>

      {scripts.map((script, index) => (
        <div key={index} className="flex items-start gap-2 mb-3">
          <div className="flex-1">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 font-mono">
              步骤 {index + 1}
            </div>
            <textarea
              value={script}
              onChange={(e) => updateScript(index, e.target.value)}
              placeholder={`输入第 ${index + 1} 个命令脚本（如：npm install）`}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 dark:border-white/10 rounded-md
                         bg-white dark:bg-surface-soft text-slate-900 dark:text-slate-100
                         placeholder-slate-400 dark:placeholder-slate-500
                         font-mono text-sm leading-relaxed resize-y
                         focus:ring-2 focus:ring-prime-500 focus:border-prime-500
                         dark:focus:ring-prime-400 dark:focus:border-prime-400
                         transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={() => removeScript(index)}
            disabled={scripts.length === 1}
            className={`mt-6 px-3 py-2 text-xs rounded-md font-medium transition-colors ${
              scripts.length === 1
                ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                : 'bg-red-500 hover:bg-red-600 text-white hover:shadow-md'
            }`}
            title="删除脚本"
          >
            删除
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addScript}
        className="px-4 py-2 text-sm border border-prime-500 text-prime-600 dark:text-prime-400
                   bg-transparent hover:bg-prime-50 dark:hover:bg-prime-500/10
                   rounded-md transition-colors font-medium"
      >
        + 添加脚本
      </button>
    </div>
  )
}
