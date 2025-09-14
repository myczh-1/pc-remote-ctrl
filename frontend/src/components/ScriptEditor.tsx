import { Editor } from '@monaco-editor/react'

interface ScriptEditorProps {
  scripts: string[]
  onScriptsChange: (scripts: string[]) => void
  isDarkMode?: boolean
}

export function ScriptEditor({ scripts, onScriptsChange, isDarkMode = false }: ScriptEditorProps) {
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
            <div className="border border-slate-300 dark:border-white/10 rounded-md overflow-hidden
                           focus-within:ring-2 focus-within:ring-prime-500 focus-within:border-prime-500
                           dark:focus-within:ring-prime-400 dark:focus-within:border-prime-400">
              <Editor
                height="80px"
                language="shell"
                value={script}
                onChange={(value) => updateScript(index, value || '')}
                theme={isDarkMode ? 'vs-dark' : 'vs'}
                options={{
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  lineNumbers: 'off',
                  glyphMargin: false,
                  folding: false,
                  lineDecorationsWidth: 0,
                  lineNumbersMinChars: 0,
                  renderLineHighlight: 'none',
                  scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
                  fontSize: 13,
                  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                  placeholder: `输入第 ${index + 1} 个命令脚本（如：npm install）`
                }}
              />
            </div>
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
