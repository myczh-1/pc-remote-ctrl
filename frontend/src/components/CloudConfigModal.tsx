import { useState, useEffect } from 'react'

interface CloudConfigModalProps {
  isVisible: boolean
  onSave: (config: { baseUrl: string }) => void
  onCancel: () => void
  currentConfig?: { baseUrl: string }
}

export function CloudConfigModal({ isVisible, onSave, onCancel, currentConfig }: CloudConfigModalProps) {
  const [baseUrl, setBaseUrl] = useState(currentConfig?.baseUrl || 'http://localhost:7073')
  const [error, setError] = useState('')

  useEffect(() => {
    if (currentConfig) {
      setBaseUrl(currentConfig.baseUrl)
    }
  }, [currentConfig])

  const validateUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }

  const handleSave = () => {
    if (!baseUrl.trim()) {
      setError('请输入云端服务器地址')
      return
    }

    if (!validateUrl(baseUrl)) {
      setError('请输入有效的URL地址（如: http://192.168.1.100:7073）')
      return
    }

    onSave({ baseUrl: baseUrl.trim() })
    setError('')
  }

  const handleCancel = () => {
    setError('')
    setBaseUrl(currentConfig?.baseUrl || 'http://localhost:7073')
    onCancel()
  }

  if (!isVisible) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
      <div className="bg-white dark:bg-surface border border-black/10 dark:border-white/10 rounded-lg p-6 min-w-[400px] max-w-[90vw] shadow-xl">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-5">
          云端服务器配置
        </h2>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            服务器地址 *
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value)
              setError('')
            }}
            placeholder="http://192.168.1.100:7073"
            className="w-full px-3 py-2 border border-slate-300 dark:border-white/10 rounded-md bg-white dark:bg-surface-soft text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:ring-2 focus:ring-prime-500 focus:border-prime-500 dark:focus:ring-prime-400 dark:focus:border-prime-400"
          />
          {error && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="mb-6">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            <p className="mb-2">配置说明：</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>输入云端中间件服务器的完整地址</li>
              <li>默认端口为 7073，请根据实际部署调整</li>
              <li>支持 HTTP 和 HTTPS 协议</li>
              <li>示例：http://192.168.1.100:7073</li>
            </ul>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={handleCancel}
            className="px-4 py-2 border border-slate-300 dark:border-white/20 bg-white dark:bg-surface-soft text-slate-700 dark:text-slate-300 rounded-md text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-md text-sm text-white bg-prime-500 hover:bg-prime-600 dark:bg-prime-600 dark:hover:bg-prime-700 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}