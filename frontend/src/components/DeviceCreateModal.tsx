import { useState, useEffect, useMemo } from 'react'
import type { Device } from '../proto/home/service'
import { AdapterKind } from '../proto/home/service'
import { useBleProvisioning } from '../hooks/useBleProvisioning'

interface DeviceApi {
  listDevices: () => Promise<{ ok: boolean; devices?: Device[]; count?: number; error?: string }>
  upsertDevice: (device: Device) => Promise<{ ok: boolean; message?: string; error?: string }>
  deleteDevice: (deviceId: string) => Promise<{ ok: boolean; message?: string; error?: string }>
}

interface DeviceCreateModalProps {
  open: boolean
  onCancel?: () => void
  onCreate?: (device: Device) => Promise<void> | void
  initialDevice?: Device
  api: DeviceApi
}

function parseArgsSchema(input: string): Record<string, string> {
  const out: Record<string, string> = {}
  input.split(/[;,\n]/).map(s => s.trim()).filter(Boolean).forEach(pair => {
    const idx = pair.indexOf('=')
    if (idx > 0) {
      const k = pair.slice(0, idx).trim()
      const v = pair.slice(idx + 1).trim()
      if (k) out[k] = v
    } else {
      out[pair] = ''
    }
  })
  return out
}

export function DeviceCreateModal({ open, onCancel, onCreate, initialDevice, api }: DeviceCreateModalProps) {
  const [id, setId] = useState(initialDevice?.id ?? '')
  const [name, setName] = useState(initialDevice?.name ?? '')
  const [type, setType] = useState(initialDevice?.type ?? '')
  const [room, setRoom] = useState(initialDevice?.room ?? '')
  const [tags, setTags] = useState((initialDevice?.tags ?? []).join(','))
  const [adapterKind, setAdapterKind] = useState<AdapterKind>(initialDevice?.adapter?.kind ?? AdapterKind.MQTT)
  const [actions, setActions] = useState<Array<{ name: string; args: string; timeout: number }>>(
    (initialDevice?.actions ?? []).length > 0
      ? (initialDevice!.actions as any).map((a: any) => ({ name: a.name, args: Object.entries(a.argsSchema ?? {}).map(([k, v]) => `${k}=${v as string}`).join(';'), timeout: Number(a.timeoutMs ?? 2000) }))
      : [{ name: '', args: '', timeout: 2000 }]
  )
  const [submitting, setSubmitting] = useState(false)
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
      setAdapterKind(initialDevice.adapter?.kind ?? AdapterKind.MQTT)
      setActions(
        (initialDevice.actions ?? []).length > 0
          ? (initialDevice.actions as any).map((a: any) => ({
              name: a.name,
              args: Object.entries(a.argsSchema ?? {}).map(([k, v]) => `${k}=${v as string}`).join(';'),
              timeout: Number(a.timeoutMs ?? 2000)
            }))
          : [{ name: '', args: '', timeout: 2000 }]
      )
    } else {
      // 重置为空状态
      setId('')
      setName('')
      setType('')
      setRoom('')
      setTags('')
      setAdapterKind(AdapterKind.MQTT)
      setActions([{ name: '', args: '', timeout: 2000 }])
      setSsid('')
      setWifiPass('')
      setMqttUrl(defaultMqttUrl)
      setMqttUser('')
      setMqttPass('')
      setBleLogs([])
      setAllocated(false)
      setStep('init')
      if (open) {
        (async () => {
          try {
            const r = await api.upsertDevice({
              id: '' as any,
              name: '', type: '', room: '', tags: [],
              online: false, lastSeen: 0 as any, topics: {},
              adapter: { kind: AdapterKind.MQTT, config: {} } as any,
              actions: [], state: { fields: {} } as any,
            } as any)
            if (r.ok) {
              const msg = String(r.message || '')
              const m = msg.match(/^created:(.+)$/)
              if (m) {
                setId(m[1])
                setAllocated(true)
                setStep('ble')
                setBleLogs(prev => [...prev, { t: Date.now(), msg: `已分配设备ID: ${m[1]}`, ok: true }])
              } else {
                setBleLogs(prev => [...prev, { t: Date.now(), msg: `分配设备ID失败: ${msg}`, ok: false }])
              }
            } else {
              setBleLogs(prev => [...prev, { t: Date.now(), msg: `分配设备ID失败: ${r.error}`, ok: false }])
            }
          } catch (e: any) {
            setBleLogs(prev => [...prev, { t: Date.now(), msg: `分配设备ID异常: ${String(e?.message ?? e)}`, ok: false }])
          }
        })()
      }
    }
  }, [initialDevice, open])

  if (!open) return null

  const submit = async () => {
    if (!name && !id) return
    setSubmitting(true)
    const device: Device = {
      id: id,
      name,
      type,
      room,
      tags: tags.split(/[;,]/).map(s => s.trim()).filter(Boolean),
      online: false,
      lastSeen: 0 as any,
      topics: {},
      adapter: { kind: adapterKind, config: {} },
      actions: actions.filter(a => a.name.trim()).map(a => ({ name: a.name.trim(), argsSchema: parseArgsSchema(a.args), timeoutMs: a.timeout as any })),
      state: { fields: {} } as any,
    }
    try {
      await onCreate?.(device)
    } finally {
      setSubmitting(false)
    }
  }

  const addAction = () => setActions(prev => [...prev, { name: '', args: '', timeout: 2000 }])
  const removeAction = (i: number) => setActions(prev => prev.filter((_, idx) => idx !== i))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[560px] max-w-[92vw] rounded-2xl bg-white dark:bg-surface p-4 border border-black/10 dark:border-white/10 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">{initialDevice ? '编辑设备' : '添加设备'}</div>
          <button className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5" onClick={onCancel}>✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {initialDevice && (
          <div className="col-span-1">
            <label className="text-xs text-slate-500">设备 ID</label>
            <input readOnly className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={id} />
          </div>
          )}
          <div className="col-span-1">
            <label className="text-xs text-slate-500">名称</label>
            <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={name} onChange={e => setName(e.target.value)} placeholder="例如：客厅灯" />
          </div>
          <div className="col-span-1">
            <label className="text-xs text-slate-500">类型</label>
            <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={type} onChange={e => setType(e.target.value)} placeholder="light/thermostat 等" />
          </div>
          <div className="col-span-1">
            <label className="text-xs text-slate-500">房间</label>
            <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={room} onChange={e => setRoom(e.target.value)} placeholder="living/bedroom 等" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-500">标签（逗号分隔）</label>
            <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={tags} onChange={e => setTags(e.target.value)} placeholder="tag1,tag2" />
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
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-1">
              <label className="text-xs text-slate-500">Wi‑Fi SSID</label>
              <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={ssid} onChange={e => setSsid(e.target.value)} placeholder="路由器名称" />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-slate-500">Wi‑Fi 密码</label>
              <input type="password" className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={wifiPass} onChange={e => setWifiPass(e.target.value)} placeholder="至少 8 位" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-500">MQTT URL</label>
              <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={mqttUrl} onChange={e => setMqttUrl(e.target.value)} placeholder="tcp://192.168.1.100:1883" />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-slate-500">MQTT 用户（可选）</label>
              <input className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={mqttUser} onChange={e => setMqttUser(e.target.value)} placeholder="用户名" />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-slate-500">MQTT 密码（可选）</label>
              <input type="password" className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={mqttPass} onChange={e => setMqttPass(e.target.value)} placeholder="密码" />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              disabled={bleRunning}
              className="px-3 py-2 text-sm rounded-xl bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700 disabled:opacity-50"
              onClick={async () => {
                if (!ssid || !wifiPass) { alert('请填写 Wi‑Fi 名称与密码'); return }
                setBleRunning(true)
                setBleLogs([])
                try {
                  // 1) 分配设备ID（仅当尚未分配）
                  if (!allocated) {
                    const r = await api.upsertDevice({
                      id: '' as any,
                      name: '', type: '', room: '', tags: [],
                      online: false, lastSeen: 0 as any, topics: {},
                      adapter: { kind: AdapterKind.MQTT, config: {} } as any,
                      actions: [], state: { fields: {} } as any,
                    } as any)
                    if (!r.ok) throw new Error(`分配设备ID失败: ${r.error}`)
                    const msg = String(r.message || '')
                    const m = msg.match(/^created:(.+)$/)
                    if (!m) throw new Error(`分配设备ID失败: ${msg}`)
                    setId(m[1])
                    setAllocated(true)
                    setStep('ble')
                    setBleLogs(prev => [...prev, { t: Date.now(), msg: `已分配设备ID: ${m[1]}`, ok: true }])
                  }

                  const res = await provision({ ssid, password: wifiPass, mqttUrl, deviceId: id, mqttUser, mqttPass }, (e) => {
                    setBleLogs(prev => [...prev, { t: Date.now(), msg: `${e.stage}${e.message ? ': ' + e.message : ''}`, ok: e.ok }].slice(-50))
                  })
                  if (res.ok) {
                    setBleLogs(prev => [...prev, { t: Date.now(), msg: '配网完成，等待设备上线...', ok: true }])
                    setStep('waiting')
                    // 轮询等待设备上线（最多 30 秒）
                    let onlineOk = false
                    for (let i = 0; i < 30; i++) {
                      const r = await api.listDevices()
                      if (r.ok && Array.isArray((r as any).devices)) {
                        const found = (r as any).devices.find((d: any) => d.id === id)
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
                      try { if (allocated && id) { await api.deleteDevice(id) } } catch {}
                      setAllocated(false)
                      setId('')
                      setStep('ble')
                    }
                  } else {
                    setBleLogs(prev => [...prev, { t: Date.now(), msg: res.message || '配网失败', ok: false }])
                    try { if (allocated && id) { await api.deleteDevice(id) } } catch {}
                    setAllocated(false)
                    setId('')
                    setStep('ble')
                  }
                } catch (err: any) {
                  setBleLogs(prev => [...prev, { t: Date.now(), msg: String(err?.message ?? err), ok: false }])
                  try { if (allocated && id) { await api.deleteDevice(id) } } catch {}
                  setAllocated(false)
                  setId('')
                  setStep('ble')
                } finally {
                  setBleRunning(false)
                }
              }}
            >{bleRunning ? '蓝牙进行中...' : '开始蓝牙配网'}</button>
            <button
              className="px-3 py-2 text-sm rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"
              onClick={() => { disconnect().catch(()=>{}); setBleLogs(prev => [...prev, { t: Date.now(), msg: '已断开蓝牙' }]) }}
            >断开</button>
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

        <div className="mt-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs text-slate-500">动作列表</label>
              <div className="text-xs text-slate-400 mt-1">定义设备支持的操作，如开关、调节等</div>
            </div>
            <button className="text-xs px-2 py-1 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5" onClick={addAction}>+ 添加动作</button>
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {actions.map((a, i) => (
              <div key={i} className="grid grid-cols-6 gap-2 items-center">
                <input className="col-span-2 rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" placeholder="动作名，如 power" value={a.name} onChange={e => setActions(prev => prev.map((x, idx) => idx===i? {...x, name: e.target.value}: x))} />
                <input className="col-span-3 rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" placeholder="参数：brightness=80;color=red" value={a.args} onChange={e => setActions(prev => prev.map((x, idx) => idx===i? {...x, args: e.target.value}: x))} />
                <div className="col-span-1 flex items-center gap-2">
                  <input type="number" className="w-24 rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-2 py-1" value={a.timeout} onChange={e => setActions(prev => prev.map((x, idx) => idx===i? {...x, timeout: Number(e.target.value)}: x))} />
                  <button className="text-xs px-2 py-1 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5" onClick={() => removeAction(i)}>删</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5" onClick={async () => {
            if (allocated && step !== 'done' && id) { try { await api.deleteDevice(id) } catch {} }
            onCancel?.()
          }}>取消</button>
          <button disabled={submitting} className="px-3 py-2 rounded-xl bg-gradient-to-r from-prime-500 to-prime-600 text-white hover:from-prime-600 hover:to-prime-700 disabled:opacity-50" onClick={submit}>{initialDevice ? '保存' : '创建'}</button>
        </div>
      </div>
    </div>
  )
}
