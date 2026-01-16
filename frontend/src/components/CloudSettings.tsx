import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import type { CloudConfig } from '../proto/home/service'

interface CloudSettingsProps {
  open: boolean
  onClose?: () => void
  onSaved?: (cfg: { baseUrl: string; agentId: string }) => void
  cloudConfigApi?: {
    listCloudConfigs: () => Promise<{ configs: CloudConfig[] }>
    upsertCloudConfig: (params: { config: CloudConfig }) => Promise<{ ok: boolean; message?: string; configId?: string }>
    deleteCloudConfig: (params: { configId: string }) => Promise<{ ok: boolean; message?: string }>
    applyCloudConfig: (params: { configId: string }) => Promise<{ ok: boolean; message?: string }>
  }
}

export function CloudSettings({ open, onClose, onSaved, cloudConfigApi }: CloudSettingsProps) {
  const [baseUrl, setBaseUrl] = useState<string>('')
  const [agentId, setAgentId] = useState<string>('')
  const [configs, setConfigs] = useState<CloudConfig[]>([])
  const [formId, setFormId] = useState<string>('')
  const [name, setName] = useState<string>('')
  const [cloudAddr, setCloudAddr] = useState<string>('')
  const [agentDeviceId, setAgentDeviceId] = useState<string>('')
  const [agentSecret, setAgentSecret] = useState<string>('')
  const [timeoutMs, setTimeoutMs] = useState<string>('8000')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string>('')

  useEffect(() => {
    if (!open) return
    try {
      setBaseUrl(localStorage.getItem('cloud.baseUrl') || '/cloud')
      setAgentId(localStorage.getItem('cloud.agentId') || '')
    } catch {}
    refreshConfigs()
  }, [open])

  const activeConfig = useMemo(() => configs.find(c => c.active), [configs])

  const refreshConfigs = async () => {
    if (!cloudConfigApi) return
    setLoading(true)
    setMessage('')
    try {
      const res = await cloudConfigApi.listCloudConfigs()
      setConfigs(res.configs ?? [])
    } catch (err: any) {
      setMessage(String(err?.message ?? err))
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormId('')
    setName('')
    setCloudAddr('')
    setAgentDeviceId('')
    setAgentSecret('')
    setTimeoutMs('8000')
    setMessage('')
  }

  const selectConfig = (cfg: CloudConfig) => {
    setFormId(cfg.id)
    setName(cfg.name ?? '')
    setCloudAddr(cfg.cloudAddr ?? '')
    setAgentDeviceId(cfg.agentDeviceId ?? '')
    setAgentSecret(cfg.agentSecret ?? '')
    setTimeoutMs(cfg.agentTunnelUnaryTimeoutMs ? String(cfg.agentTunnelUnaryTimeoutMs) : '8000')
    setMessage('')
  }

  const saveCloudConfig = async () => {
    if (!cloudConfigApi) return
    setLoading(true)
    setMessage('')
    const ms = Number(timeoutMs)
    const config: CloudConfig = {
      id: formId || '',
      name: name.trim(),
      cloudAddr: cloudAddr.trim(),
      agentDeviceId: agentDeviceId.trim(),
      agentSecret: agentSecret.trim(),
      agentTunnelUnaryTimeoutMs: Number.isFinite(ms) && ms > 0 ? ms : 8000,
      active: false,
      updatedAt: '',
    }
    try {
      const res = await cloudConfigApi.upsertCloudConfig({ config })
      if (!res.ok) {
        setMessage(res.message || '保存失败')
        return
      }
      if (res.configId) {
        setFormId(res.configId)
      }
      await refreshConfigs()
      setMessage('已保存')
    } catch (err: any) {
      setMessage(String(err?.message ?? err))
    } finally {
      setLoading(false)
    }
  }

  const applyCloudConfig = async (id: string) => {
    if (!cloudConfigApi) return
    setLoading(true)
    setMessage('')
    try {
      const res = await cloudConfigApi.applyCloudConfig({ configId: id })
      if (!res.ok) {
        setMessage(res.message || '应用失败')
        return
      }
      await refreshConfigs()
      setMessage(id ? '已应用配置' : '已停用云端')
    } catch (err: any) {
      setMessage(String(err?.message ?? err))
    } finally {
      setLoading(false)
    }
  }

  const deleteCloudConfig = async (id: string) => {
    if (!cloudConfigApi) return
    if (typeof window !== 'undefined') {
      const ok = window.confirm('确认删除这条云端配置？')
      if (!ok) return
    }
    setLoading(true)
    setMessage('')
    try {
      const res = await cloudConfigApi.deleteCloudConfig({ configId: id })
      if (!res.ok) {
        setMessage(res.message || '删除失败')
        return
      }
      if (formId === id) {
        resetForm()
      }
      await refreshConfigs()
      setMessage('已删除')
    } catch (err: any) {
      setMessage(String(err?.message ?? err))
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose?.()
      }}
    >
      <DialogContent className="w-[640px] max-w-[92vw] rounded-2xl bg-white/80 p-4 dark:bg-surface/80">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">云端设置</div>
          <Button variant="ghost" className="rounded-lg p-2" onClick={onClose}>✕</Button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-sm font-semibold">前端云端访问</div>
            <div className="text-xs text-slate-500 mt-1">切换到云端模式时使用</div>
          </div>
          <div>
            <label className="text-xs text-slate-500">Cloud Endpoint（grpc-web 地址）</label>
            <Input placeholder="/cloud 或 https://your-domain" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
            <div className="text-xs text-slate-400 mt-1">开发环境可直接填 /cloud（Vite 代理到 7073）</div>
          </div>
          <div>
            <label className="text-xs text-slate-500">Agent Device ID（路由标识）</label>
            <Input placeholder="例如：dev1" value={agentId} onChange={e => setAgentId(e.target.value)} />
            <div className="text-xs text-slate-400 mt-1">需与设备在云端注册时使用的 device_id 一致</div>
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" className="px-3 py-2 rounded-lg" onClick={onClose}>取消</Button>
          <Button className="px-3 py-2 rounded-xl bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700" onClick={() => {
            try {
              localStorage.setItem('cloud.baseUrl', baseUrl || '/cloud')
              localStorage.setItem('cloud.agentId', agentId || '')
            } catch {}
            onSaved?.({ baseUrl: baseUrl || '/cloud', agentId: agentId || '' })
            onClose?.()
          }}>保存前端配置</Button>
        </div>

        <div className="mt-4 border-t border-black/5 pt-4 dark:border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">本地网关云端配置</div>
              <div className="text-xs text-slate-500 mt-1">保存多条配置，选择后应用（会触发重连）</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" className="px-3 py-2 rounded-lg" onClick={resetForm}>新建</Button>
              <Button variant="outline" className="px-3 py-2 rounded-lg" disabled={loading} onClick={() => refreshConfigs()}>刷新</Button>
            </div>
          </div>

          <div className="mt-3 grid gap-2">
            {configs.map(cfg => (
              <div key={cfg.id} className="rounded-xl border border-black/10 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium truncate">{cfg.name || '未命名'}</div>
                      {cfg.active ? <span className="text-[10px] rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-300">当前</span> : null}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{cfg.cloudAddr || '-'} · {cfg.agentDeviceId || '-'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" className="px-2 py-1 rounded-lg" onClick={() => selectConfig(cfg)}>编辑</Button>
                    <Button variant="outline" className="px-2 py-1 rounded-lg" disabled={loading || cfg.active} onClick={() => applyCloudConfig(cfg.id)}>应用</Button>
                    <Button variant="destructive" className="px-2 py-1 rounded-lg" disabled={loading} onClick={() => deleteCloudConfig(cfg.id)}>删除</Button>
                  </div>
                </div>
              </div>
            ))}
            {configs.length === 0 ? (
              <div className="text-xs text-slate-400">暂无配置</div>
            ) : null}
          </div>

          <div className="mt-3 grid gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-slate-500">配置名称</label>
                <Input placeholder="例如：公司云" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Cloud Addr（gRPC 地址）</label>
                <Input placeholder="例如：cloud.example.com:7073" value={cloudAddr} onChange={e => setCloudAddr(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Agent Device ID</label>
                <Input placeholder="例如：dev1" value={agentDeviceId} onChange={e => setAgentDeviceId(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Agent Secret</label>
                <Input type="password" placeholder="可选" value={agentSecret} onChange={e => setAgentSecret(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Tunnel Unary Timeout (ms)</label>
                <Input placeholder="8000" value={timeoutMs} onChange={e => setTimeoutMs(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500">{message || (activeConfig ? `当前配置: ${activeConfig.name || activeConfig.id}` : '未应用配置')}</div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" className="px-3 py-2 rounded-lg" disabled={loading || !cloudConfigApi} onClick={() => applyCloudConfig('')}>停用云端</Button>
                <Button className="px-3 py-2 rounded-xl bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700" disabled={loading || !cloudConfigApi} onClick={saveCloudConfig}>保存配置</Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
