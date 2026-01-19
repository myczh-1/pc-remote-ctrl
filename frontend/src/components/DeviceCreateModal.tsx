import { useState, useEffect, useMemo } from 'react'
import type { Device, DeviceModel } from '../proto/home/service'
import { AdapterKind, DeviceStatus } from '../proto/home/service'
import { useBleProvisioning } from '../hooks/useBleProvisioning'
import type { DeviceListParams } from '../hooks/useHomeApi'
import { Dialog, DialogContent } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select } from './ui/select'

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
  // BLE provisioning inputs
  const [ssid, setSsid] = useState('')
  const [wifiPass, setWifiPass] = useState('')
  const defaultMqttUrl = useMemo(() => ((import.meta as any).env?.VITE_MQTT_URL as string) || 'tcp://192.168.30.64:1883', [])
  const [mqttUrl, setMqttUrl] = useState<string>(defaultMqttUrl)
  const [mqttUser, setMqttUser] = useState('')
  const [mqttPass, setMqttPass] = useState('')
  const [bleRunning, setBleRunning] = useState(false)
  const [bleLogs, setBleLogs] = useState<Array<{ t: number; msg: string; ok?: boolean }>>([])
  const { provision, disconnect } = useBleProvisioning()
  const [step, setStep] = useState<'init' | 'ble' | 'waiting' | 'done'>('init')
  const [allocated, setAllocated] = useState(false)

  // 当 initialDevice 变化时同步状态
  useEffect(() => {
    if (initialDevice) {
      setId(initialDevice.id ?? '')
      setName(initialDevice.name ?? '')
      setType(initialDevice.type ?? '')
      setRoom(initialDevice.room ?? '')
      setTags((initialDevice.tags ?? []).join(','))
      setModelId(initialDevice.modelId ?? '')
      setModelVersion(initialDevice.modelVersion ?? '')
    } else {
      // 重置为空状态
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
      setStep('init')
    }
  }, [initialDevice, open])

  const handleCancel = async () => {
    if (allocated && step !== 'done' && id) { try { await api.deleteDevice(id) } catch {} }
    onCancel?.()
  }

  const submit = async () => {
    if (!name && !id) return
    setSubmitting(true)
    setFormError('')
    if (!modelId || !modelVersion) {
      setFormError('请选择设备模型')
      setSubmitting(false)
      return
    }
    const trimmedName = name.trim()
    const baseTopics = initialDevice?.topics ?? {}
    const device: Device = {
      id: id,
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
      status: initialDevice?.status ?? DeviceStatus.DEVICE_STATUS_ACTIVE,
    }
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

  const availableModels = useMemo(() => {
    return (models ?? []).map(m => ({
      id: m.id,
      version: m.version,
      name: m.name || m.id,
    }))
  }, [models])

  useEffect(() => {
    if (!modelId || !modelVersion) {
      return
    }
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
        if (!nextOpen) onCancel?.()
      }}
    >
      <DialogContent className="w-[560px] max-w-[92vw] rounded-2xl bg-white/80 p-4 dark:bg-surface/80">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">{initialDevice ? '编辑设备' : '添加设备'}</div>
          <button className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5" onClick={onCancel}>✕</button>
        </div>

        {formError && <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{formError}</div>}
        <div className="grid grid-cols-2 gap-3">
          {initialDevice && (
          <div className="col-span-1">
            <label className="text-xs text-slate-500">设备 ID</label>
            <Input readOnly value={id} />
          </div>
          )}
          <div className="col-span-1">
            <label className="text-xs text-slate-500">名称</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="例如：客厅灯" />
          </div>
          <div className="col-span-1">
            <label className="text-xs text-slate-500">设备模型</label>
            <Select
              value={modelId && modelVersion ? `${modelId}@${modelVersion}` : ''}
              onChange={e => {
                const [mid, mver] = e.target.value.split('@')
                setModelId(mid || '')
                setModelVersion(mver || '')
              }}
            >
              <option value="">请选择模型</option>
              {availableModels.map(m => (
                <option key={`${m.id}@${m.version}`} value={`${m.id}@${m.version}`}>
                  {m.name} ({m.id}@{m.version})
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-1">
            <label className="text-xs text-slate-500">类型</label>
            <Input readOnly value={type} placeholder="来自设备模型" />
          </div>
          <div className="col-span-1">
            <label className="text-xs text-slate-500">房间</label>
            <Input value={room} onChange={e => setRoom(e.target.value)} placeholder="living/bedroom 等" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-500">标签（逗号分隔）</label>
            <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="tag1,tag2" />
          </div>
          {/* 适配器选项移除：当前仅支持 MQTT，UI 不再展示 */}
        </div>

        {/* BLE 配网（仅新增时显示） */}
        {!initialDevice && (
        <div className="mt-3 p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-medium">蓝牙配网（Web Bluetooth）</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">在本机通过蓝牙为设备写入 Wi‑Fi 与 MQTT 参数</div>
              <div className="text-xs text-slate-400 dark:text-slate-500">配网期间设备会以 pending 暂存，提交后才会显示在列表中</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-1">
              <label className="text-xs text-slate-500">Wi‑Fi SSID</label>
              <Input value={ssid} onChange={e => setSsid(e.target.value)} placeholder="路由器名称" />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-slate-500">Wi‑Fi 密码</label>
              <Input type="password" value={wifiPass} onChange={e => setWifiPass(e.target.value)} placeholder="至少 8 位" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-500">MQTT URL</label>
              <Input value={mqttUrl} onChange={e => setMqttUrl(e.target.value)} placeholder="tcp://192.168.1.100:1883" />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-slate-500">MQTT 用户（可选）</label>
              <Input value={mqttUser} onChange={e => setMqttUser(e.target.value)} placeholder="用户名" />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-slate-500">MQTT 密码（可选）</label>
              <Input type="password" value={mqttPass} onChange={e => setMqttPass(e.target.value)} placeholder="密码" />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              disabled={bleRunning}
              className="px-3 py-2 text-sm rounded-xl bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700"
              onClick={async () => {
                if (!ssid || !wifiPass) { alert('请填写 Wi‑Fi 名称与密码'); return }
                if (!modelId || !modelVersion) { alert('请选择设备模型'); return }
                setBleRunning(true)
                setBleLogs([])
                let currentId = id
                try {
                  // 1) 分配设备ID（仅当尚未分配）
                  if (!allocated) {
                    const r = await api.reserveDevice({ modelId, modelVersion })
                    if (!r.ok) throw new Error(`分配设备ID失败: ${r.error}`)
                    const newId = r.deviceId || parseDeviceIdFromMessage(r.message)
                    if (!newId) throw new Error(`分配设备ID失败: ${String(r.message || 'unknown')}`)
                    currentId = newId
                    setId(newId)
                    setAllocated(true)
                    setStep('ble')
                    setBleLogs(prev => [...prev, { t: Date.now(), msg: `已分配设备ID: ${newId}`, ok: true }])
                  } else if (!currentId) {
                    throw new Error('设备ID缺失，请重新开始配网')
                  }

                  const res = await provision({ ssid, password: wifiPass, mqttUrl, deviceId: currentId, mqttUser, mqttPass }, (e) => {
                    setBleLogs(prev => [...prev, { t: Date.now(), msg: `${e.stage}${e.message ? ': ' + e.message : ''}`, ok: e.ok }].slice(-50))
                  })
                  if (res.ok) {
                    setBleLogs(prev => [...prev, { t: Date.now(), msg: '配网完成，等待设备上线...', ok: true }])
                    setStep('waiting')
                    // 轮询等待设备上线（最多 30 秒）
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
                      setBleLogs(prev => [...prev, { t: Date.now(), msg: '设备已上线', ok: true }])
                      await submit()
                      setStep('done')
                    } else {
                      setBleLogs(prev => [...prev, { t: Date.now(), msg: '等待上线超时', ok: false }])
                      try { if (allocated && currentId) { await api.deleteDevice(currentId) } } catch {}
                      setAllocated(false)
                      setId('')
                      setStep('ble')
                    }
                  } else {
                    setBleLogs(prev => [...prev, { t: Date.now(), msg: res.message || '配网失败', ok: false }])
                    try { if (allocated && currentId) { await api.deleteDevice(currentId) } } catch {}
                    setAllocated(false)
                    setId('')
                    setStep('ble')
                  }
                } catch (err: any) {
                  setBleLogs(prev => [...prev, { t: Date.now(), msg: String(err?.message ?? err), ok: false }])
                  try { if (allocated && currentId) { await api.deleteDevice(currentId) } } catch {}
                  setAllocated(false)
                  setId('')
                  setStep('ble')
                } finally {
                  setBleRunning(false)
                }
              }}
            >{bleRunning ? '蓝牙进行中...' : '开始蓝牙配网'}</Button>
            <Button
              variant="outline"
              className="px-3 py-2 text-sm"
              onClick={() => { disconnect().catch(()=>{}); setBleLogs(prev => [...prev, { t: Date.now(), msg: '已断开蓝牙' }]) }}
            >断开</Button>
          </div>
          {bleLogs.length > 0 && (
            <div className="mt-2 max-h-32 overflow-auto rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 p-2 text-xs">
              {bleLogs.map((l, i) => (
                <div key={i} className={l.ok === false ? 'text-red-500' : (l.ok ? 'text-emerald-600' : 'text-slate-500')}>
                  {new Date(l.t).toLocaleTimeString()} · {l.msg}
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        <div className="mt-3 rounded-lg border border-dashed border-black/10 dark:border-white/10 p-3 text-xs text-slate-500">
          动作与协议来自设备模型，不可在设备实例中修改。
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" className="px-3 py-2 rounded-lg" onClick={handleCancel}>取消</Button>
          <Button disabled={submitting} className="px-3 py-2 rounded-xl bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700" onClick={submit}>{initialDevice ? '保存' : '创建'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
