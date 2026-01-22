import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { Device, DeviceModel } from '../proto/home/service'
import { AdapterKind, DeviceStatus } from '../proto/home/service'
import { useBleProvisioning } from '../hooks/useBleProvisioning'
import type { DeviceListParams } from '../hooks/useHomeApi'
import { Dialog, DialogContent } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { cn } from '../lib/utils'

interface DeviceApi {
  listDevices: (opts?: DeviceListParams) => Promise<{ ok: boolean; devices?: Device[]; count?: number; error?: string }>
  upsertDevice: (device: Device) => Promise<{ ok: boolean; message?: string; error?: string; deviceId?: string }>
  reserveDevice: (params: { modelId: string; modelVersion: string }) => Promise<{ ok: boolean; message?: string; error?: string; deviceId?: string }>
  deleteDevice: (deviceId: string) => Promise<{ ok: boolean; message?: string; error?: string }>
}

interface SaveResult { ok: boolean; error?: string }

interface DeviceCreateModalProps {
  open: boolean
  onCancel?: () => void
  onCreate?: (device: Device) => Promise<SaveResult> | SaveResult
  initialDevice?: Device
  api: DeviceApi
  models: DeviceModel[]
}

function parseDeviceIdFromMessage(msg?: string): string {
  if (!msg) return ''
  const m = msg.match(/^(?:created|updated):(.+)$/)
  return m ? m[1].trim() : ''
}

