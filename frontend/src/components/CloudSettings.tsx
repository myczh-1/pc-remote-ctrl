import { useEffect, useState } from 'react'

interface CloudSettingsProps {
  open: boolean
  onClose?: () => void
  onSaved?: (cfg: { baseUrl: string; agentId: string }) => void
}

export function CloudSettings({ open, onClose, onSaved }: CloudSettingsProps) {
  const [baseUrl, setBaseUrl] = useState<string>('')
  const [agentId, setAgentId] = useState<string>('')

  useEffect(() => {
    if (!open) return
    try {
      setBaseUrl(localStorage.getItem('cloud.baseUrl') || '/cloud')
      setAgentId(localStorage.getItem('cloud.agentId') || '')
    } catch {}
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[520px] max-w-[92vw] rounded-2xl bg-white dark:bg-surface p-4 border border-black/10 dark:border-white/10 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">云端设置</div>
          <button className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5" onClick={onClose}>✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500">Cloud Endpoint（grpc-web 地址）</label>
            <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" placeholder="/cloud 或 https://your-domain" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
            <div className="text-xs text-slate-400 mt-1">开发环境可直接填 /cloud（Vite 代理到 7073）</div>
          </div>
          <div>
            <label className="text-xs text-slate-500">Agent Device ID（路由标识）</label>
            <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" placeholder="例如：dev1" value={agentId} onChange={e => setAgentId(e.target.value)} />
            <div className="text-xs text-slate-400 mt-1">需与设备在云端注册时使用的 device_id 一致</div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5" onClick={onClose}>取消</button>
          <button className="px-3 py-2 rounded-xl bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700" onClick={() => {
            try {
              localStorage.setItem('cloud.baseUrl', baseUrl || '/cloud')
              localStorage.setItem('cloud.agentId', agentId || '')
            } catch {}
            onSaved?.({ baseUrl: baseUrl || '/cloud', agentId: agentId || '' })
            onClose?.()
          }}>保存</button>
        </div>
      </div>
    </div>
  )
}