export function DeviceCreateModal({ open, onCancel, onCreate, initialDevice, api, models }: DeviceCreateModalProps) {
  const [id, setId] = useState(initialDevice?.id ?? '')
  const [name, setName] = useState(initialDevice?.name ?? '')
  const [type, setType] = useState(initialDevice?.type ?? '')
  const [room, setRoom] = useState(initialDevice?.room ?? '')
  const [tags, setTags] = useState((initialDevice?.tags ?? []).join(','))
  const [modelId, setModelId] = useState(initialDevice?.modelId ?? '')
  const [modelVersion, setModelVersion] = useState(initialDevice?.modelVersion ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  
  const [step, setStep] = useState<'info' | 'provision'>('info')
  const [bleState, setBleState] = useState<'idle' | 'running' | 'waiting' | 'success' | 'error'>('idle')
  
  const [ssid, setSsid] = useState('')
  const [wifiPass, setWifiPass] = useState('')
  const defaultMqttUrl = useMemo(() => ((import.meta as any).env?.VITE_MQTT_URL as string) || 'tcp://192.168.30.64:1883', [])
  const [mqttUrl, setMqttUrl] = useState<string>(defaultMqttUrl)
  const [mqttUser, setMqttUser] = useState('')
  const [mqttPass, setMqttPass] = useState('')
  
  const [bleLogs, setBleLogs] = useState<Array<{ t: number; msg: string; ok?: boolean }>>([])
  const { provision, disconnect } = useBleProvisioning()
  const [allocated, setAllocated] = useState(false)

  useEffect(() => {
    if (initialDevice) {
      setId(initialDevice.id ?? '')
      setName(initialDevice.name ?? '')
      setType(initialDevice.type ?? '')
      setRoom(initialDevice.room ?? '')
      setTags((initialDevice.tags ?? []).join(','))
      setModelId(initialDevice.modelId ?? '')
      setModelVersion(initialDevice.modelVersion ?? '')
      setStep('info')
    } else {
      setId('')
      setName('')
      setType('')
      setRoom('')
      setTags('')
      setModelId('')
      setModelVersion('')
      setSsid('')
      setWifiPass('')
      setMqttUrl(defaultMqttUrl)
      setMqttUser('')
      setMqttPass('')
      setBleLogs([])
      setFormError('')
      setAllocated(false)
      setStep('info')
      setBleState('idle')
    }
  }, [initialDevice, open, defaultMqttUrl])

  const handleCancel = async () => {
    if (allocated && bleState !== 'success' && id) { 
      try { await api.deleteDevice(id) } catch {} 
    }
    disconnect().catch(() => {})
    onCancel?.()
  }

  const buildDevice = (deviceId: string): Device => {
    const trimmedName = name.trim()
    const baseTopics = initialDevice?.topics ?? {}
    return {
      id: deviceId,
      name: trimmedName,
      type,
      room,
      tags: tags.split(/[;,]/).map(s => s.trim()).filter(Boolean),
      online: initialDevice?.online ?? false,
      lastSeen: initialDevice?.lastSeen ?? (0 as any),
      topics: { ...baseTopics },
      adapter: { kind: AdapterKind.MQTT, config: {} } as any,
      actions: [],
      state: initialDevice?.state ?? ({ fields: {} } as any),
      modelId,
      modelVersion,
      status: initialDevice?.status ?? DeviceStatus.ACTIVE,
    }
  }

  const submitInfo = async () => {
    if (!name && !id) return
    setSubmitting(true)
    setFormError('')
    if (!modelId || !modelVersion) {
      setFormError('请选择设备模型')
      setSubmitting(false)
      return
    }
    
    const device = buildDevice(id)
    try {
      const res = await onCreate?.(device)
      if (res && !res.ok) {
        setFormError(res.error || '保存失败')
        return
      }
    } catch (err: any) {
      setFormError(String(err?.message ?? err))
      return
    } finally {
      setSubmitting(false)
    }
  }

  const startProvisioning = async () => {
    if (!ssid || !wifiPass) { alert('请填写 Wi‑Fi 名称与密码'); return }
    if (!modelId || !modelVersion) { alert('请选择设备模型'); return }
    
    setBleState('running')
    setBleLogs([])
    let currentId = id

    try {
      if (!allocated && !currentId) {
        setBleLogs(prev => [...prev, { t: Date.now(), msg: '正在分配设备 ID...' }])
        const r = await api.reserveDevice({ modelId, modelVersion })
        if (!r.ok) throw new Error(`分配设备ID失败: ${r.error}`)
        const newId = r.deviceId || parseDeviceIdFromMessage(r.message)
        if (!newId) throw new Error(`分配设备ID失败: ${String(r.message || 'unknown')}`)
        currentId = newId
        setId(newId)
        setAllocated(true)
        setBleLogs(prev => [...prev, { t: Date.now(), msg: `已分配 ID: ${newId}`, ok: true }])
        
        setBleLogs(prev => [...prev, { t: Date.now(), msg: '正在保存设备基础信息...' }])
        const device = buildDevice(newId)
        const saveRes = await api.upsertDevice(device)
        if (!saveRes.ok) throw new Error(`保存设备信息失败: ${saveRes.error}`)
        setBleLogs(prev => [...prev, { t: Date.now(), msg: '基础信息保存成功', ok: true }])
      }

      if (!currentId) throw new Error('设备ID缺失')

      const res = await provision({ ssid, password: wifiPass, mqttUrl, deviceId: currentId, mqttUser, mqttPass }, (e) => {
        setBleLogs(prev => [...prev, { t: Date.now(), msg: `${e.stage}${e.message ? ': ' + e.message : ''}`, ok: e.ok }].slice(-50))
      })

      if (res.ok) {
        setBleLogs(prev => [...prev, { t: Date.now(), msg: '配网写入完成，等待设备上线...', ok: true }])
        setBleState('waiting')
        
        let onlineOk = false
        for (let i = 0; i < 30; i++) {
          const r = await api.listDevices({ ids: [currentId], includePending: true })
          if (r.ok && Array.isArray((r as any).devices)) {
            const found = (r as any).devices.find((d: any) => d.id === currentId)
            if (found && (found.online as any)) { onlineOk = true; break }
          }
          await new Promise(res => setTimeout(res, 1000))
        }

        if (onlineOk) {
          setBleLogs(prev => [...prev, { t: Date.now(), msg: '设备已成功上线！', ok: true }])
          setBleState('success')
        } else {
          setBleLogs(prev => [...prev, { t: Date.now(), msg: '等待上线超时', ok: false }])
          setBleState('error')
        }
      } else {
        setBleLogs(prev => [...prev, { t: Date.now(), msg: res.message || '配网失败', ok: false }])
        setBleState('error')
      }
    } catch (err: any) {
      console.error(err)
      setBleLogs(prev => [...prev, { t: Date.now(), msg: String(err?.message ?? err), ok: false }])
      setBleState('error')
    }
  }

  const availableModels = useMemo(() => {
    return (models ?? []).map(m => ({
      id: m.id,
      version: m.version,
      name: m.name || m.id,
    }))
  }, [models])

  useEffect(() => {
    if (!modelId || !modelVersion) return
    const picked = models.find(m => m.id === modelId && m.version === modelVersion)
    if (picked && !initialDevice) {
      setType(picked.name || picked.id)
    }
  }, [modelId, modelVersion, models, initialDevice])

  if (!open) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleCancel()
      }}
    >
      <DialogContent className="w-[560px] max-w-[92vw] rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl p-0 overflow-hidden flex flex-col max-h-[90vh] shadow-2xl border-none">
        <div className="flex items-center justify-between px-8 py-6">
          <div>
            <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-500 dark:from-white dark:to-slate-400">
              {initialDevice ? '编辑设备' : '添加新设备'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {step === 'info' ? '配置设备基础信息' : '设置 Wi-Fi 与配网'}
            </p>
          </div>
          <button 
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-slate-400"
            onClick={handleCancel}
          >
            ✕
          </button>
        </div>

        {!initialDevice && (
          <div className="px-8 flex items-center gap-3">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300",
              step === 'info' 
                ? "bg-prime-500 text-white shadow-lg shadow-prime-500/30" 
                : "bg-slate-100 dark:bg-slate-800 text-slate-400"
            )}>
              <span className={cn(
                "w-4 h-4 rounded-full flex items-center justify-center text-[10px]",
                step === 'info' ? "bg-white/20" : "bg-slate-200 dark:bg-slate-700"
              )}>1</span>
              基础信息
            </div>
            <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300",
              step === 'provision' 
                ? "bg-prime-500 text-white shadow-lg shadow-prime-500/30" 
                : "bg-slate-100 dark:bg-slate-800 text-slate-400"
            )}>
              <span className={cn(
                "w-4 h-4 rounded-full flex items-center justify-center text-[10px]",
                step === 'provision' ? "bg-white/20" : "bg-slate-200 dark:bg-slate-700"
              )}>2</span>
              网络配网
            </div>
          </div>
        )}

        <div className="p-8 overflow-y-auto scrollbar-hide min-h-[320px]">
          {formError && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 rounded-2xl border border-red-100 bg-red-50/50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/5 dark:text-red-300 flex items-center gap-2"
            >
              <span className="text-lg">⚠️</span>
              {formError}
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {step === 'info' ? (
              <motion.div 
                key="info"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="grid grid-cols-2 gap-5"
              >
                {initialDevice && (
                  <div className="col-span-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block px-1">设备 ID</label>
                    <Input readOnly value={id} className="font-mono text-xs bg-slate-50/50 dark:bg-slate-900/50 border-dashed" />
                  </div>
                )}
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block px-1">设备名称 <span className="text-red-500">*</span></label>
                  <Input 
                    autoFocus 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    placeholder="例如：客厅主灯" 
                    className="h-11 px-4 rounded-xl text-base"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block px-1">设备模型 <span className="text-red-500">*</span></label>
                  <Select
                    value={modelId && modelVersion ? `${modelId}@${modelVersion}` : ''}
                    onChange={e => {
                      const [mid, mver] = e.target.value.split('@')
                      setModelId(mid || '')
                      setModelVersion(mver || '')
                    }}
                    disabled={!!initialDevice}
                    className="h-11 px-4 rounded-xl"
                  >
                    <option value="">请选择模型</option>
                    {availableModels.map(m => (
                      <option key={`${m.id}@${m.version}`} value={`${m.id}@${m.version}`}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="col-span-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block px-1">设备类型</label>
                  <Input readOnly value={type} placeholder="自动填充" className="h-11 px-4 rounded-xl bg-slate-50/50 dark:bg-slate-900/50" />
                </div>
                <div className="col-span-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block px-1">部署房间</label>
                  <Input value={room} onChange={e => setRoom(e.target.value)} placeholder="living_room" className="h-11 px-4 rounded-xl" />
                </div>
                <div className="col-span-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block px-1">分类标签</label>
                  <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="tag1, tag2" className="h-11 px-4 rounded-xl" />
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="provision"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col gap-6"
              >
                <div className="rounded-2xl bg-blue-500/5 dark:bg-blue-500/10 p-5 border border-blue-500/10 dark:border-blue-500/20">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 shrink-0 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-blue-900 dark:text-blue-100 uppercase tracking-wide">设备配网指南</h3>
                      <p className="text-xs text-blue-700/70 dark:text-blue-300/60 mt-1 leading-relaxed">
                        请确保设备已开启并处于配对模式。我们将通过蓝牙安全地传输 Wi-Fi 信息到设备。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block px-1">Wi‑Fi 名称 (SSID)</label>
                    <Input 
                      value={ssid} 
                      onChange={e => setSsid(e.target.value)} 
                      placeholder="SSID" 
                      className="h-10 rounded-xl"
                      disabled={bleState === 'running'} 
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block px-1">Wi‑Fi 密码</label>
                    <Input 
                      type="password" 
                      value={wifiPass} 
                      onChange={e => setWifiPass(e.target.value)} 
                      placeholder="Password" 
                      className="h-10 rounded-xl"
                      disabled={bleState === 'running'} 
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block px-1">MQTT 代理服务器</label>
                    <Input 
                      value={mqttUrl} 
                      onChange={e => setMqttUrl(e.target.value)} 
                      placeholder="tcp://192.168.1.100:1883" 
                      className="h-10 rounded-xl font-mono text-xs"
                      disabled={bleState === 'running'} 
                    />
                  </div>
                </div>

                <div className="relative">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">实时执行日志</label>
                    {bleState === 'running' && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        <span className="text-[10px] text-blue-500 font-bold uppercase">Processing</span>
                      </div>
                    )}
                  </div>
                  <div className="rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-black/20 p-4 h-40 overflow-y-auto font-mono text-[10px] leading-relaxed scrollbar-hide shadow-inner">
                    {bleLogs.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50 italic">
                        <p>等待操作开始...</p>
                      </div>
                    ) : (
                      bleLogs.map((l, i) => (
                        <div key={i} className={cn(
                          "flex gap-3 mb-1.5",
                          l.ok === false ? 'text-red-500' : (l.ok ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-400')
                        )}>
                          <span className="opacity-30 shrink-0 font-bold tracking-tighter w-12">{new Date(l.t).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                          <span className="break-all">{l.msg}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="px-8 py-6 flex items-center justify-between border-t border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-white/5">
          {step === 'info' ? (
            <>
              <Button 
                variant="ghost" 
                onClick={handleCancel}
                className="text-slate-500 hover:text-slate-900 dark:hover:text-white px-6"
              >
                取消
              </Button>
              <div className="flex gap-3">
                {!initialDevice && (
                  <Button 
                    variant="outline"
                    onClick={() => {
                      if (!name) { setFormError('请输入设备名称'); return }
                      if (!modelId) { setFormError('请选择设备模型'); return }
                      setFormError('')
                      setStep('provision')
                    }}
                    className="border-prime-500/20 text-prime-600 hover:bg-prime-50 dark:hover:bg-prime-500/10 px-6"
                  >
                    配置网络
                  </Button>
                )}
                <Button 
                  disabled={submitting} 
                  className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 px-8 h-11 shadow-xl shadow-slate-900/10 dark:shadow-white/5"
                  onClick={submitInfo}
                >
                  {submitting ? '保存中...' : (initialDevice ? '更新设备' : '仅创建设备')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button 
                variant="ghost" 
                onClick={() => setStep('info')} 
                disabled={bleState === 'running' || bleState === 'success'}
                className="text-slate-500 hover:text-slate-900 dark:hover:text-white px-6"
              >
                ← 返回修改
              </Button>
              <div className="flex gap-3">
                {bleState === 'success' ? (
                  <Button 
                    className="bg-emerald-500 hover:bg-emerald-600 text-white min-w-[120px] h-11 rounded-xl shadow-lg shadow-emerald-500/20"
                    onClick={onCancel}
                  >
                    完成
                  </Button>
                ) : (
                  <Button 
                    disabled={bleState === 'running'} 
                    className={cn(
                      "h-11 rounded-xl px-8 shadow-xl transition-all duration-300",
                      bleState === 'error' 
                        ? "bg-red-500 text-white hover:bg-red-600 shadow-red-500/20" 
                        : "bg-prime-500 text-white hover:bg-prime-600 shadow-prime-500/20"
                    )}
                    onClick={startProvisioning}
                  >
                    {bleState === 'running' ? (
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        正在配网...
                      </div>
                    ) : (bleState === 'error' ? '重试配网' : '开始配网')}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

